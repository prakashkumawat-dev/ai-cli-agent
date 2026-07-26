import {
    AIMessage,
    HumanMessage,
    ToolMessage,
    type BaseMessage,
    SystemMessage
} from "@langchain/core/messages";
import { isLangChainTool } from "@langchain/core/tools";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { ChatGoogle } from '@langchain/google'
import type {
    StructuredToolInterface,
} from "@langchain/core/tools";
import type { Dispatch, SetStateAction } from 'react';
import { START, END, StateGraph, StateSchema, Command, interrupt } from '@langchain/langgraph';
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import z from 'zod';
import type { CompiledStateGraph } from "@langchain/langgraph";
import { v4 as uuid } from 'uuid';

export function countTokensApproximately(
    messages: BaseMessage[],
    tools?: Array<Record<string, any>> | null
): number {
    const charsPerToken = 4;
    let totalChars = 0;

    // Count tokens for tools if provided
    if (tools && tools.length > 0) {
        let toolsChars = 0;
        for (const tool of tools) {
            const toolDict = isLangChainTool(tool) ? convertToOpenAITool(tool) : tool;
            toolsChars += JSON.stringify(toolDict).length;
        }
        totalChars += toolsChars;
    }

    for (const msg of messages) {
        let textContent: string;
        if (typeof msg.content === "string") {
            textContent = msg.content;
        } else if (Array.isArray(msg.content)) {
            textContent = msg.content
                .map((item) => {
                    if (typeof item === "string") return item;
                    if (item.type === "text" && "text" in item) return item.text;
                    return "";
                })
                .join("");
        } else {
            textContent = "";
        }

        if (
            AIMessage.isInstance(msg) &&
            Array.isArray(msg.tool_calls) &&
            msg.tool_calls.length > 0
        ) {
            textContent += JSON.stringify(msg.tool_calls);
        }

        if (ToolMessage.isInstance(msg)) {
            textContent += msg.tool_call_id ?? "";
            textContent += msg.name;
            // textContent += msg.content
            if (typeof msg.content === "string") {
                textContent += msg.content
            } else if (Array.isArray(msg.content)) {
                // Process content blocks if it's not just a string
                textContent += msg.content.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join("");
            }
        }

        totalChars += textContent.length;
    }
    // Approximate 1 token = 4 characters
    return Math.ceil(totalChars / charsPerToken);
};

export function hasToolCalls(message?: BaseMessage): boolean {
    return Boolean(
        AIMessage.isInstance(message) &&
        message.tool_calls &&
        message.tool_calls.length > 0
    );
}

// finds the safe cutoff for compacting context window. it returns the number of index that is excluded from preserving messages
// those msg to be summarize they included cut off index element.
export const findSafeCutOff = (messages: BaseMessage[], MESSAGES_TO_KEEP: number): number => {

    const LENGTH_OF_MESSAGES_LIST = messages.length;
    const CUT_OFF_INDEX = (LENGTH_OF_MESSAGES_LIST - MESSAGES_TO_KEEP) - 1;

    let SAFE_CUT_OFF_INDEX: number;

    if (hasToolCalls(messages[CUT_OFF_INDEX])) {
        SAFE_CUT_OFF_INDEX = CUT_OFF_INDEX - 1;

        return SAFE_CUT_OFF_INDEX;
    } else if (ToolMessage.isInstance(messages[CUT_OFF_INDEX])) {

        let index = CUT_OFF_INDEX;

        while (ToolMessage.isInstance(messages[index + 1])) {
            index++;
        };

        if (AIMessage.isInstance(messages[index + 1]) && (messages[index + 1] as any).tool_calls.length === 0) {
            index += 1;
            if (HumanMessage.isInstance(messages[index + 1])) {
                index += 1;
                return index;
            };
            return index;
        };

        return index;

    } else if (AIMessage.isInstance(messages[CUT_OFF_INDEX]) && (messages[CUT_OFF_INDEX] as any).tool_calls.length === 0) {
        SAFE_CUT_OFF_INDEX = CUT_OFF_INDEX + 1;
        return SAFE_CUT_OFF_INDEX;
    } else {
        SAFE_CUT_OFF_INDEX = CUT_OFF_INDEX;
        return SAFE_CUT_OFF_INDEX;
    }
};

export const convertToOpenAiMessageFormat = (messages: BaseMessage[]) => {
    const modifiedList = messages.map((element) => {
        if (HumanMessage.isInstance(element)) {
            return {
                role: "human",
                content: element.content
            }
        } else if (AIMessage.isInstance(element)) {
            if (element.tool_calls && element.tool_calls.length > 0) {
                return {
                    role: "ai",
                    content: {
                        tool_calls: element.tool_calls,
                        text: element.content ? element.content : null
                    }
                }
            } else {
                return {
                    role: "ai",
                    content: element.content
                }
            }

        } else if (ToolMessage.isInstance(element)) {
            return {
                role: "tool",
                content: {
                    name: element.name,
                    tool_call_id: element.tool_call_id,
                    text: element.content
                }
            }
        } else if (SystemMessage.isInstance(element)) {
            return {
                role: "system",
                content: element.content
            }
        }
    });

    return `${modifiedList.map((value) => JSON.stringify(value)).join('\n')}`
};

type API = {
    GEMINI_API_KEY: string,
    TAVILY_API_KEY: string,
} | { Error: string };

export const getapikeys = async (): Promise<API> => {
    try {
        const filepath = path.join(os.homedir(), 'my-cli/config.json');
        const data = await readFile(filepath, { encoding: "utf-8" });
        const keys: { GEMINI_API_KEY: string, TAVILY_API_KEY: string } = JSON.parse(data);

        return {
            GEMINI_API_KEY: keys.GEMINI_API_KEY,
            TAVILY_API_KEY: keys.TAVILY_API_KEY
        }
    } catch (error) {
        if (error instanceof Error) {
            return {
                Error: error.message.toString()
            }
        }
        return {
            Error: (error as string).toString()
        }
    }
};

//keys
let keys: {
    GEMINI_API_KEY: null | string,
    TAVILY_API_KEY: null | string
} = {
    GEMINI_API_KEY: null,
    TAVILY_API_KEY: null
}


// creates the llm model  
export const createModel = async ({ modelName, tools }: { modelName: string, tools?: StructuredToolInterface[] }) => {

    if (!keys.GEMINI_API_KEY && !keys.TAVILY_API_KEY) {

        const result = await getapikeys();

        if (!("Error" in result)) {
            keys.GEMINI_API_KEY = result.GEMINI_API_KEY
            keys.TAVILY_API_KEY = result.TAVILY_API_KEY
        }
    }

    if (tools) {
        const model = new ChatGoogle({
            model: modelName,
            apiKey: keys.GEMINI_API_KEY as string,
            tools
        });
        return model;
    } else {
        const model = new ChatGoogle({
            apiKey: keys.GEMINI_API_KEY as string,
            model: modelName
        })
        return model
    }
};


// createSubAgent function for creating subagents

const requiredTools = {
    "write_file": "write_file",
    "edit_file": "edit_file",
    "run_shell_command": "run_shell_command",
    "read_file": "read_file"
};

type MessageTypes = {
    id: string,
    type: "human" | "llm" | "tool" | "logo" | "description" | "info",
    message: string,
    toolname?: string,
    toolargs?: string,
}

interface MSG {
    id: string
    message: MessageTypes[]
};

export const createSubAgent = ({ modelName, tools, systemPrompt, allowParallel = false, checkPointer, setMessages }: { modelName: string, tools: StructuredToolInterface[], systemPrompt: string, allowParallel: boolean, checkPointer?: boolean, setMessages: Dispatch<SetStateAction<MSG>> }): CompiledStateGraph<any, any, any, any, any, any> => {

    // system prompt
    const SYSTEM_PROMPT = new SystemMessage(systemPrompt);


    // subgraph state
    const ToolInfoSchema = z.object({
        id: z.string(),
        name: z.string(),
        args: z.any(),
    });

    const ToolRequestSchema = z.object({
        type: z.enum(["agent", "normal"]),
        toolInfo: z.array(ToolInfoSchema),
    });

    const SUBAGENTSTATE = new StateSchema({
        // parent state
        parentMessages: z.array(z.any()),
        errorMessage: z.string(),
        toolRequests: z.array(ToolRequestSchema),
        toolIndex: z.number(),

        // sub agent state
        subAgentMessageList: z.array(z.any()),
        allowedToolsForSession: z.array(z.any()),
        requiredToolsForPermision: z.array(z.any()),
        taskId: z.string()
    });


    // types for suggestions
    const stateType = z.object({
        // parent state
        parentMessages: z.array(z.any()),
        errorMessage: z.string(),
        toolRequests: z.array(ToolRequestSchema),
        toolIndex: z.number(),

        // sub agent state
        subAgentMessageList: z.array(z.any()),
        allowedToolsForSession: z.array(z.any()),
        requiredToolsForPermision: z.array(z.any()),
        taskId: z.string()
    });


    // llm model
    // const model = createModel({ apiKey, modelName: modelName, tools })

    // sub graphs nodes

    // compact node

    const subCompactNode = async (state: z.infer<typeof stateType>, config: LangGraphRunnableConfig) => {
        try {

            // console.log(`🔥 from subCompact`);


            if (!state.subAgentMessageList || state.subAgentMessageList.length === 0) {
                return new Command({ goto: "subMockLlmNode" })
            };

            const total_tokens = countTokensApproximately(state.subAgentMessageList, tools);
            const lenghtOfmessages = state.subAgentMessageList.length;
            const MESSAGES_TO_KEEP = 10;

            if (total_tokens >= 15000 && lenghtOfmessages >= 15) {
                if (config.writer) {
                    config.writer({ status: `Compacting the context window...` });
                }

                const SAFE_CUT_OFF = findSafeCutOff(state.subAgentMessageList, MESSAGES_TO_KEEP);

                const preservedSystemPrompt = state.subAgentMessageList[0];

                const preservedMessages = state.subAgentMessageList.slice(SAFE_CUT_OFF + 1);

                // messages to summarise
                const messagesTosummarise = state.subAgentMessageList.slice(1, SAFE_CUT_OFF + 1);
                const filteredMessages = convertToOpenAiMessageFormat(messagesTosummarise);

                const sumarizerllm = await createModel({ modelName });


                //🤬 SYSTEM_PROMPT is panding here ------------
                const generatedSummary = await sumarizerllm.invoke([new SystemMessage("you are the conversation summarizer. remove irelavant info and take only relavant info"), new HumanMessage(`here is the conversation to date\n\n${filteredMessages}`)])

                if (config.writer && generatedSummary.usage_metadata) {
                    config.writer({
                        tokenUsed: (generatedSummary.usage_metadata as any).total_tokens,

                    });
                }

                const human_message = new HumanMessage(`this is the summary and memory of us previews conversation\n\n${generatedSummary.content}`);

                return new Command({ goto: "subMockLlmNode", update: { subAgentMessageList: [preservedSystemPrompt, human_message, ...preservedMessages] } });
            } else {
                return new Command({ goto: "subMockLlmNode" });
            }

        } catch (error) {
            if (error instanceof Error) {
                return new Command({ update: { errorMessage: `${error.message}` }, goto: END })
            }
            return new Command({ update: { errorMessage: `${error}` }, goto: END })
        }
    }

    // submockllm node
    const subMockLlmNode = async (state: z.infer<typeof stateType>, config: LangGraphRunnableConfig) => {
        // console.log(`💧 from subMockllm msgLength: ${state.subAgentMessageList ? state.subAgentMessageList.length : "null"}`);

        try {
            const model = await createModel({ modelName: modelName, tools });
            
            const tool_id = (state.toolRequests[state.toolIndex]?.toolInfo[0] as any).id as string
            const tool_name = (state.toolRequests[state.toolIndex]?.toolInfo[0] as any).name as string

            // checking , is it same task or not
            if (state.taskId && (state.toolRequests[state.toolIndex]?.toolInfo[0] as any).id === state.taskId) {

                if (config.writer) {
                    config.writer({ status: `Thinking...` });
                }

                const responce = await model.invoke([...state.subAgentMessageList]);


                if (config.writer && responce.usage_metadata) {
                    config.writer({
                        tokenUsed: (responce.usage_metadata as any).total_tokens,

                    });
                }

                if (responce.tool_calls && responce.tool_calls.length > 0) {
                    // console.log(`⚒️ToolCallSubMockllm`);
                    const aiMessage = new AIMessage({ content: responce.content, tool_calls: responce.tool_calls })
                    return new Command({ update: { subAgentMessageList: [...state.subAgentMessageList, aiMessage] }, goto: "subFilterToolsNode" });

                } else {
                    const aiMessage = new AIMessage({ content: responce.content })
                    // console.log(`🎉responceOfSubMockLLM:\n ${responce.content}`);
                    const toolMessage = new ToolMessage({ tool_call_id: tool_id, name: tool_name, content: responce.content })
                    return new Command({ update: { subAgentMessageList: [...state.subAgentMessageList, aiMessage], parentMessages: [...state.parentMessages, toolMessage], toolIndex: state.toolIndex + 1 }, goto: END })
                }

            } else {
                if (state.subAgentMessageList && state.subAgentMessageList.length > 0) {
                    const human_message = new HumanMessage({ content: (state.toolRequests[state.toolIndex]?.toolInfo[0] as any).args.description })
                    if (config.writer) {
                        config.writer({ status: `Thinking...` });
                    }
                    const responce = await model.invoke([...state.subAgentMessageList, human_message]);

                    if (config.writer && responce.usage_metadata) {
                        config.writer({
                            tokenUsed: (responce.usage_metadata as any).total_tokens,

                        });
                    }

                    if (responce.tool_calls && responce.tool_calls.length > 0) {
                        // console.log(`⚒️ToolCallSubMockllm`);
                        const aiMessage = new AIMessage({ content: responce.content, tool_calls: responce.tool_calls })
                        return new Command({ update: { subAgentMessageList: [...state.subAgentMessageList, aiMessage] }, goto: "subFilterToolsNode" });

                    } else {
                        const aiMessage = new AIMessage({ content: responce.content })
                        // console.log(`🎯 responceOfSubMockLLM:\n ${responce.content}`);
                        const toolMessage = new ToolMessage({ tool_call_id: tool_id, name: tool_name, content: responce.content })
                        return new Command({ update: { subAgentMessageList: [...state.subAgentMessageList, aiMessage], parentMessages: [...state.parentMessages, toolMessage], toolIndex: state.toolIndex + 1 }, goto: END })
                    }

                } else {
                    if (config.writer) {
                        config.writer({ status: `Thinking...` });
                    }

                    const human_message = new HumanMessage({ content: (state.toolRequests[state.toolIndex]?.toolInfo[0] as any).args.description })

                    // console.log(`🙎🏻‍♂️ SubhumanMessage\n${human_message}`);
                    const responce = await model.invoke([SYSTEM_PROMPT, human_message]);

                    if (config.writer && responce.usage_metadata) {
                        config.writer({
                            tokenUsed: (responce.usage_metadata as any).total_tokens,

                        });
                    }

                    if (responce.tool_calls && responce.tool_calls.length > 0) {
                        // console.log(`⚒️ToolCallSubMockllm`);
                        const aiMessage = new AIMessage({ content: responce.content, tool_calls: responce.tool_calls })
                        return new Command({ update: { subAgentMessageList: [SYSTEM_PROMPT, human_message, aiMessage] }, goto: "subFilterToolsNode" });

                    } else {
                        const aiMessage = new AIMessage({ content: responce.content })
                        // console.log(`🎖️ responceOfSubMockLLM:\n ${responce.content}`);
                        const toolMessage = new ToolMessage({ tool_call_id: tool_id, name: tool_name, content: responce.content })
                        return new Command({ update: { subAgentMessageList: [SYSTEM_PROMPT, human_message, aiMessage], parentMessages: [...state.parentMessages, toolMessage], toolIndex: state.toolIndex + 1 }, goto: END })
                    }

                }
            }

        } catch (error) {
            if (error instanceof Error) {
                // console.log(`❌ ${error.message}`);
                return new Command({ update: { errorMessage: `${error.message}` }, goto: END })
            }
            return new Command({ update: { errorMessage: `${error}` }, goto: END })
        }
    };


    interface ToolCall {
        name: string;
        args: any;
        id: string;
        type?: "tool";
    };
    // subFilterToolsNode
    const subFilterToolsNode = async (state: z.infer<typeof stateType>, config: LangGraphRunnableConfig) => {
        // console.log(`🐪 from subFilter`)
        try {

            const lastmsg = state.subAgentMessageList[state.subAgentMessageList.length - 1];
            const toollist: ToolCall[] = lastmsg.tool_calls;

            const requiredtoollist_for_permission: ToolCall[] = [];
            for (const element of toollist) {
                if (element.name in requiredTools) {
                    requiredtoollist_for_permission.push(element);
                }
            };

            if (requiredtoollist_for_permission.length > 0) {
                if (state.allowedToolsForSession && state.allowedToolsForSession.length > 0) {

                    const finaltoollist: ToolCall[] = [];

                    for (const element of state.allowedToolsForSession) {
                        requiredtoollist_for_permission.map((value) => {
                            if (element != value.name) {
                                finaltoollist.push(value);
                            }
                        })
                    };

                    if (finaltoollist.length > 0) {
                        return new Command({ goto: "subGetPermissionNode", update: { requiredToolsForPermision: finaltoollist } });
                    } else {
                        return new Command({ goto: "subToolExecuterNode" });
                    }
                } else {
                    return new Command({ goto: "subGetPermissionNode", update: { requiredToolsForPermision: requiredtoollist_for_permission } });
                }
            } else {
                return new Command({ goto: "subToolExecuterNode" });
            }
        } catch (error) {
            if (error instanceof Error) {
                return new Command({ update: { errorMessage: `${error.message}` }, goto: END })
            }
            return new Command({ update: { errorMessage: `${error}` }, goto: END })
        }
    };

    // getpermision node
    type Grant = {
        toolName: string,
        permission: "allow" | "cancle" | "session"
    };
    const subGetPermissionNode = async (state: z.infer<typeof stateType>, config: LangGraphRunnableConfig) => {
        // console.log(`🐥 from subGetpermission`)
        const permissionsOfUsers: Grant[] = interrupt(state.requiredToolsForPermision);

        try {
            const allowed_tools_for_this_session: string[] = [];
            const cancled_tools = [];

            for (const element of permissionsOfUsers) {
                switch (element.permission) {
                    case "cancle":
                        cancled_tools.push(element)
                        break;
                    case "session":
                        allowed_tools_for_this_session.push(element.toolName)
                        break;
                    default:
                        break;
                };
            };

            if (cancled_tools.length > 0) {
                if (config.writer) {
                    config.writer({ toolCancled: cancled_tools });
                };

                return new Command({ goto: END })
            }

            if (allowed_tools_for_this_session.length > 0) {
                return new Command({ goto: "subToolExecuterNode", update: { allowedToolsForSession: allowed_tools_for_this_session } })
            }
            return new Command({ goto: "subToolExecuterNode" })

        } catch (error) {
            if (error instanceof Error) {
                return new Command({ update: { errorMessage: `${error.message}` }, goto: END })
            }
            return new Command({ update: { errorMessage: `${error}` }, goto: END })
        }
    }

    // tool executer node
    const subToolExecuterNode = async (state: z.infer<typeof stateType>, config: LangGraphRunnableConfig) => {
        // console.log(`🌾 from subToolExecuter`)
        try {

            const lastmsg = state.subAgentMessageList[state.subAgentMessageList.length - 1];
            const toollist: ToolCall[] = lastmsg.tool_calls;

            const ToolOutput: any = [];
            // working here-----
            const toolsWithArgs = [];

            for (const element of toollist) {
                for (const item of tools) {
                    if (element.name === item.name) {
                        toolsWithArgs.push({
                            name: element.name,
                            tool_call_id: element.id,
                            args: element.args,
                            tool: item
                        });
                    }
                }
            }

            if (allowParallel) {
                if (config.writer) {
                    config.writer({ status: `Executing the tools...` });
                }
                const responce = await Promise.allSettled(
                    toolsWithArgs.map(async element => new ToolMessage({ content: await element.tool.invoke(element.args), tool_call_id: element.tool_call_id }))
                );

                for (const element of responce as any) {
                    ToolOutput.push(element.value);
                };


                return new Command({ goto: "subCompactNode", update: { subAgentMessageList: [...state.subAgentMessageList, ...ToolOutput] } })
            } else {
                for (const element of toolsWithArgs) {
                    if (config.writer) {
                        config.writer({ status: `Executing the ${element.name} tool...` });
                    }
                    const responce = await element.tool.invoke(element.args);
                    ToolOutput.push(new ToolMessage({ content: responce, tool_call_id: element.tool_call_id }));

                    setMessages(prev => ({
                        ...prev,
                        message: [
                            ...(prev.message ?? []),
                            {
                                id: uuid(),
                                type: "tool",
                                toolargs: JSON.stringify(element.args),
                                toolname: element.name,
                                message: responce
                            }
                        ],
                    }));
                };

                return new Command({ goto: "subCompactNode", update: { subAgentMessageList: [...state.subAgentMessageList, ...ToolOutput] } })
            };

        } catch (error) {
            if (error instanceof Error) {
                return new Command({ update: { errorMessage: `${error.message}` }, goto: END })
            }
            return new Command({ update: { errorMessage: `${error}` }, goto: END })
        }
    }

    let subGraph;

    if (checkPointer) {
        subGraph = new StateGraph(SUBAGENTSTATE)
            .addNode("subCompactNode", subCompactNode, { ends: [END, "subMockLlmNode"] })
            .addNode("subMockLlmNode", subMockLlmNode, { ends: [END, "subFilterToolsNode"] })
            .addNode("subFilterToolsNode", subFilterToolsNode, { ends: [END, "subGetPermissionNode", "subToolExecuterNode"] })
            .addNode("subGetPermissionNode", subGetPermissionNode, { ends: [END, "subToolExecuterNode"] })
            .addNode("subToolExecuterNode", subToolExecuterNode, { ends: [END, "subCompactNode"] })
            .addEdge(START, "subCompactNode")
            .compile({ checkpointer: checkPointer })
    }
    else {
        subGraph = new StateGraph(SUBAGENTSTATE)
            .addNode("subCompactNode", subCompactNode, { ends: [END, "subMockLlmNode"] })
            .addNode("subMockLlmNode", subMockLlmNode, { ends: [END, "subFilterToolsNode"] })
            .addNode("subFilterToolsNode", subFilterToolsNode, { ends: [END, "subGetPermissionNode", "subToolExecuterNode"] })
            .addNode("subGetPermissionNode", subGetPermissionNode, { ends: [END, "subToolExecuterNode"] })
            .addNode("subToolExecuterNode", subToolExecuterNode, { ends: [END, "subCompactNode"] })
            .addEdge(START, "subCompactNode")
            .compile()
    }

    return subGraph;
}
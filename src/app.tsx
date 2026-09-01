import React, { useState, memo, useEffect, useRef, useCallback, useMemo } from 'react';
import { Box, Text, useStdout, useApp, useInput } from 'ink';
import { StateGraph, Command, interrupt, END, START, MemorySaver, StateSchema } from '@langchain/langgraph';
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { TextInput, PasswordInput, StatusMessage, Select, Spinner } from '@inkjs/ui';
import z from 'zod';
import path from 'node:path';
import { appendFile } from 'node:fs/promises';
import { ChatGoogle } from '@langchain/google';
import { SYSTEM_PROMPT1, LOAD_TOOL_DESCRIPTION, summarizerSystemPrompt } from './agent/system.js';
import { write_file, read_file, edit_file, run_shell_command, glob, grep, write_todos, web_researcher } from './agent/tool.js';
import { ispowershell } from './agent/system.js';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, tool } from 'langchain';
import MessagesList from './messageslist.js';
import { v4 as uuid } from 'uuid';
import { countTokensApproximately, findSafeCutOff, convertToOpenAiMessageFormat, getapikeys, prune_context } from './utils/utils.js';
import { writeFile } from 'node:fs/promises';

// const {} = getapikeys();

interface KeyRef {
    current: {
        GEMINI_API_KEY: null | string,
        TAVILY_API_KEY: null | string
    }
}

interface STATE {
    keynames: string[],
    index: number,
    shouldshow: boolean,
    resolve?: any,
}

interface InfoType {
    shouldshow: boolean,
    message: string;
    type: "error" | "warning" | "info" | "success"
};

type tooltype = {
    name: string;
    args: any,
    id?: string,
    type?: string
}

interface TOOLPER {
    toolinfo: tooltype[];
    shouldshow: boolean,
    resolve?: any;
    index: number;
}

interface STATUS {
    shouldshow: boolean,
    message: string
};

type Store = "allow" | "cancle" | "session";

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

const checkpointer = new MemorySaver();
const config = { configurable: { thread_id: "thread-1" } };

const App = memo(() => {
    const [size, setSize] = useState<{ height: number | string, width: number | string }>({ height: "100%", width: "100%" });
    const [promiseApi, SetpromiseApi] = useState<STATE>({ shouldshow: false, index: 0, keynames: [] });
    const [InfoMessage, SetInfoMessage] = useState<InfoType>({ shouldshow: false, message: "info", type: "info" });
    const [Tokens, setTokens] = useState<{ llmTokens: number, tavilyCredits: number }>({ llmTokens: 0, tavilyCredits: 0 });
    const [ToolPermissions, SetToolPermissions] = useState<TOOLPER>({ index: 0, shouldshow: false, toolinfo: [] });
    const [Status, setStatus] = useState<STATUS>({ shouldshow: false, message: "Thinking..." });
    const [Messages, setMessages] = useState<MSG>({ id: "erd", message: [{ id: "Lo8gheMuf", message: "kelvin code", type: "logo" }, { id: "De8sn$", type: "description", message: "build websites,debug your code,test your app,press ctrl + c for exit" }] });
    const [ShowInputBox, setShowInputBox] = useState<boolean>(true);


    const storeRef: { current: Grant[] } = useRef([]);
    const apiRef: { current: string[] } = useRef([]);
    const keyRef: KeyRef = useRef({ GEMINI_API_KEY: null, TAVILY_API_KEY: null });
    const currentToolsSet = useRef(["manage_tool_context", "write_todos"]);

    const { exit } = useApp();
    const { stdout } = useStdout();

    // sub agents
    // const file_system_agent_node = useMemo(() => (createSubAgent({
    //     allowParallel: false,
    //     modelName: "gemini-3.5-flash",
    //     systemPrompt: FILE_SYSTEM_AGENT_SYSTEM_PROMPT,
    //     tools: [write_file, read_file, edit_file, glob, grep],
    //     setMessages,
    //     checkPointer: true
    // })), [])

    // const shell_agent_node = useMemo(() => (createSubAgent({
    //     allowParallel: false,
    //     modelName: "gemini-3.5-flash",
    //     systemPrompt: SHELL_AGENT_SYSTEM_PROMPT,
    //     tools: [run_shell_command],
    //     setMessages,
    //     checkPointer: true
    // })), [])

    // --------------handling application exit----------------
    useInput((input, key) => {
        if (key.ctrl && input === 'c') exit()
    });

    // ------------ handling terminal size --------------

    useEffect(() => {
        if (process.platform == "win32") {
            ispowershell();
        };

        let timeout: any = null;
        const updatesize = () => {
            if (timeout) {
                clearTimeout(timeout);
            };

            timeout = setTimeout(() => {
                process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
                setSize({ width: stdout.columns, height: stdout.rows });
                setMessages(prev => ({ id: uuid(), message: [...prev.message] }));
            }, 500);
        };

        stdout.on('resize', updatesize);
        return () => {
            stdout.off('resize', updatesize);
        }
    }, []);


    type API = {
        GEMINI_API_KEY: string,
        TAVILY_API_KEY: string,
    } | { Error: string };


    // --------------------handling apisubmit function--------------------

    const apisubmit = useCallback(
        (value: string) => {
            if (promiseApi.index < promiseApi.keynames?.length - 1) {
                apiRef.current.push(value);

                SetpromiseApi(prev => ({ ...prev, index: prev.index + 1 }));
            }
            else {
                if (promiseApi.index == promiseApi.keynames?.length - 1) {
                    apiRef.current.push(value);
                    promiseApi.resolve(apiRef.current);

                    SetpromiseApi({ shouldshow: false, keynames: [], index: 0, resolve: null });
                    apiRef.current = [];
                }
            }
        },
        [promiseApi],
    );


    // ---------------- handelUserPermission ---------------------
    const handelUserPermission = useCallback(
        (value: Store) => {
            if (ToolPermissions.index < ToolPermissions.toolinfo.length - 1) {
                const obj: Grant = { permission: value, toolName: (ToolPermissions.toolinfo[ToolPermissions.index] as tooltype).name };
                storeRef.current.push(obj);

                SetToolPermissions(prev => ({ ...prev, index: prev.index + 1 }));
            } else {
                if (ToolPermissions.index == ToolPermissions.toolinfo.length - 1) {
                    const obj: Grant = { permission: value, toolName: (ToolPermissions.toolinfo[ToolPermissions.index] as tooltype).name };
                    storeRef.current.push(obj);
                    ToolPermissions.resolve(storeRef.current);

                    SetToolPermissions({ index: 0, shouldshow: false, toolinfo: [], resolve: null });
                    storeRef.current = [];
                }
            }
        },
        [ToolPermissions],
    );

    // ---------------- tool creation ---------------------

    const showinput = useCallback(
        (query: string[]): Promise<string[]> => {
            return new Promise((resolve, reject) => {

                SetpromiseApi(prev => ({ ...prev, shouldshow: true, keynames: query, resolve }))
            });
        },
        [],
    );


    const getPermissions = useCallback(
        (tools: tooltype[]) => {
            return new Promise((resolve, reject) => {

                SetToolPermissions(prev => ({ ...prev, shouldshow: true, resolve, toolinfo: tools }))
            })
        },
        [],
    )

    //-------------1. specific tools that's only in this file ------------------

    const set_api_keys = useMemo(() => (tool(
        async ({ keyname, dirPath }, config: LangGraphRunnableConfig) => {
            try {
                if (keyname.length === 0 || !keyname) {
                    return JSON.stringify({ error: "keyname is not defined please give the keyname" });
                }

                if (config.writer) {
                    config.writer({ status: `Asking api keys to user ...` });
                }

                if (!dirPath) {
                    const envfile = path.resolve('.env');
                    const keys = await showinput(keyname);
                    const fullkeys = [];
                    for (const [index, element] of keyname.entries()) {
                        const full_key = `\n${element} = ${keys[index]}`
                        fullkeys.push(full_key);
                    };
                    await appendFile(envfile, fullkeys.join('\n'));

                    return JSON.stringify({ message: "✅ succesfully seted the api keys" });
                } else {
                    let cleanPath = dirPath.replace(/^[/\\]+/, '');
                    const normalizedPath = path.normalize(cleanPath);
                    const envfile = path.resolve(normalizedPath, '.env');

                    const keys = await showinput(keyname);
                    const fullkeys = [];
                    for (const [index, element] of keyname.entries()) {
                        const full_key = `\n${element} = ${keys[index]}`
                        fullkeys.push(full_key);
                    };
                    await appendFile(envfile, fullkeys.join('\n'));
                    return JSON.stringify({ message: "✅ succesfully seted the api keys" });
                }
            } catch (error) {
                if (error instanceof Error) {

                    return JSON.stringify({ error: error.message });
                }
                return JSON.stringify({ error: error });
            }
        },
        {
            name: "set_api_keys",
            description: "It takes input from the user and set the api key in '.env' file. Use it when you need to set API keys or secrets for the app. It asks the user for the API keys, and then automatically sets the API key with the given key names array. It sets the API key in the .env file of the current working directory.",
            schema: z.object({
                keyname: z.array(z.string()).describe("array of the api key names."),
                dirPath: z.string().optional().describe("relative path of directory in which have to set api key in .env file. this is optional, if not provide it set api key in .env file in current working directory")
            })
        }
    )), []);


    // ------------------------------2. manage_tool_context-----------------------------
    const manage_tool_context = useMemo(() => (tool(
        async ({ tools }, config: LangGraphRunnableConfig) => {
            try {

                if (tools.length === 0) {
                    return `Error: tools list is't provided for load or offload!`
                }

                if (config.writer) {
                    config.writer({ status: `Loading/OffLoading tools` });
                };

                let results: string[] = [];

                for (let index = 0; index < tools.length; index++) {
                    const toolName = tools[index]?.toolName ?? "";
                    const type = tools[index]?.type ?? "";
                    const toolSet = currentToolsSet.current;

                    if (type === "load") {
                        if (toolSet.includes(toolName)) {

                            results.push(`tool -> ${toolName}\nWarning: this tool -> ${toolName}, already in tool context!`);
                        } else {

                            currentToolsSet.current.push(toolName);

                            results.push(`tool -> ${toolName}\nSuccessfully added -> ${toolName}, in tool context!`);
                        }
                    } else if (type === "off_load") {
                        if (toolSet.includes(toolName)) {
                            const updatedToolList = toolSet.filter(item => item !== toolName);
                            currentToolsSet.current = updatedToolList;

                            results.push(`tool -> ${toolName}\nSuccessfully offloaded -> ${toolName}, in tool context!`);
                        } else {

                            results.push(`tool -> ${toolName}\nWarning: this tool -> ${toolName}, already is't in tool context!`);
                        }
                    }
                };

                return `these are the responce messages\n\n${results.join('\n\n')}`;

            } catch (error) {
                if (error instanceof Error) {
                    return `Error: ${error.message}`;
                } else {
                    return `Error: ${error}`
                }
            }
        },
        {
            name: "manage_tool_context",
            description: LOAD_TOOL_DESCRIPTION,
            schema: z.object({
                tools: z.array(z.object({
                    toolName: z.string().describe("exect name of the tool that you wanna load or offload."),
                    type: z.enum(["load", "off_load"]).describe("if load, it will add this tool in context window or if it is off_load it will remove from context window")
                }))
            })
        }
    )), []);

    // all avalable tools list
    const executableTools = useMemo(() => ({
        "read_file": read_file,
        "write_file": write_file,
        "edit_file": edit_file,
        "run_shell_command": run_shell_command,
        "glob": glob,
        "grep": grep,
        "write_todos": write_todos,
        "web_researcher": web_researcher,
        "set_api_keys": set_api_keys,
        "manage_tool_context": manage_tool_context
    }), []);

    //required tool for taking permission from user to execute
    const requiredTools = useMemo(() => ({
        "write_file": "write_file",
        "edit_file": "edit_file",
        "run_shell_command": "run_shell_command",
        "read_file": "read_file"
    }), []);

    // ---------------------- main Graph state-----------------------
    const ToolInfoSchema = useMemo(() => (z.object({
        id: z.string(),
        name: z.string(),
        args: z.any(),
    })), [])

    const ToolRequestSchema = useMemo(() => (z.object({
        type: z.enum(["agent", "normal"]),
        toolInfo: z.array(ToolInfoSchema),
    })), [])


    const State = useMemo(() => (new StateSchema({
        parentMessages: z.array(z.any()),
        errorMessage: z.string(),
        toolRequests: z.array(ToolRequestSchema),
        toolIndex: z.number(),
        parentAllowedToolsForSession: z.array(z.any()),
        parentRequiredToolsForPermision: z.array(z.any()),
        finalResponce: z.string()
    })), [])

    const stateType = useMemo(() => (z.object({
        parentMessages: z.array(z.any()),
        errorMessage: z.string(),
        toolRequests: z.array(ToolRequestSchema),
        toolIndex: z.number(),
        parentAllowedToolsForSession: z.array(z.any()),
        parentRequiredToolsForPermision: z.array(z.any()),
        finalResponce: z.string()
    })), []);


    interface Usage_metadata {
        input_tokens: number,
        output_tokens: number,
        total_tokens: number
    };

    //prune context node
    const pruneContext = useCallback(
        async (state: z.infer<typeof stateType>, config: LangGraphRunnableConfig) => {
            try {

                const lenghtOfmessages = state.parentMessages.length;
                const MESSAGES_TO_KEEP = 3;

                if (lenghtOfmessages > MESSAGES_TO_KEEP) {
                    console.log("🥸 cleaned messages");

                    const cleaned_messages = prune_context(state.parentMessages, MESSAGES_TO_KEEP);
                    return new Command({ goto: "parentCompact", update: { parentMessages: cleaned_messages } })
                } else return new Command({ goto: "parentCompact" })

            } catch (error) {
                if (error instanceof Error) {
                    return new Command({ goto: END, update: { errorMessage: error.message.toString() } })
                }
                else {
                    return new Command({ goto: END, update: { errorMessage: (error as string).toString() } })
                }
            }
        },
        [],
    );

    // -----------------------------compact context window-----------------------------
    const parentCompact = useCallback(
        async (state: z.infer<typeof stateType>, config: LangGraphRunnableConfig) => {
            // console.log(`🐼 from parentCompact`)
            try {
                const keys: {
                    GEMINI_API_KEY: string | null,
                    TAVILY_API_KEY: string | null
                } = {
                    GEMINI_API_KEY: null,
                    TAVILY_API_KEY: null
                };

                if (!keyRef.current.GEMINI_API_KEY && !keyRef.current.TAVILY_API_KEY) {
                    const responce: any = await getapikeys();
                    if (responce.Error) {
                        return new Command({ goto: END, update: { errorMessage: responce.Error } })
                    } else {
                        keys.GEMINI_API_KEY = responce.GEMINI_API_KEY;
                        keys.TAVILY_API_KEY = responce.TAVILY_API_KEY;
                        keyRef.current.GEMINI_API_KEY = responce.GEMINI_API_KEY;
                        keyRef.current.TAVILY_API_KEY = responce.TAVILY_API_KEY
                    }
                } else {
                    keys.GEMINI_API_KEY = keyRef.current.GEMINI_API_KEY;
                    keys.TAVILY_API_KEY = keyRef.current.TAVILY_API_KEY;
                }

                if (state.parentMessages.length === 0) {
                    return new Command({ goto: "parentMockllm" });
                };

                const total_tokens = countTokensApproximately(state.parentMessages);
                const lenghtOfmessages = state.parentMessages.length;
                const MESSAGES_TO_KEEP = 5;

                if (total_tokens >= 15000 && lenghtOfmessages >= 20) {

                    const SAFE_CUT_OFF = findSafeCutOff(state.parentMessages, MESSAGES_TO_KEEP);

                    const preservedSystemPrompt = state.parentMessages[0];

                    const preservedMessages = state.parentMessages.slice(SAFE_CUT_OFF + 1);

                    // messages to summarise
                    const messagesTosummarise = state.parentMessages.slice(1, SAFE_CUT_OFF + 1);
                    const filteredMessages = convertToOpenAiMessageFormat(messagesTosummarise);

                    const sumarizerllm = new ChatGoogle({
                        apiKey: keys.GEMINI_API_KEY as string,
                        model: "gemini-3.5-flash",
                    });

                    SetInfoMessage({ message: `⛏️ i am from compact NODE, total msg = ${lenghtOfmessages}, total_tokens = ${total_tokens}`, shouldshow: true, type: "info" });
                    setStatus({ shouldshow: true, message: "compacting the context window..." });

                    const generatedSummary = await sumarizerllm.invoke([new SystemMessage(summarizerSystemPrompt), new HumanMessage(`here is the conversation to date\n\n${filteredMessages}`)])

                    if (config.writer && generatedSummary.usage_metadata) {
                        config.writer({
                            tokenUsed: (generatedSummary.usage_metadata as Usage_metadata).total_tokens,
                        });
                    }

                    // debuging step

                    await writeFile(path.resolve("COMPACT.md"), generatedSummary.content as string);

                    const human_message = new HumanMessage(`this is the summary and memory of us previews conversation\n\n${generatedSummary.content}`);

                    return new Command({ goto: "parentMockllm", update: { parentMessages: [preservedSystemPrompt, human_message, ...preservedMessages] } });
                } else {
                    return new Command({ goto: "parentMockllm" });
                }

            } catch (error) {
                if (error instanceof Error) {
                    return new Command({ goto: END, update: { errorMessage: error.message.toString() } })
                }
                else {
                    return new Command({ goto: END, update: { errorMessage: (error as string).toString() } })
                }
            }
        },
        [],
    )


    // --------------------------------main llm invocation--------------------------------

    const parentMockllm = useCallback(
        async (state: z.infer<typeof stateType>, config: LangGraphRunnableConfig) => {
            // console.log(`🦜 from parentmockllm`);
            try {

                const toolList = currentToolsSet.current.map(toolName => (executableTools as any)[toolName]);

                const chatllm = new ChatGoogle({
                    apiKey: keyRef.current.GEMINI_API_KEY as string,
                    model: "gemini-3.5-flash",
                    // responseModalities: ["TEXT"]
                }).bindTools(toolList);

                setStatus({ shouldshow: true, message: "Thinking..." });

                const responce = await chatllm.invoke([...state.parentMessages]);

                if (config.writer && responce.usage_metadata) {
                    config.writer({
                        tokenUsed: (responce.usage_metadata as Usage_metadata).total_tokens,
                    });
                };

                if (responce.tool_calls && responce.tool_calls.length > 0) {
                    const toolList = responce.tool_calls;

                    // Saare tools direct "normal" execution ke liye arrange honge:
                    const toolArrangement = toolList.map((element) => ({
                        type: "normal" as const,
                        toolInfo: [{
                            id: element.id,
                            name: element.name,
                            args: element.args
                        }]
                    }));


                    // console.log("🤔🤔\n",responce);

                    const Aimsg = new AIMessage({ content: responce.content, tool_calls: responce.tool_calls });
                    return new Command({ goto: "router", update: { parentMessages: [...state.parentMessages, Aimsg], toolRequests: toolArrangement, toolIndex: 0 } });
                }
                else {
                    const Aimsg = new AIMessage({ content: responce.content });
                    return new Command({ goto: END, update: { parentMessages: [...state.parentMessages, Aimsg], finalResponce: responce.content } });
                }

            } catch (error) {
                if (error instanceof Error) {
                    return new Command({ goto: END, update: { errorMessage: error.message.toString() } })
                }
                else {
                    return new Command({ goto: END, update: { errorMessage: (error as string).toString() } })
                }
            }
        },
        [],
    );


    // Router node
    const router = useCallback(
        async (state: z.infer<typeof stateType>, config: LangGraphRunnableConfig) => {

            // console.log(`👿 fro router Index: ${state.toolIndex}`);
            try {

                if (state.toolIndex >= state.toolRequests.length) {
                    return new Command({ goto: "pruneContext" });
                } else {

                    return new Command({ goto: "parentFiltertool" })

                }

            } catch (error) {
                if (error instanceof Error) {
                    return new Command({ goto: END, update: { errorMessage: error.message.toString() } })
                }
                else {
                    return new Command({ goto: END, update: { errorMessage: (error as string).toString() } })
                }
            }
        },
        [],
    )


    interface ToolCall {
        name: string;
        args: any;
        id: string;
        type?: "tool";
    };

    const parentFiltertool = useCallback(
        async (state: z.infer<typeof stateType>) => {
            // console.log(`🧮 from parentFilterTool`)
            try {

                const toolList: any = state.toolRequests[state.toolIndex]?.toolInfo;

                const requiredtoollist_for_permission: ToolCall[] = [];
                for (const element of toolList) {
                    if (element.name in requiredTools) {
                        requiredtoollist_for_permission.push(element);
                    }
                };

                if (requiredtoollist_for_permission.length > 0) {
                    if (state.parentAllowedToolsForSession && state.parentAllowedToolsForSession.length > 0) {

                        const finaltoollist: ToolCall[] = [];

                        for (const element of state.parentAllowedToolsForSession) {
                            requiredtoollist_for_permission.map((value) => {
                                if (element != value.name) {
                                    finaltoollist.push(value);
                                }
                            })
                        };

                        if (finaltoollist.length > 0) {
                            return new Command({ goto: "parentGetPermision", update: { parentRequiredToolsForPermision: finaltoollist } });
                        } else {
                            return new Command({ goto: "parentToolExecuter" });
                        }
                    } else {
                        return new Command({ goto: "parentGetPermision", update: { parentRequiredToolsForPermision: requiredtoollist_for_permission } });
                    }
                } else {
                    return new Command({ goto: "parentToolExecuter" });
                }
            } catch (error) {
                if (error instanceof Error) {
                    return new Command({ goto: END, update: { errorMessage: error.message.toString() } })
                }
                else {
                    return new Command({ goto: END, update: { errorMessage: (error as string).toString() } })
                }
            }
        },
        [],
    )


    type Grant = {
        toolName: string,
        permission: "allow" | "cancle" | "session"
    };

    const parentGetPermision = useCallback(
        async (state: z.infer<typeof stateType>, config: LangGraphRunnableConfig) => {
            // console.log(`👋 from parentGetPermission`)

            const permissionsOfUsers: Grant[] = interrupt(state.parentRequiredToolsForPermision);

            try {

                // SetInfoMessage({ message: `i am from getpermission NODE`, shouldshow: true, type: "info" });
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
                    return new Command({ goto: "parentToolExecuter", update: { parentAllowedToolsForSession: allowed_tools_for_this_session } })
                }
                return new Command({ goto: "parentToolExecuter" })
            } catch (error) {
                if (error instanceof Error) {
                    return new Command({ goto: END, update: { errorMessage: error.message.toString() } })
                }
                else {
                    return new Command({ goto: END, update: { errorMessage: (error as string).toString() } })
                }
            }
        },
        [],
    )


    const parentToolExecuter = useCallback(
        async (state: z.infer<typeof stateType>, config: LangGraphRunnableConfig) => {
            // console.log(`⚔️ from parentToolExecuter`)
            try {

                const toollist: any = state.toolRequests[state.toolIndex]?.toolInfo
                const ToolOutput: any = [];
                for (const element of toollist) {

                    const toolsresponce = await (executableTools as any)[element.name].invoke(element.args, config);
                    ToolOutput.push(new ToolMessage({ name: element.name, tool_call_id: element.id, content: toolsresponce }));

                    // setMessages(prev => ({
                    //     ...prev,
                    //     message: [
                    //         ...(prev.message ?? []),
                    // {
                    //     id: uuid(),
                    //     type: "tool",
                    //     toolargs: JSON.stringify(element.args),
                    //     toolname: element.name,
                    //     message: toolsresponce
                    // }
                    //     ],
                    // }));
                    if (config.writer) {
                        config.writer({
                            toolMessages: [
                                {
                                    id: uuid(),
                                    type: "tool",
                                    toolargs: JSON.stringify(element.args),
                                    toolname: element.name,
                                    message: toolsresponce
                                }
                            ]
                        });
                    }

                };

                return new Command({ goto: "router", update: { parentMessages: [...state.parentMessages, ...ToolOutput], toolIndex: state.toolIndex + 1 } });
            } catch (error) {
                if (error instanceof Error) {
                    return new Command({ goto: END, update: { errorMessage: error.message.toString() } });
                } else {
                    return new Command({ goto: END, update: { errorMessage: (error as string).toString() } });
                }
            }
        },
        [],
    )



    const graph = useMemo(() => {
        return new StateGraph(State)
            .addNode("pruneContext", pruneContext, { ends: [END, "parentCompact"] })
            .addNode("parentCompact", parentCompact, { ends: [END, "parentMockllm"] })
            .addNode("parentMockllm", parentMockllm, { ends: [END, "router"] })
            .addNode("router", router, { ends: [END, "parentFiltertool", "pruneContext"] })
            .addNode("parentFiltertool", parentFiltertool, { ends: [END, "parentToolExecuter", "parentGetPermision"] })
            .addNode("parentGetPermision", parentGetPermision, { ends: [END, "parentToolExecuter"] })
            .addNode("parentToolExecuter", parentToolExecuter, { ends: [END, "router"] })
            // .addNode("file_system_agent", file_system_agent_node)
            // .addNode("shell_agent", shell_agent_node)
            .addEdge(START, "pruneContext")
            // .addEdge("file_system_agent", "router")
            // .addEdge("shell_agent", "router")
            .compile({ checkpointer });
    }, [])


    interface node_state {
        messageList?: Array<any>,
        finalResponce?: string,
        errorLogs?: string,
        allowedToolsForSession?: Array<any>,
        requiredToolsForPermision?: Array<any>
    }

    interface UPDATE {
        mockllm?: node_state,
        filtertool?: node_state,
        getPermision?: node_state,
        toolExecuter?: node_state,
        __interrupt__?: {
            value: ToolCall
        }[]
    }

    interface CUSTOM {
        toolCancled: Grant[],
        status: string,
        tokenUsed: number,
        tavilyCredits: number
    }

    type chunk_type = ["updates", UPDATE] | ["custom", CUSTOM]

    // ----------------- invocation of graph---------------------
    const invoke = useCallback(
        async (userinput: string) => {

            const trimedInput = userinput.trim();

            if (trimedInput?.toLowerCase() === "exit") {
                exit();
                return;
            };

            if (trimedInput) {

                setStatus(prev => ({ ...prev, shouldshow: true }));
                setShowInputBox(false);
                setMessages(prev => ({
                    ...prev,
                    message: [
                        ...(prev.message ?? []), // 👈 old messages
                        {
                            type: "human",
                            message: trimedInput.toString(),
                            id: uuid()

                        }
                    ],
                }));

                // input message for agent--
                let input: any = { parentMessages: [new SystemMessage(SYSTEM_PROMPT1), new HumanMessage({ content: trimedInput, id: uuid() })] };

                const persistancestate = await graph.getState(config);

                if (persistancestate.values.parentMessages) {
                    input = { parentMessages: [...persistancestate.values.parentMessages, new HumanMessage({ content: trimedInput, id: uuid() })] };
                };

                // while loop started
                while (true) {

                    const stream = await graph.stream(
                        input,
                        {
                            streamMode: ["updates", "custom"],
                            ...config,
                            subgraphs: true,
                            recursionLimit: 70
                        });

                    let interrupted = false;

                    for await (const chunk of stream) {
                        const [ns, streamMode, payload] = chunk;
                        // const [streamtype, value] = chunk

                        if (streamMode === "custom") {
                            if (payload.tokenUsed && "tokenUsed" in payload) {
                                setTokens(prev => ({ llmTokens: prev.llmTokens + payload.tokenUsed, tavilyCredits: prev.tavilyCredits }));
                            }
                            if (payload.status && "status" in payload) {

                                setStatus(prev => ({ ...prev, message: payload.status }));
                            }
                            if (payload.toolCancled && "toolCancled" in payload) {

                                SetInfoMessage({ message: JSON.stringify({ cancled_tools: payload.toolCancled }), shouldshow: true, type: "info" })
                            }

                            if (payload.tavilyCredits && "tavilyCredits" in payload) {
                                setTokens(prev => ({ llmTokens: prev.llmTokens, tavilyCredits: prev.tavilyCredits + payload.tavilyCredits }));
                            };

                            if (payload.toolMessages && "toolMessages" in payload) {
                                setMessages(prev => ({
                                    ...prev,
                                    message: [
                                        ...(prev.message ?? []),
                                        ...payload.toolMessages
                                    ],
                                }));
                            }

                        } else if (streamMode === "updates") {

                            if ("__interrupt__" in payload) {

                                const user_responce = await getPermissions((payload as any).__interrupt__[0]?.value);
                                input = new Command({ resume: user_responce, graph: ns as any });
                                interrupted = true;
                                break;
                            } else {

                                for (const [feild, obj_value] of Object.entries(payload)) {
                                    if ("finalResponce" in obj_value) {

                                        setMessages(prev => ({
                                            ...prev,
                                            message: [
                                                ...(prev.message ?? []),
                                                {
                                                    type: "llm",
                                                    message: (obj_value.finalResponce as any).toString(),
                                                    id: uuid()
                                                }
                                            ],
                                        }));
                                        setStatus({ shouldshow: false, message: "Thinking..." });
                                        setShowInputBox(true);
                                    }
                                    if ("errorMessage" in obj_value) {

                                        SetInfoMessage({ message: obj_value.errorMessage, shouldshow: true, type: "error" });
                                        setStatus({ shouldshow: false, message: "Thinking..." });

                                        setTimeout(() => {
                                            exit();
                                        }, 1000);
                                    }
                                }
                            }
                        }
                    }

                    if (!interrupted) break;
                };

            };
        },
        [],
    )


    return (<>
        <MessagesList Size={size} list={Messages} />
        {/* get api keys from user */}
        {promiseApi.shouldshow && < Box width={size.width} borderStyle={"round"} flexDirection='column' borderColor={"gray"} >
            <Box gap={1} paddingLeft={1} paddingRight={1} flexDirection='column'>
                <Text>Set the following api keys</Text>
                <Box flexDirection='column'>
                    <Text>{`${promiseApi.index + 1}. ${promiseApi.keynames[promiseApi.index]}`}</Text>
                    <Box borderColor={"#ff8204"} borderStyle={'round'}>
                        <PasswordInput isDisabled={!promiseApi.shouldshow} placeholder={`${promiseApi.keynames[promiseApi.index]}`} key={`${promiseApi.index}PaasW`} onSubmit={(value) => apisubmit(value)} />
                    </Box>
                </Box>
            </Box>
        </Box >
        }

        {/* get tool permission to user */}
        {ToolPermissions.shouldshow && <Box width={size.width} flexDirection="column" gap={1} paddingLeft={1} paddingRight={1} borderColor={"gray"} borderStyle={"round"}>
            <Box flexDirection="column">
                <Text wrap="wrap">Do you allow to procced the Tool <Text bold={true}>{ToolPermissions.toolinfo[ToolPermissions.index]?.name} ❔</Text> </Text>
                <Text color={"#ababab"} wrap="truncate-end">args: {JSON.stringify(ToolPermissions.toolinfo[ToolPermissions.index]?.args)}</Text>
            </Box>
            <Select options={[
                { label: "allow for this time", value: "allow" },
                { label: "allow for this session", value: "session" },
                { label: "cancle", value: "cancle" }
            ]} key={`${ToolPermissions.index}Swlct`} onChange={(value) => { handelUserPermission(value as Store) }} />
        </Box>
        }

        {/* info message */}
        {InfoMessage.shouldshow &&
            <Box key={"gotLefser345"} width={size.width} flexDirection='column' borderColor={InfoMessage.type == "error" ? "#ff0000" : InfoMessage.type == "info" ? "cyan" : InfoMessage.type == "success" ? "green" : "yellow"} borderStyle={'round'} paddingLeft={1} paddingRight={1} gap={1}>
                <StatusMessage variant={InfoMessage.type}>
                    {InfoMessage.type}
                </StatusMessage>
                <Text key={"somw2dasd34asert"} color={"#ababab"} wrap="wrap">{InfoMessage.message}</Text>
            </Box>
        }
        {/* status spinner */}

        {Status.shouldshow && <Box width={size.width} paddingLeft={1} flexDirection='column' >
            <Spinner key={"spinner"} label={Status.message} type='dots14' />
        </Box>
        }

        {/* input box */}

        {ShowInputBox && <Box width={size.width} paddingLeft={1} borderStyle={'round'} borderColor={'#ff6a00ff'}>
            <Text color={'green'} wrap='wrap'>{`> `}</Text>
            <TextInput key={"GOtfw98fe5t3"} isDisabled={!ShowInputBox} placeholder='what would you like to build?' onSubmit={(input) => invoke(input)} />
        </Box>
        }

        {/* <Count /> */}
        <Box width={size.width} justifyContent="flex-end" gap={2} paddingRight={1}>
            <Text>
                Tavily credits used: <Text color={"cyan"} >{Tokens.tavilyCredits.toString()}</Text>
            </Text>
            <Text>
                LLM Token used: <Text color="cyan">{Tokens.llmTokens.toString()}</Text>
            </Text>
        </Box>
    </>);
});

export default App;
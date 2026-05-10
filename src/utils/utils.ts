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
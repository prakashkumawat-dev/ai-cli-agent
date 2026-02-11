import React, { useState, memo, useEffect, useRef } from 'react';
import { Box, Text, useStdout, Newline, useApp, useInput, measureElement } from 'ink';
import { StateGraph, Command, interrupt, END, START, MemorySaver } from '@langchain/langgraph';
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { TextInput, PasswordInput, StatusMessage, Select, Spinner } from '@inkjs/ui';
import Logo from './logo.js';
import Info from './info.js';
import z from 'zod';
import os from 'node:os';
import path from 'node:path';
import { readFile, appendFile } from 'node:fs/promises';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { SYSTEM_PROMPT1 } from './agent/system.js';
import { install_dependency, write_File, create_directory_and_files, list_directory, append_File, web_search, edit_file, read_File, read_logs, delete_in_file, search_in_file } from './agent/tool.js';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, tool } from 'langchain';

interface Size {
    height: number,
    width: number
}

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
    type: "human" | "llm" | "tool",
    message: string,
    toolname?: string,
    toolargs?: string,
}


interface MSG {
    shouldshow: boolean
    message?: MessageTypes[]
};

const App = memo(() => {
    const [size, setSize] = useState<{ height: number | string | undefined, width: number | string | undefined }>({ height: undefined, width: "100%" });
    const [promiseApi, SetpromiseApi] = useState<STATE>({ shouldshow: false, index: 0, keynames: [] });
    const [InfoMessage, SetInfoMessage] = useState<InfoType>({ shouldshow: false, message: "info", type: "info" });
    const [Tokens, setTokens] = useState<number>(0);
    const [ToolPermissions, SetToolPermissions] = useState<TOOLPER>({ index: 0, shouldshow: false, toolinfo: [] });
    const [Status, setStatus] = useState<STATUS>({ shouldshow: false, message: "Thinking..." });
    const [Messages, setMessages] = useState<MSG>({ shouldshow: false });
    const [ShowInputBox, setShowInputBox] = useState<boolean>(true);


    const storeRef: { current: Grant[] } = useRef([]);
    const apiRef: { current: string[] } = useRef([]);
    const keyRef: KeyRef = useRef({ GEMINI_API_KEY: null, TAVILY_API_KEY: null });
    const firstRef: { current: any } = useRef(null);

    const { exit } = useApp();
    const { stdout } = useStdout();

    // --------------handling application exit----------------
    useInput((input, key) => {
        if (key.ctrl && input === 'c') exit()
    });


    // ------------ handling terminal size --------------

    useEffect(() => {
        function initial() {
            setSize({ height: stdout.rows, width: stdout.columns });
        }
        initial();

        function updatesize() {
            const { height } = measureElement(firstRef.current);
            const terminalHeight = stdout.rows;
            const terminalwidth = stdout.columns;
            if (height < terminalHeight) {
                setSize({ height: terminalHeight, width: terminalwidth });
            } else {
                setSize({ height: height, width: terminalwidth });
            }
        }

        stdout.on('resize', updatesize);

        return () => {
            stdout.off('resize', updatesize);
        }
    }, []);


    type API = {
        GEMINI_API_KEY: string,
        TAVILY_API_KEY: string,
    } | { Error: string };

    // ---------------------getapikeys function---------------------

    const getapikeys = async (): Promise<API> => {
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

    // --------------------handling apisubmit function--------------------
    const apisubmit = (value: string) => {
        if (promiseApi.index < promiseApi.keynames?.length - 1) {
            apiRef.current.push(value);
            if (size.height !== undefined) {
                setSize(prev => ({ ...prev, height: undefined }));
            }
            SetpromiseApi(prev => ({ ...prev, index: prev.index + 1 }));
        }
        else {
            if (promiseApi.index == promiseApi.keynames?.length - 1) {
                apiRef.current.push(value);
                promiseApi.resolve(apiRef.current);
                if (size.height !== undefined) {
                    setSize(prev => ({ ...prev, height: undefined }));
                }
                SetpromiseApi({ shouldshow: false, keynames: [], index: 0, resolve: null });
                apiRef.current = [];
            }
        }
    }

    // ---------------- handelUserPermission ---------------------
    const handelUserPermission = (value: Store) => {
        if (ToolPermissions.index < ToolPermissions.toolinfo.length - 1) {
            const obj: Grant = { permission: value, toolName: (ToolPermissions.toolinfo[ToolPermissions.index] as tooltype).name };
            storeRef.current.push(obj);
            if (size.height !== undefined) {
                setSize(prev => ({ ...prev, height: undefined }));
            }
            SetToolPermissions(prev => ({ ...prev, index: prev.index + 1 }));
        } else {
            if (ToolPermissions.index == ToolPermissions.toolinfo.length - 1) {
                const obj: Grant = { permission: value, toolName: (ToolPermissions.toolinfo[ToolPermissions.index] as tooltype).name };
                storeRef.current.push(obj);
                ToolPermissions.resolve(storeRef.current);
                if (size.height !== undefined) {
                    setSize(prev => ({ ...prev, height: undefined }));
                }
                SetToolPermissions({ index: 0, shouldshow: false, toolinfo: [], resolve: null });
                storeRef.current = [];
            }
        }
    };

    // ---------------- tool creation ---------------------

    const showinput = (query: string[]): Promise<string[]> => {
        return new Promise((resolve, reject) => {
            if (size.height !== undefined) {
                setSize(prev => ({ ...prev, height: undefined }));
            }
            SetpromiseApi(prev => ({ ...prev, shouldshow: true, keynames: query, resolve }))
        });
    };

    const getPermissions = (tools: tooltype[]) => {
        return new Promise((resolve, reject) => {
            if (size.height !== undefined) {
                setSize(prev => ({ ...prev, height: undefined }));
            }
            SetToolPermissions(prev => ({ ...prev, shouldshow: true, resolve, toolinfo: tools }))
        })
    };


    const set_api_keys = tool(
        async ({ keyname, dirPath }: { keyname: string[], dirPath: string }) => {
            try {
                if (keyname.length === 0 || !keyname) {
                    return JSON.stringify({ error: "keyname is not defined please give the keyname" });
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
    );
    // ---------------tool binding with tools---------------

    const invoketools = {
        "web_search": web_search,
        "append_File": append_File,
        "list_directory": list_directory,
        "create_directory_and_files": create_directory_and_files,
        "write_File": write_File,
        "install_dependency": install_dependency,
        "search_in_file": search_in_file,
        "delete_in_file": delete_in_file,
        "read_logs": read_logs,
        "read_File": read_File,
        "edit_file": edit_file,
        "set_api_keys": set_api_keys
    };

    // ----------------------Graph creation-----------------------

    const State = z.object({
        messageList: z.array(z.any()),
        errorLogs: z.string().optional(),
        finalResponce: z.string().optional(),
        allowedToolsForSession: z.array(z.any()).optional(),
        requiredToolsForPermision: z.array(z.any()).optional()
    });

    interface Usage_metadata {
        input_tokens: number,
        output_tokens: number,
        total_tokens: number
    };

    const requiredTools = {
        "read_File": "read_File",
        "write_File": "write_File",
        "append_File": "append_File",
        "install_dependency": "install_dependency",
        "edit_file": "edit_file",
        "create_directory_and_files": "create_directory_and_files",
        "read_logs": "read_logs"
    };

    const mockllm = async (state: z.infer<typeof State>, config: LangGraphRunnableConfig) => {
        try {
            if (keyRef.current.GEMINI_API_KEY && keyRef.current.TAVILY_API_KEY) {

                const chatllm = new ChatGoogleGenerativeAI({
                    apiKey: keyRef.current.GEMINI_API_KEY,
                    model: "gemini-3-flash-preview"
                }).bindTools([install_dependency, write_File, create_directory_and_files, list_directory, append_File, web_search, edit_file, read_File, read_logs, delete_in_file, search_in_file, set_api_keys]);

                const responce = await chatllm.invoke([...state.messageList]);

                if (size.height !== undefined) {
                    setSize(prev => ({ ...prev, height: undefined }));
                };

                SetInfoMessage({ message: `ai gave responce from if block`, shouldshow: true, type: "info" });

                if (config.writer && responce.usage_metadata) {
                    config.writer({
                        tokenUsed: (responce.usage_metadata as Usage_metadata).total_tokens,
                    });
                }

                if (responce.tool_calls && responce.tool_calls.length > 0) {
                    const Aimsg = new AIMessage({ content: responce.content, tool_calls: responce.tool_calls });
                    return new Command({ goto: "filtertool", update: { messageList: [...state.messageList, Aimsg] } });
                }
                else {
                    const Aimsg = new AIMessage({ content: responce.content });
                    return new Command({ goto: END, update: { messageList: [...state.messageList, Aimsg], finalResponce: responce.content } });
                }

            } else {
                const keys = await getapikeys();
                if ("GEMINI_API_KEY" in keys && "TAVILY_API_KEY" in keys) {
                    const chatllm = new ChatGoogleGenerativeAI({
                        apiKey: keys.GEMINI_API_KEY,
                        model: "gemini-3-flash-preview"
                    }).bindTools([install_dependency, write_File, create_directory_and_files, list_directory, append_File, web_search, edit_file, read_File, read_logs, delete_in_file, search_in_file, set_api_keys]);

                    const responce = await chatllm.invoke([...state.messageList]);

                    if (size.height !== undefined) {
                        setSize(prev => ({ ...prev, height: undefined }));
                    };

                    SetInfoMessage({ message: `ai gave responce from else block`, shouldshow: true, type: "info" });

                    if (config.writer && responce.usage_metadata) {
                        config.writer({
                            tokenUsed: (responce.usage_metadata as Usage_metadata).total_tokens,
                        });
                    }

                    if (responce.tool_calls && responce.tool_calls.length > 0) {
                        const Aimsg = new AIMessage({ content: responce.content, tool_calls: responce.tool_calls });
                        return new Command({ goto: "filtertool", update: { messageList: [...state.messageList, Aimsg] } });
                    }
                    else {
                        const Aimsg = new AIMessage({ content: responce.content });
                        return new Command({ goto: END, update: { messageList: [...state.messageList, Aimsg], finalResponce: responce.content } });
                    };
                }
                else {
                    if ("Error" in keys) {
                        throw new Error(keys.Error)
                    }
                }
            }
        } catch (error) {
            if (error instanceof Error) {
                return new Command({ goto: END, update: { errorLogs: error.message.toString() } })
            }
            else {
                return new Command({ goto: END, update: { errorLogs: (error as string).toString() } })
            }
        }
    };

    interface ToolCall {
        name: string;
        args: any;
        id: string;
        type?: "tool";
    };

    const filtertool = async (state: z.infer<typeof State>) => {
        try {
            if (size.height !== undefined) {
                setSize(prev => ({ ...prev, height: undefined }));
            };
            SetInfoMessage({ message: `⛏️ i am from filtertool NODE`, shouldshow: true, type: "info" });
            const lastmsg = state.messageList[state.messageList.length - 1];
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
                        return new Command({ goto: "getPermission", update: { requiredToolsForPermision: finaltoollist } });
                    } else {
                        return new Command({ goto: "toolExecuter" });
                    }
                } else {
                    return new Command({ goto: "getPermission", update: { requiredToolsForPermision: requiredtoollist_for_permission } });
                }
            } else {
                return new Command({ goto: "toolExecuter" });
            }
        } catch (error) {
            if (error instanceof Error) {
                return new Command({ goto: END, update: { errorLogs: error.message.toString() } })
            }
            else {
                return new Command({ goto: END, update: { errorLogs: (error as string).toString() } })
            }
        }
    };

    type Grant = {
        toolName: string,
        permission: "allow" | "cancle" | "session"
    };

    const getPermision = async (state: z.infer<typeof State>, config: LangGraphRunnableConfig) => {

        const permissionsOfUsers: Grant[] = interrupt(state.requiredToolsForPermision);

        try {
            if (size.height !== undefined) {
                setSize(prev => ({ ...prev, height: undefined }));
            };
            SetInfoMessage({ message: `i am from getpermission NODE`, shouldshow: true, type: "info" });
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
                return new Command({ goto: "toolExecuter", update: { allowedToolsForSession: allowed_tools_for_this_session } })
            }
            return new Command({ goto: "toolExecuter" })
        } catch (error) {
            if (error instanceof Error) {
                return new Command({ goto: END, update: { errorLogs: error.message.toString() } })
            }
            else {
                return new Command({ goto: END, update: { errorLogs: (error as string).toString() } })
            }
        }
    };

    const toolExecuter = async (state: z.infer<typeof State>, config: LangGraphRunnableConfig) => {
        try {
            if (size.height !== undefined) {
                setSize(prev => ({ ...prev, height: undefined }));
            };
            SetInfoMessage({ message: `iam from toolExecuter NODE`, shouldshow: true, type: "info" });
            const lastmsg = state.messageList[state.messageList.length - 1];
            const toollist: ToolCall[] = lastmsg.tool_calls;
            const ToolOutput: any = [];
            for (const element of toollist) {
                if (config.writer) {
                    config.writer({ status: `executing the '${element.name}' tool...` });
                }
                const toolsresponce = await (invoketools as any)[element.name].invoke(element.args);
                ToolOutput.push(new ToolMessage({ name: element.name, tool_call_id: element.id, content: toolsresponce }));
                if (size.height !== undefined) {
                    setSize(prev => ({ ...prev, height: undefined }));
                }
                setMessages(prev => ({
                    message: [
                        ...(prev.message ?? []),
                        {
                            type: "tool",
                            toolargs: JSON.stringify(element.args),
                            toolname: element.name,
                            message: toolsresponce
                        }
                    ],
                    shouldshow: true
                }));
            };

            return new Command({ goto: "mockllm", update: { messageList: [...state.messageList, ...ToolOutput] } });
        } catch (error) {
            if (error instanceof Error) {
                return new Command({ goto: END, update: { errorLogs: error.message.toString() } });
            } else {
                return new Command({ goto: END, update: { errorLogs: (error as string).toString() } });
            }
        }
    };

    const checkpointer = new MemorySaver();
    const config = { configurable: { thread_id: "thread-1" } };

    const graph = new StateGraph(State)
        .addNode("mockllm", mockllm, { ends: [END, "filtertool"] })
        .addNode("filtertool", filtertool, { ends: [END, "toolExecuter", "getPermision"] })
        .addNode("getPermision", getPermision, { ends: [END, "toolExecuter"] })
        .addNode("toolExecuter", toolExecuter, { ends: [END, "mockllm"] })
        .addEdge(START, "mockllm")
        .compile({ checkpointer });


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

    type Interrupt_type = {
        __interrupt__: {
            value: ToolCall
        }[]
    }

    interface CUSTOM {
        toolCancled: Grant[],
        status: string,
        tokenUsed: number
    }

    type chunk_type = ["updates", UPDATE] | ["custom", CUSTOM]

    const invoke = async (userinput: string) => {
        const trimedInput = userinput.trim();

        if (trimedInput?.toLowerCase() === "exit") {
            exit();
        };

        if (trimedInput) {
            if (size.height !== undefined) {
                setSize(prev => ({ ...prev, height: undefined }));
            };

            setStatus(prev => ({ ...prev, shouldshow: true }));
            setShowInputBox(false);
            setMessages(prev => ({
                message: [
                    ...(prev.message ?? []), // 👈 old messages
                    {
                        type: "human",
                        message: trimedInput.toString(),

                    }
                ],
                shouldshow: true
            }));

            let input: any = { messageList: [new SystemMessage(SYSTEM_PROMPT1), new HumanMessage(trimedInput)] };
            const persistancestate = await graph.getState(config);

            if (persistancestate.values.messageList) {
                input = { messageList: [...persistancestate.values.messageList, new HumanMessage(trimedInput)] };
            };

            while (true) {
                const stream = await graph.stream(input, {
                    streamMode: ["updates", "custom"],
                    ...config
                });

                let interrupted = false;

                for await (const chunk of stream) {
                    const [streamtype, value] = chunk as chunk_type

                    if (streamtype == "custom") {
                        if (value.tokenUsed && "tokenUsed" in value) {
                            setTokens(prev => prev + value.tokenUsed);
                        }
                        if (value.status && "status" in value) {
                            if (size.height !== undefined) {
                                setSize(prev => ({ ...prev, height: undefined }));
                            }
                            setStatus(prev => ({ ...prev, message: value.status }));
                        }
                        if (value.toolCancled && "toolCancled" in value) {
                            if (size.height !== undefined) {
                                setSize(prev => ({ ...prev, height: undefined }));
                            }
                            SetInfoMessage({ message: JSON.stringify({ cancled_tools: value.toolCancled }), shouldshow: true, type: "info" })
                        }
                    } else {
                        if (value.__interrupt__ && value.__interrupt__.length > 0) {
                            const user_responce = await getPermissions((value as any).__interrupt__[0]?.value);
                            input = new Command({ resume: user_responce });
                            interrupted = true;
                            break;
                        } else {
                            for (const [feild, obj_value] of Object.entries(value)) {
                                if ("finalResponce" in obj_value) {

                                    if (size.height !== undefined) {
                                        setSize(prev => ({ ...prev, height: undefined }));
                                    }

                                    setMessages(prev => ({
                                        message: [
                                            ...(prev.message ?? []),
                                            {
                                                type: "llm",
                                                message: obj_value.finalResponce.toString(),

                                            }
                                        ],
                                        shouldshow: true
                                    }));
                                    setStatus({ shouldshow: false, message: "Thinking..." });
                                    setShowInputBox(true);
                                }
                                if ("errorLogs" in obj_value) {
                                    if (size.height !== undefined) {
                                        setSize(prev => ({ ...prev, height: undefined }));
                                    }
                                    SetInfoMessage({ message: obj_value.errorLogs, shouldshow: true, type: "error" });
                                    setStatus({ shouldshow: false, message: "Thinking..." });
                                    exit();
                                }
                            }
                        }
                    }
                }

                if (!interrupted) break;
            };

        };
    };

    return (
        <Box ref={firstRef} height={size.height} width={size.width} flexDirection="column" borderColor={'rgba(255, 102, 0, 1)'}>
            {/* logo of the app */}
            <Logo />

            {/* basic info about cli ai agent */}
            <Info />

            {/* chatmessages list */}

            {Messages.shouldshow && <Box width={"100%"} flexDirection="column">
                {Messages?.message?.map((value, index) => {
                    switch (value.type) {
                        case "human":
                            {
                                return (<Box paddingLeft={1} paddingRight={1} key={`${index}msgOfagent`} gap={1} flexDirection="column" borderStyle={"round"} borderColor={"gray"}>
                                    <Text wrap="wrap">🙍 human input</Text>
                                    <Text color={"gray"} wrap="wrap">{value.message.toString()}</Text>
                                </Box>)
                            }
                        case "llm":
                            {
                                return (<Box paddingLeft={1} paddingRight={1} key={`${index}msgOfagent`} gap={1} flexDirection="column" borderStyle={"round"} borderColor={"green"}>
                                    <Text wrap="wrap">✨ llm output</Text>
                                    <Text color={"gray"} wrap="wrap">{value.message.toString()}</Text>
                                </Box>)
                            }
                        case "tool":
                            {
                                return (<Box paddingLeft={1} paddingRight={1} key={`${index}msgOfagent`} gap={1} flexDirection="column" borderStyle={"round"} borderColor={"#fd7303"}>
                                    <Text wrap="wrap">{`⛏️  tool output`} <Text wrap="wrap" color={"gray"}>{`(${value.toolname})`}</Text></Text>
                                    <Text>with args: <Text wrap="truncate-end" color={"gray"}>{value.toolargs}</Text></Text>
                                    <Text wrap="wrap">{value.message.toString()}</Text>
                                </Box>)
                            }
                        default:
                            break;
                    }
                })}
            </Box>}

            {/* get api keys from user */}
            {promiseApi.shouldshow && < Box width={"100%"} borderStyle={"round"} flexDirection='column' borderColor={"gray"} >
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
            {ToolPermissions.shouldshow && <Box width={"100%"} flexDirection="column" gap={1} paddingLeft={1} paddingRight={1} borderColor={"gray"} borderStyle={"round"}>
                <Box flexDirection="column">
                    <Text wrap="wrap">Do you allow to procced the Tool <Text bold={true}>{ToolPermissions.toolinfo[ToolPermissions.index]?.name} ❔</Text> </Text>
                    <Text color={"gray"} wrap="truncate-end">args: {JSON.stringify(ToolPermissions.toolinfo[ToolPermissions.index]?.args)}</Text>
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
                <Box key={"gotLefser345"} width={"100%"} flexDirection='column' borderColor={InfoMessage.type == "error" ? "#ff0000" : InfoMessage.type == "info" ? "cyan" : InfoMessage.type == "success" ? "green" : "yellow"} borderStyle={'round'} paddingLeft={1} paddingRight={1} gap={1}>
                    <StatusMessage variant={InfoMessage.type}>
                        {InfoMessage.type}
                    </StatusMessage>
                    <Text key={"somw2dasd34asert"} color={"gray"} wrap="wrap">{InfoMessage.message}</Text>
                </Box>
            }
            {/* status spinner */}

            {Status.shouldshow && <Box width={"100%"} paddingLeft={1} flexDirection='column' >
                {/* <Spinner key={"spinner"} label={Status.message} type='dots14' /> */}
                <Text wrap='wrap' color={"cyan"}>{Status.message}</Text>
            </Box>
            }

            {/* input box */}

            {ShowInputBox && <Box width={'100%'} paddingLeft={1} borderStyle={'round'} borderColor={'#ff6a00ff'}>
                <Text color={'green'} wrap='wrap'>{`> `}</Text>
                <TextInput key={"GOtfw98fe5t3"} isDisabled={!ShowInputBox} placeholder='what would you like to build?' onSubmit={(input) => invoke(input)} />
            </Box>
            }

            {/* <Count /> */}
            <Box justifyContent="flex-end" paddingRight={1}>
                <Text>
                    Token used: <Text color="cyan">{Tokens.toString()}</Text>
                </Text>
            </Box>
        </Box>
    );
});

export default App;
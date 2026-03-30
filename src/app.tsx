import React, { useState, memo, useEffect, useRef } from 'react';
import { Box, Text, useStdout, useApp, useInput } from 'ink';
import { StateGraph, Command, interrupt, END, START, MemorySaver } from '@langchain/langgraph';
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { TextInput, PasswordInput, StatusMessage, Select, Spinner } from '@inkjs/ui';
import z from 'zod';
import os from 'node:os';
import path from 'node:path';
import { readFile, appendFile } from 'node:fs/promises';
import { ChatGoogle } from '@langchain/google';
import { SYSTEM_PROMPT1, LLM_TOOL_SELECTOR_SYSTEM_PROMPT } from './agent/system.js';
import { write_file, read_file, edit_file, run_shell_command, ispowershell } from './agent/tool.js';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, tool } from 'langchain';
import MessagesList from './messageslist.js';
import { v4 as uuid } from 'uuid';


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
    type: "human" | "llm" | "tool" | "logo" | "description",
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
    const [Tokens, setTokens] = useState<number>(0);
    const [ToolPermissions, SetToolPermissions] = useState<TOOLPER>({ index: 0, shouldshow: false, toolinfo: [] });
    const [Status, setStatus] = useState<STATUS>({ shouldshow: false, message: "Thinking..." });
    const [Messages, setMessages] = useState<MSG>({ id: "erd", message: [{ id: "Lo8gheMuf", message: "hello", type: "logo" }, { id: "De8sn$", type: "description", message: "build websites,debug your code,test your app,press ctrl + x for exit" }] });
    const [ShowInputBox, setShowInputBox] = useState<boolean>(true);


    const storeRef: { current: Grant[] } = useRef([]);
    const apiRef: { current: string[] } = useRef([]);
    const keyRef: KeyRef = useRef({ GEMINI_API_KEY: null, TAVILY_API_KEY: null });

    const { exit } = useApp();
    const { stdout } = useStdout();

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

    // ---------------------getapikeys function---------------------

    const getapikeys = async (): Promise<API> => {
        try {
            const filepath = path.join(os.homedir(), 'my-cli/config.json');
            const data = await readFile(filepath, { encoding: "utf-8" });
            const keys: { GEMINI_API_KEY: string, TAVILY_API_KEY: string } = JSON.parse(data);

            keyRef.current.GEMINI_API_KEY = keys.GEMINI_API_KEY;
            keyRef.current.TAVILY_API_KEY = keys.TAVILY_API_KEY;

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
    }

    // ---------------- handelUserPermission ---------------------
    const handelUserPermission = (value: Store) => {
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
    };

    // ---------------- tool creation ---------------------

    const showinput = (query: string[]): Promise<string[]> => {
        return new Promise((resolve, reject) => {

            SetpromiseApi(prev => ({ ...prev, shouldshow: true, keynames: query, resolve }))
        });
    };

    const getPermissions = (tools: tooltype[]) => {
        return new Promise((resolve, reject) => {

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
        "write_file": write_file,
        "edit_file": edit_file,
        "set_api_keys": set_api_keys,
        "run_shell_command": run_shell_command,
        "read_file": read_file
    };

    // ---------------------- main Graph state-----------------------

    const State = z.object({
        messageList: z.array(z.any()),
        errorLogs: z.string().optional(),
        finalResponce: z.string().optional(),
        allowedToolsForSession: z.array(z.any()).optional(),
        requiredToolsForPermision: z.array(z.any()).optional(),
        relevantTools: z.array(z.any()).optional(),
        humanMsgId: z.string().default("initial#2421(*^").optional()
    });

    interface Usage_metadata {
        input_tokens: number,
        output_tokens: number,
        total_tokens: number
    };

    const requiredTools = {
        "write_file": "write_file",
        "edit_file": "edit_file",
        "run_shell_command": "run_shell_command",
        "read_file": "read_file"
    };

    //---------------------------relevant tool selector node---------------------------

    const toolSelectorOutputSchema = z.object({
        relevantTools: z.array(z.string())
    });

    const toolselector = async (state: z.infer<typeof State>, config: LangGraphRunnableConfig) => {
        try {
            let human_msg: any;
            for (const element of state.messageList) {
                if (HumanMessage.isInstance(element)) {
                    human_msg = element;
                }
            };

            if (human_msg.id === state.humanMsgId) {
                return new Command({ goto: "mockllm" });
            } else {
                if (keyRef.current.GEMINI_API_KEY && keyRef.current.TAVILY_API_KEY) {
                    // llm invocation
                    const llm = new ChatGoogle({
                        apiKey: keyRef.current.GEMINI_API_KEY,
                        model: "gemini-3-flash-preview"
                    }).withStructuredOutput(toolSelectorOutputSchema, { includeRaw: true });

                    setStatus({ message: "selecting relevant tools...", shouldshow: true });

                    const toolRecponse = await llm.invoke([new SystemMessage(LLM_TOOL_SELECTOR_SYSTEM_PROMPT), human_msg]);

                    if (config.writer && toolRecponse.raw.response_metadata) {
                        config.writer({
                            tokenUsed: (toolRecponse.raw.response_metadata.tokenUsage as any).totalTokens,
                        });
                    }

                    return new Command({ goto: "mockllm", update: { humanMsgId: human_msg.id, relevantTools: toolRecponse.parsed.relevantTools } });

                } else {
                    const api_keys = await getapikeys();
                    if ("GEMINI_API_KEY" in api_keys && "TAVILY_API_KEY" in api_keys) {
                        // llm invocation
                        const llm = new ChatGoogle({
                            apiKey: api_keys.GEMINI_API_KEY,
                            model: "gemini-3-flash-preview"
                        }).withStructuredOutput(toolSelectorOutputSchema, { includeRaw: true });

                        setStatus({ message: "selecting relevant tools...", shouldshow: true });
                        const toolRecponse = await llm.invoke([new SystemMessage(LLM_TOOL_SELECTOR_SYSTEM_PROMPT), human_msg]);

                        if (config.writer && toolRecponse.raw.response_metadata) {
                            config.writer({
                                tokenUsed: (toolRecponse.raw.response_metadata.tokenUsage as any).totalTokens,
                            });
                        };

                        return new Command({ goto: "mockllm", update: { humanMsgId: human_msg.id, relevantTools: toolRecponse.parsed.relevantTools } });
                    } else {
                        if ("Error" in api_keys) {
                            throw new Error(api_keys.Error)
                        }
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

    }

    // --------------------------------main llm invocation--------------------------------

    const mockllm = async (state: z.infer<typeof State>, config: LangGraphRunnableConfig) => {
        try {

            const chatllm = new ChatGoogle({
                apiKey: keyRef.current.GEMINI_API_KEY as string,
                model: "gemini-3-flash-preview"
            });

            let llmModel: any = chatllm;

            if (state.relevantTools && state.relevantTools.length > 0) {
                let relevant_Tools_for_llm = [];

                for (const element of state.relevantTools) {
                    if (element in invoketools) {
                        relevant_Tools_for_llm.push((invoketools as any)[element]);
                    }
                };
                llmModel = chatllm.bindTools(relevant_Tools_for_llm);
            };

            const responce = await llmModel.invoke([...state.messageList]);

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


                setMessages(prev => ({
                    ...prev,
                    message: [
                        ...(prev.message ?? []),
                        {
                            id: uuid(),
                            type: "tool",
                            toolargs: JSON.stringify(element.args),
                            toolname: element.name,
                            message: toolsresponce
                        }
                    ],
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

    const graph = new StateGraph(State)
        .addNode("toolselector", toolselector, { ends: [END, "mockllm"] })
        .addNode("mockllm", mockllm, { ends: [END, "filtertool"] })
        .addNode("filtertool", filtertool, { ends: [END, "toolExecuter", "getPermission"] })
        .addNode("getPermission", getPermision, { ends: [END, "toolExecuter"] })
        .addNode("toolExecuter", toolExecuter, { ends: [END, "mockllm"] })
        .addEdge(START, "toolselector")
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

    interface CUSTOM {
        toolCancled: Grant[],
        status: string,
        tokenUsed: number
    }

    type chunk_type = ["updates", UPDATE] | ["custom", CUSTOM]

    // ----------------- invocation of graph---------------------
    const invoke = async (userinput: string) => {

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
            let input: any = { messageList: [new SystemMessage(SYSTEM_PROMPT1), new HumanMessage({ content: trimedInput, id: uuid() })] };

            const persistancestate = await graph.getState(config);

            if (persistancestate.values.messageList) {
                input = { messageList: [...persistancestate.values.messageList, new HumanMessage({ content: trimedInput, id: uuid() })] };
            };

            // while loop started
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

                            setStatus(prev => ({ ...prev, message: value.status }));
                        }
                        if (value.toolCancled && "toolCancled" in value) {

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


                                    setMessages(prev => ({
                                        ...prev,
                                        message: [
                                            ...(prev.message ?? []),
                                            {
                                                type: "llm",
                                                message: obj_value.finalResponce.toString(),
                                                id: uuid()
                                            }
                                        ],
                                    }));
                                    setStatus({ shouldshow: false, message: "Thinking..." });
                                    setShowInputBox(true);
                                }
                                if ("errorLogs" in obj_value) {

                                    SetInfoMessage({ message: obj_value.errorLogs, shouldshow: true, type: "error" });
                                    setStatus({ shouldshow: false, message: "Thinking..." });
                                    // exit();
                                }
                            }
                        }
                    }
                }

                if (!interrupted) break;
            };

        };
    };

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
        <Box width={size.width} justifyContent="flex-end" paddingRight={1}>
            <Text>
                Token used: <Text color="cyan">{Tokens.toString()}</Text>
            </Text>
        </Box>
    </>);
});

export default App;
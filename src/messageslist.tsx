import { memo } from "react";
import { Text, Box, Static } from 'ink';
import Gradient from "ink-gradient";
import BigText from "ink-big-text";

type MessageTypes = {
    id: string,
    type: "human" | "llm" | "tool" | "logo" | "description",
    message: string,
    toolname: string,
    toolargs: string,
}

interface MSG {
    id: string
    message: MessageTypes[]
};

interface Toolresponce {
    cause: "error" | "timeout" | "success",
    stdout: null | string,
    stderr: null | string,
    toolerror: string | null
};

interface Writefile {
    cause: "error" | "success",
    message: string
}

interface Readfile {
    cause: "error" | "success",
    message: string,
    filedata: string
}

const MessagesList = memo(({ list, Size }: { list: MSG, Size: { width: number | string, height: number | string } }) => {

    return (<>
        <Static key={list.id} style={{ width: Size.width }} items={list.message}>
            {
                (value) => {
                    switch (value.type) {
                        case "human":
                            {
                                return (<Box paddingLeft={1} paddingRight={1} key={value.id} gap={1} flexDirection="column" borderStyle={"round"} borderColor={"gray"}>
                                    <Text wrap="wrap">🙍 human input</Text>
                                    <Text color={"#ababab"} wrap="wrap">{value.message.toString()}</Text>
                                </Box>)
                            }
                        case "llm":
                            {
                                return (<Box paddingLeft={1} paddingRight={1} key={value.id} gap={1} flexDirection="column" borderStyle={"round"} borderColor={"green"}>
                                    <Text wrap="wrap">✨ llm output</Text>
                                    <Text color={"#ababab"} wrap="wrap">{value.message.toString()}</Text>
                                </Box>)
                            }
                        case "tool":
                            {
                                switch (value.toolname) {
                                    case "run_shell_command": {
                                        const parseddata: Toolresponce = JSON.parse(value.message);
                                        return (<Box paddingLeft={1} paddingRight={1} key={value.id} gap={1} flexDirection="column" borderStyle={"round"} borderColor={"#fd7303"}>
                                            <Text wrap="wrap">{`⛏️  tool output`} <Text wrap="wrap" color={"#ababab"}>{`(${value.toolname})`}</Text></Text>
                                            <Text>with args: <Text wrap="truncate-end" color={"#ababab"}>{value.toolargs}</Text></Text>
                                            <Text color={"#ababab"} wrap="wrap">{`cause: ${parseddata.cause}\n\nstdout: ${parseddata.stdout}\n\nstderr: ${parseddata.stderr}\n\ntoolerror: ${parseddata.toolerror}`}</Text>
                                        </Box>)
                                    }
                                        break;
                                    case "write_file": {
                                        const parseddata: Writefile = JSON.parse(value.message)
                                        const parsedargs: { filepath: string, content: string, mode: "write" | "append" } = JSON.parse(value.toolargs as any);
                                        let lines;
                                        let args;
                                        if (parseddata.cause == "success") {
                                            const totallines = parsedargs.content.split('\n').filter(line => line.trim() !== "");
                                            if (totallines.length > 60) {
                                                const finallines = totallines.slice(0, 50).map(line => `+ ${line}`).join('\n');
                                                lines = `${finallines}....more`;
                                            } else {
                                                lines = totallines.map(line => `+ ${line}`).join('\n');
                                            }
                                        };

                                        if (value.toolargs.length > 300) {
                                            args = `${value.toolargs.slice(0, 300)}....`;
                                        } else {
                                            args = value.toolargs;
                                        };

                                        return (<Box paddingLeft={1} paddingRight={1} key={value.id} gap={1} flexDirection="column" borderStyle={"round"} borderColor={"#fd7303"}>
                                            <Text wrap="wrap">{`⛏️  tool output`} <Text wrap="wrap" color={"#ababab"}>{`(${value.toolname})`}</Text></Text>
                                            <Text wrap="wrap">with args: <Text wrap="wrap" color={"#ababab"}>{args}</Text></Text>

                                            {parseddata.cause == "error" ? <Text wrap="wrap">{parseddata.message}</Text> : <Text wrap="wrap" backgroundColor={"green"} >{lines}</Text>}
                                        </Box>)
                                    }
                                        break;
                                    case "read_file": {
                                        const parseddata: Readfile = JSON.parse(value.message);
                                        let lines;
                                        if (parseddata.cause == "success") {
                                            const totallines = parseddata.filedata.split('\n')
                                            if (totallines.length > 50) {
                                                const finallines = totallines.slice(0, 50).join('\n');
                                                lines = `${finallines}....more`;
                                            } else {
                                                lines = parseddata.filedata;
                                            }
                                        }
                                        return (
                                            <Box paddingLeft={1} paddingRight={1} key={value.id} gap={1} flexDirection="column" borderStyle={"round"} borderColor={"#fd7303"}>
                                                <Text wrap="wrap">{`⛏️  tool output`} <Text wrap="wrap" color={"#ababab"}>{`(${value.toolname})`}</Text></Text>
                                                <Text>with args: <Text wrap="truncate-end" color={"#ababab"}>{value.toolargs}</Text></Text>
                                                {parseddata.cause == "error" ? <Text wrap="wrap">{parseddata.message}</Text> : <Text wrap="wrap">{lines}</Text>}
                                            </Box>
                                        )
                                    }
                                        break;
                                    case "edit_file": {
                                        let args;
                                        if (value.toolargs.length > 300) {
                                            args = `${value.toolargs.slice(0, 300)}....`
                                        } else {
                                            args = value.toolargs;
                                        }
                                        return (
                                            <Box paddingLeft={1} paddingRight={1} key={value.id} gap={1} flexDirection="column" borderStyle={"round"} borderColor={"#fd7303"}>
                                                <Text wrap="wrap">{`⛏️  tool output`} <Text wrap="wrap" color={"#ababab"}>{`(${value.toolname})`}</Text></Text>
                                                <Text>with args: <Text wrap="truncate-end" color={"#ababab"}>{args}</Text></Text>
                                                <Text wrap="wrap">{value.message}</Text>
                                            </Box>
                                        )
                                    }
                                    default:
                                        break;
                                }
                            }
                        case "logo": {
                            return (<Box key={value.id} width={"100%"} overflowX="hidden">
                                <Gradient colors={["#ff6404ff", "#ff6404ff"]}>
                                    <BigText align="left" text={value.message} font="huge" />
                                </Gradient>
                            </Box>)
                        }
                        case "description": {
                            const items = value.message.split(',').map((value) => value.trim());
                            return (<Box marginBottom={3} marginTop={3} gap={1} key={value.id} flexDirection="column">
                                <Box flexDirection="column">
                                    <Text>wellcome to hello cli agent.</Text>
                                    <Text>tips to getting started.</Text>
                                </Box>
                                <Box flexDirection="column">
                                    {
                                        items.map((value, index) => (
                                            <Text key={index + 1} wrap="wrap" color={"#ababab"} >{`${index + 1} ${value}`}</Text>
                                        ))
                                    }
                                </Box>
                            </Box>)
                        }
                        default:
                            break;
                    }
                }
            }
        </Static>

    </>)
});

export default MessagesList;
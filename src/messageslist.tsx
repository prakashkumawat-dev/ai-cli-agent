import { memo } from "react";
import { Text, Box, Static } from 'ink';
import Gradient from "ink-gradient";
import BigText from "ink-big-text";

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
                                    <Text color={"gray"} wrap="wrap">{value.message.toString()}</Text>
                                </Box>)
                            }
                        case "llm":
                            {
                                return (<Box paddingLeft={1} paddingRight={1} key={value.id} gap={1} flexDirection="column" borderStyle={"round"} borderColor={"green"}>
                                    <Text wrap="wrap">✨ llm output</Text>
                                    <Text color={"gray"} wrap="wrap">{value.message.toString()}</Text>
                                </Box>)
                            }
                        case "tool":
                            {
                                return (<Box paddingLeft={1} paddingRight={1} key={value.id} gap={1} flexDirection="column" borderStyle={"round"} borderColor={"#fd7303"}>
                                    <Text wrap="wrap">{`⛏️  tool output`} <Text wrap="wrap" color={"gray"}>{`(${value.toolname})`}</Text></Text>
                                    <Text>with args: <Text wrap="truncate-end" color={"gray"}>{value.toolargs}</Text></Text>
                                    <Text wrap="wrap">{value.message}</Text>
                                </Box>)
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
                                            <Text key={index + 1} wrap="wrap" color={"gray"} >{`${index + 1} ${value}`}</Text>
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
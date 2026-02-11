import { useState, memo } from "react";
import { Text, Box } from 'ink';

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

const MessagesList = memo(({ list }: { list: MSG }) => {

    return (<>
        <Box width={"100%"} flexDirection="column">
            {list?.message?.map((value, index) => {
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
                                <Text wrap="wrap">{value.message}</Text>
                            </Box>)
                        }
                    default:
                        break;
                }
            })}
        </Box>
    </>)
});

export default MessagesList;

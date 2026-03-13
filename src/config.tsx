import { Text, Box, useStdout, Static, useInput, useApp } from "ink";
import type { FC, Dispatch, SetStateAction } from "react";
import { useEffect, useState, useRef } from 'react'
import BigText from "ink-big-text";
import Gradient from "ink-gradient";
import { PasswordInput, Spinner, StatusMessage } from '@inkjs/ui'
import { CheckGeminiApiKey, CheckTavilyApiKey } from './Tests.js';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from "node:path";
import { v4 as uuid } from "uuid"

interface child {
    Setconfigrations: Dispatch<SetStateAction<boolean | null>>,

};

interface Info {
    ShouldShowInfo: boolean,
    message?: string,
    Type: "error" | "success",
};

interface CONFIG {
    id: string,
    statics: { first: boolean, second: boolean }[],
    height: number | string | undefined,
    width: number | string
};

const Config: FC<child> = ({ Setconfigrations }) => {
    const [Spinnerconfig, Setspinnerconfig] = useState<boolean>(false);
    const [data, Setdata] = useState<CONFIG>({ id: uuid(), statics: [{ first: true, second: false }], height: undefined, width: "100%" });
    const [info, setinfo] = useState<Info>({ ShouldShowInfo: false, Type: "success" });

    const { exit } = useApp();

    const Secrets = useRef({
        GEMINI_API_KEY: '',
        TAVILY_API_KEY: ''
    });

    const { stdout } = useStdout();

    useEffect(() => {
        let timeout: any = null;
        const updatesize = () => {
            if (timeout) {
                clearTimeout(timeout);
            };

            timeout = setTimeout(() => {
                process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
                Setdata(prev => ({ ...prev, id: uuid(), height: stdout.rows, width: stdout.columns }));
            }, 500);
        };

        stdout.on('resize', updatesize);
        return () => {
            stdout.off('resize', updatesize);
        }
    }, []);
    useInput((input, key) => {
        if (key.ctrl && input === 'c') exit()
    });

    const handelSubmit1 = async (Gemini?: string | null, Tavily?: string | null) => {
        if (Gemini) {
            Setspinnerconfig(true);
            const isvalid = await CheckGeminiApiKey(Gemini);
            if (isvalid.success) {
                Secrets.current.GEMINI_API_KEY = Gemini;

                process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
                Setdata(prev => ({ ...prev, id: uuid(), statics: [{ first: false, second: true }] }))
                Setspinnerconfig(false);
                setinfo({ ShouldShowInfo: true, message: isvalid.message, Type: "success" });
            } else {
                Setspinnerconfig(false)
                setinfo({ ShouldShowInfo: true, message: isvalid.message, Type: "error" });
            }
        }

        if (Tavily) {
            Setspinnerconfig(true);
            const isvalid = await CheckTavilyApiKey(Tavily);
            if (isvalid.success) {
                Setspinnerconfig(false);
                Secrets.current.TAVILY_API_KEY = Tavily;
                await writeFile(path.join(os.homedir(), 'my-cli/config.json'), JSON.stringify(Secrets.current));
                process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
                Setdata(prev => ({ ...prev, id: uuid(), statics: [{ first: false, second: false }] }))
                setinfo({ ShouldShowInfo: true, message: "✅ validation succsesfull", Type: "success" });
                Setconfigrations(true);
            } else {
                Setspinnerconfig(false);
                setinfo({ ShouldShowInfo: true, message: isvalid.message, Type: "error" });
            }
        }
    };

    return (<>
        <Static style={{ width: data.width }} key={data.id} items={data.statics}>
            {
                () => (
                    <Box flexDirection="column" key={"wewe"}>
                        <Gradient colors={["#ff6404ff", "#ff6404ff"]}>
                            <BigText align="left" text="HELLO" font="huge" />
                        </Gradient>
                        <Text wrap="wrap">Hi, Wellcome to the my-cli ai agent. just setup your envirnment to getting started. to seting following api keys</Text>
                    </Box>
                )
            }
        </Static>
        <Box width={data.width} flexDirection="column" gap={2} marginTop={1} marginBottom={1}>
            <Box flexDirection="column">
                <Text>1. Enter a valid GEMINI_API_KEY</Text>
                <PasswordInput isDisabled={!(data.statics[0] as any).first} placeholder="Enter your GEMINI_API_KEY" onSubmit={(key) => handelSubmit1(key, null)} />
            </Box>
            {(data.statics[0] as any).second && <Box flexDirection="column">
                <Text>2. Enter a valid Tavily_API_KEY</Text>
                <PasswordInput isDisabled={!(data.statics[0] as any).second} placeholder="Enter your Tavily_API_KEY" onSubmit={(key) => handelSubmit1(null, key)} />
            </Box>}
        </Box>
        {Spinnerconfig && <Spinner label="validating given api key..." />}
        {info.ShouldShowInfo && <Box width={data.width} flexDirection="column" paddingLeft={1} borderColor={info.Type == "error" ? "red" : "green"} marginTop={1} borderStyle={'round'}>
            <Box marginBottom={1}>
                <StatusMessage variant={info.Type == "error" ? "error" : "success"}>
                    <Text wrap="wrap" >{info.Type == 'error' ? info.message : "Success"}</Text>
                </StatusMessage>
            </Box>
        </Box>}
    </>
    )
};

export default Config;
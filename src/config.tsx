import { Text, Box, useStdout } from "ink";
import type { FC, Dispatch, SetStateAction } from "react";
import { useEffect, useState, useRef } from 'react'
import Logo from "./logo.js";
import { PasswordInput, Spinner, StatusMessage } from '@inkjs/ui'
import { CheckGeminiApiKey, CheckTavilyApiKey } from './Tests.js'
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from "node:path";
import process from "node:process";

interface child {
    Setconfigrations: Dispatch<SetStateAction<boolean | null>>,

};

interface show {
    first: boolean,
    second: boolean
}

interface Info {
    ShouldShowInfo: boolean,
    message?: string,
    Type: "error" | "success",
};

const Config: FC<child> = ({ Setconfigrations }) => {
    const [Size, SetSize] = useState({ height: 0, width: 0 });
    const [Spinnerconfig, Setspinnerconfig] = useState<boolean>(false);
    const [showinput, setshowinput] = useState<show>({ first: true, second: false });
    const [info, setinfo] = useState<Info>({ ShouldShowInfo: false, Type: "success" });

    const Secrets = useRef({
        GEMINI_API_KEY: '',
        TAVILY_API_KEY: ''
    });

    const { stdout } = useStdout();

    useEffect(() => {
        console.clear();
        function updatesize1() {
            SetSize({ height: stdout.rows, width: stdout.columns });
        }

        if (Size.height == 0) {
            updatesize1()
        };

        stdout.on('resize', updatesize1);
        return () => {
            stdout.off('resize', updatesize1);
            console.clear();
        }
    }, [stdout]);

    const handelSubmit1 = async (Gemini?: string | null, Tavily?: string | null) => {
        if (Gemini) {
            Setspinnerconfig(true);
            const isvalid = await CheckGeminiApiKey(Gemini);
            if (isvalid.success) {
                Secrets.current.GEMINI_API_KEY = Gemini;
                setshowinput({ first: false, second: true });
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
                setshowinput({ first: false, second: false });
                setinfo({ ShouldShowInfo: true, message: "✅ validation succsesfull", Type: "success" });
                Setconfigrations(true);
            } else {
                Setspinnerconfig(false);
                setinfo({ ShouldShowInfo: true, message: isvalid.message, Type: "error" });
            }
        }
    };

    return (
        <Box flexDirection="column" height={Size.height} width={Size.width}>
            <Logo />
            <Text wrap="wrap">Hi, Wellcome to the my-cli ai agent. just setup your envirnment to getting started. to seting following api keys</Text>
            <Box flexDirection="column" gap={2} marginTop={1} marginBottom={1}>
                <Box flexDirection="column">
                    <Text>1. Enter a valid GEMINI_API_KEY</Text>
                    <PasswordInput isDisabled={!showinput.first} placeholder="Enter your GEMINI_API_KEY" onSubmit={(key) => handelSubmit1(key, null)} />
                </Box>
                {showinput.second && <Box flexDirection="column">
                    <Text>2. Enter a valid Tavily_API_KEY</Text>
                    <PasswordInput isDisabled={!showinput.second} placeholder="Enter your Tavily_API_KEY" onSubmit={(key) => handelSubmit1(null, key)} />
                </Box>}
            </Box>
            {Spinnerconfig && <Spinner label="validating given api key..." />}
            {info.ShouldShowInfo && <Box flexDirection="column" paddingLeft={1} borderColor={info.Type == "error" ? "red" : "green"} marginTop={1} borderStyle={'round'}>
                <Box marginBottom={1}>
                    <StatusMessage variant={info.Type == "error" ? "error" : "success"}>
                        {info.Type == 'error' ? "Error" : "Success"}
                    </StatusMessage>
                </Box>
                <Text>{info.message?.toString()}</Text>
            </Box>}
            <Text>{`is raw mode active? ${process.stdin.isRaw}`}</Text>
        </Box>
    )
};

export default Config;

#!/usr/bin/env node
import React, { useState, useEffect, memo } from "react";
import { render, Text } from 'ink';
import App from "./app.js";
import Config from "./config.js";
import { constants, access, readFile, mkdir } from 'node:fs/promises';
import path from "node:path";
import os from 'node:os';
import { Spinner } from '@inkjs/ui'

const Cli = memo(() => {

    const [isConfigured, setIsConfigured] = useState<boolean | null>(null);


    useEffect(() => {
        const directoryPath = path.join(os.homedir(), 'my-cli');
        const filePath = path.join(directoryPath, 'config.json');

        const checkConfiguration = async () => {
            try {
                await access(filePath, constants.F_OK);
                const data = await readFile(filePath, { encoding: "utf8" });
                const jsonData = JSON.parse(data);

                const isGeminiValid = jsonData?.GEMINI_API_KEY && jsonData.GEMINI_API_KEY.trim().length > 5;
                const isTavilyValid = jsonData?.TAVILY_API_KEY && jsonData.TAVILY_API_KEY.trim().length > 5;

                if (isGeminiValid && isTavilyValid) {
                    setIsConfigured(true);
                } else {
                    setIsConfigured(false);
                }
            } catch (error) {
                try {
                    await mkdir(directoryPath, { recursive: true });
                } catch (err) {

                }
                setIsConfigured(false);
            }
        };

        checkConfiguration();
    }, []);


    if (isConfigured === null) {
        return <Spinner label="Loading" type="christmas" />
    }

    if (isConfigured) {
        return <App key={'main'} />;
    } else {
        return <Config key={'configration'} Setconfigrations={setIsConfigured} />;
    }
});

const app = render(<Cli />);
app.waitUntilExit().then(() => {
    process.exit(0);
});
import { tool } from "@langchain/core/tools";
import z from 'zod';
import process from 'node:process';
import fs from 'node:fs';
import path from "node:path";
import { spawn, exec } from 'node:child_process';
import stripAnsi from 'strip-ansi';
import kill from 'tree-kill';
import readline from 'readline/promises';

const patterns = [
    /are you sure/i,
    /do you want/i,
    /continue\?/i,
    /proceed\?/i,
    /\(\s*y\s*\/\s*n\s*\)/i,
    /press enter/i,
    /press any key/i,
    /select/i,
    /choose/i,
    /project name/i,
    /package name/i,
    /\?\s*$/,
    /\(\s*yes\s*\/\s*no\s*\)/i
];

interface PID {
    process_id: number,
    working_directory: string | undefined,
    shell_command: string
};

let platform = process.platform;
let ispwshexsist = true;

let processID: PID[] = [];

process.on("exit", (code) => {
    if (processID.length > 0) {
        for (const element of processID) {
            process.kill(element.process_id);
        }
    }
});

export const ispowershell = () => {
    exec("where powershell", (err, stdout) => {
        if (err) {
            ispwshexsist = false;
        }
    });
};


const isFileExsist = async (filepath: string) => {
    try {
        await fs.promises.access(filepath);
        return {
            exsist: true,
            isError: false
        };
    } catch (error) {
        return {
            exsist: false,
            isError: error
        }
    };
};

export const read_file = tool(
    async ({ file_path, offset, limit }) => {
        try {
            if (!file_path) {
                return JSON.stringify({ cause: "error", message: "File path is not provided please provid relativ file path to read file" })
            }

            if (path.isAbsolute(file_path)) {
                return JSON.stringify({ cause: "error", message: "Absolute paths are not allowed for security reasons. Please provide a relative path (e.g., 'folder/file.txt') instead." })
            }

            let cleanPath = file_path.replace(/^[/\\]+/, '');

            const normalizedPath = path.normalize(cleanPath);

            const absolutepath = path.resolve(normalizedPath);

            const { exsist, isError } = await isFileExsist(absolutepath);
            if (!exsist) {
                return JSON.stringify({ cause: "error", message: `${isError}` })
            };


            const input = fs.createReadStream(absolutepath);

            const rl = readline.createInterface({ input, crlfDelay: Infinity });

            let currentLine = 0;
            let result = [];
            let OffSet = offset;

            for await (const line of rl) {
                currentLine++;

                // skip lines until offset
                if (currentLine <= offset) continue;

                // collect lines
                OffSet += 1;
                result.push(`${OffSet}| ${line}`);

                // stop when limit reached
                if (result.length === limit) {
                    rl.close();
                    break;
                }
            };

            if (result.length == 0) {
                return `Warning: the file is empty`
            }

            // return result.join('\n');
            return `These are the lines within offset ${offset} to limit ${limit} of filepath: ${file_path}\n\n${result.join('\n')}`

        } catch (error) {
            if (error instanceof Error) {
                return `Error: ${error.message}`
            };
            return `Error: ${error}`;
        }
    },
    {
        name: "read_file",
        description: `Reads the files

This tool reads the file from the provided file path and outputs the file content with line numbers. It do not read the .env file or any other file that can leak user privacy.

Usage:
- By default, it reads up to 100 lines starting from the beginning of the file
- **IMPORTANT for large files and codebase exploration**: Use pagination with offset and limit parameters to avoid context overflow
  - First scan: read_file(path, limit=100) to see file structure
  - Read more sections: read_file(path, offset=100, limit=200) for next 200 lines
  - Only omit limit (read full file) when necessary for editing
- Specify offset and limit: read_file(path, offset=0, limit=100) reads first 100 lines
- Results are returned with line numbers
- You have the capability to call multiple tools in a single response. It is always better to speculatively read multiple files as a batch that are potentially useful.

`,
        schema: z.object({
            file_path: z.string().describe("Absolute path to the file to read"),
            offset: z.coerce
                .number()
                .optional()
                .default(0)
                .describe("Line offset to start reading from (0-indexed)"),
            limit: z.coerce
                .number()
                .optional()
                .default(100)
                .describe("Maximum number of lines to read"),
        }),
    },
);


// ✅
export const write_file = tool(
    async ({ filepath, content, mode }) => {
        try {
            if (!filepath) {
                return JSON.stringify({ cause: "error", message: "File path is not provided please provid relativ file path" })
            }

            if (path.isAbsolute(filepath)) {
                return JSON.stringify({ cause: "error", message: "Absolute paths are not allowed for security reasons. Please provide a relative path (e.g., 'folder/file.txt') instead." })
            }

            if (!content) {
                return JSON.stringify({ cause: "error", message: "content is not provided please provide the code to write in the file" })
            }

            let cleanPath = filepath.replace(/^[/\\]+/, '');

            const normalizedPath = path.normalize(cleanPath);

            const absolutepath = path.resolve(normalizedPath);

            if (mode == "write") {
                await fs.promises.writeFile(absolutepath, content)
                return JSON.stringify({ cause: "success", message: "file successfully wrote" });
            } else {
                await fs.promises.appendFile(absolutepath, `\n${content}`);
                return JSON.stringify({ cause: "success", message: `appended succesfully in ${filepath}` })
            }
        } catch (error) {
            if (error instanceof Error) {
                return JSON.stringify({ cause: "error", message: error.message });
            };
            return JSON.stringify({ cause: "error", message: (error as string).toString() });
        }
    },
    {
        name: "write_file",
        description: "Writes the provided content to the specified file according to the **mode**. This is useful for writing code files and any files.",
        schema: z.object({
            filepath: z.string().describe("The **RELATIVE** path of the file starting from project root. Example: 'src/components/Button.js' or 'package.json'. Do not use absolute paths like 'C:/Users/...'."),
            content: z.string().describe("content that have to be write in the file"),
            mode: z.enum(["write", "append"]).default("write").describe(`The default mode is **write**, which overwrites the file if it already contains content.
If the mode is ""append**, new content is added to the end of the file without overwriting existing data.`)
        })
    }
);



// ✅
export const edit_file = tool(
    async ({ file_path, old_string, new_string, replace_all }) => {

        try {
            let content = "";
            const absolutepath = path.resolve(file_path);

            const { exsist, isError } = await isFileExsist(absolutepath);

            if (isError) {
                return JSON.stringify({ error: `filepath does not exsist ${isError}` })
            };

            content = await fs.promises.readFile(absolutepath, { encoding: "utf-8" });

            const occurrences = content.split(old_string).length - 1;

            if (occurrences === 0) {
                return `Error: String not found in file: '${old_string}'`;
            };

            if (occurrences > 1 && !replace_all) {
                return `Error: String '${old_string}' has multiple occurrences (appears ${occurrences} times) in file. Use replace_all=True to replace all instances, or provide a more specific string with surrounding context.`;
            };

            if (content === "" && old_string === "") {
                await fs.promises.writeFile(absolutepath, new_string);
                return `succsesfully replaced old_string with new_string`
            };

            const newcode = content.split(old_string).join(new_string);

            await fs.promises.writeFile(absolutepath, newcode);

            return `succsesfully replaced old_string with new_string`

        } catch (error) {
            if (error instanceof Error) {
                return `error: ${error.message}`
            }
            return `error: ${error}`;
        }
    },
    {
        name: "edit_file",
        description: `Performs exact string replacements in files.

Usage:
- You must read the file before editing or already know its contents. This tool will throw an error if you try to edit without context. If you just wrote the file, you can edit it since you already know its content.
- When editing, preserve the exact indentation (tabs/spaces) from the read output. Never include line number prefixes in old_string or new_string.
- ALWAYS prefer editing existing files over creating new ones.
- Only use emojis if the user explicitly requests it.`,
        schema: z.object({
            file_path: z.string().describe("relative path to the file to edit"),
            old_string: z
                .string()
                .describe("String to be replaced (must match exactly)"),
            new_string: z.string().describe("String to replace with"),
            replace_all: z
                .boolean()
                .optional()
                .default(false)
                .describe("Whether to replace all occurrences"),
        }),
    },
);

// ✅
export const run_shell_command = tool(
    async ({ command, dirpath, timeout, iskeepalive }) => {
        return new Promise((resolve) => {
            try {
                let isposix = process.platform === "win32";
                let stdout: string = "";
                let stderr: string = "";
                let child;
                let isTerminated = false;
                let isTimeout = false;
                const cwd = dirpath ? path.resolve(dirpath) : undefined;

                // --------------old process termination------------
                if (processID.length > 0) {
                    let errarr: string[] = [];
                    for (const element of processID) {
                        if (element.shell_command === command && element.working_directory === dirpath) {
                            kill(element.process_id, (err) => {
                                if (err) {
                                    errarr.push(stripAnsi(err.message));
                                }
                            })
                        }
                    };
                    if (errarr.length > 0) {
                        resolve(JSON.stringify({ cause: "error", stdout: null, stderr: null, toolerror: `${errarr.join(isposix ? '\n' : '\r\n')}` }));
                    }
                    else {
                        processID = [];
                    }
                };

                if (!command) {
                    resolve(JSON.stringify({ cause: "error", stdout: null, stderr: null, toolerror: "command is not provided" }));
                };

                if (!isposix) {
                    child = spawn(command, { cwd, env: { ...process.env, CI: "true" }, shell: true });
                } else {
                    if (ispwshexsist) {
                        child = spawn("powershell.exe", ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { cwd, env: { ...process.env, CI: "true" } });
                    } else {
                        child = spawn(command, { cwd, env: { ...process.env, CI: "true" }, shell: true });
                    }
                };

                child.stdout.setEncoding("utf8");
                child.stderr.setEncoding("utf8");

                // ------------------ handling process timeout ---------------------
                const timer = setTimeout(() => {
                    if (!isTerminated) {
                        if (iskeepalive) {
                            if (child.pid) {
                                processID = [...processID, { process_id: child.pid, shell_command: command, working_directory: cwd }];
                            };
                            resolve(JSON.stringify({ cause: "success", stdout: stdout.length > 0 ? stdout : null, stderr: stderr.length > 0 ? stderr : null, toolerror: null }));
                        } else {
                            if (child.pid) {
                                isTimeout = true;
                                kill(child.pid, (err) => {
                                    if (err) {
                                        resolve(JSON.stringify({ cause: "success", stdout: null, stderr: null, toolerror: err.message }));
                                    }
                                });
                            }
                        };
                    } else {
                        clearTimeout(timer);
                    }
                }, timeout);

                // stdout data
                child.stdout.on("data", (data) => {
                    stdout += stripAnsi(data.toString());
                    const text = stripAnsi(data.toString());

                    if (patterns.some(regex => regex.test(text))) {
                        if (child.stdin.writable) {
                            if (process.platform != "win32") child.stdin.write('\n');
                            else child.stdin.write('\r\n');
                        };
                    };
                });

                // stderr
                child.stderr.on("data", (err) => {
                    stderr += stripAnsi(err.toString());
                });

                // error detection
                child.on("error", (err) => {
                    isTerminated = true;
                    clearTimeout(timer);
                    if (err instanceof Error) {
                        resolve(JSON.stringify({ cause: "error", stdout: stdout.length > 0 ? stdout : null, stderr: err.message, toolerror: null }));
                    } else {
                        resolve(JSON.stringify({ cause: "error", stdout: stdout.length > 0 ? stdout : null, stderr: err, toolerror: null }));
                    }
                });

                child.on("close", (code) => {
                    isTerminated = true;

                    clearTimeout(timer);

                    if (code === 0) {
                        resolve(JSON.stringify({ cause: "success", stdout: stdout.length > 0 ? stdout : null, stderr: stderr.length > 0 ? stderr : null, toolerror: null }));
                    }
                    else {
                        if (isTimeout) {
                            resolve(JSON.stringify({ cause: "timeout", stdout: stdout.length > 0 ? stdout : null, stderr: stderr.length > 0 ? stderr : null, toolerror: null }));
                        }
                        else {
                            resolve(JSON.stringify({ cause: "error", stdout: stdout.length > 0 ? stdout : null, stderr: stderr.length > 0 ? stderr : null, toolerror: null }));
                        }
                    }
                });

            } catch (error) {
                if (error instanceof Error) {
                    resolve(JSON.stringify({ cause: "error", stdout: null, stderr: null, toolerror: error.message }));
                } else {
                    resolve(JSON.stringify({ cause: "error", stdout: null, stderr: null, toolerror: error }));
                }
            }
        });
    },
    {
        name: "run_shell_command",
        description: `## Description

Executes shell commands and returns stdout, stderr, with metadeta.

## When to Use This Tool

Use this tool when:

- You need to install project dependencies , list directoryes , create directoryes ans files.
- when you need to start the application server (for example, in Vite or Next.js) with **npm run dev** or according package manager. It also lets you check logs and detect errors, which is useful for debugging.

## Strict Rules

- When running scripts to install project dependencies, always use non-interactive flags. This ensures no human confirmation or input is required, as this tool is optimized to run commands in a non-interactive manner.
- Never run harmful commands.
- never use this tool for read and write file , and all those commands that returns the long stdout like **ls -r** , because it can create the infinite loop.
- never list the node_modules like folders because it can create the infinite and endless process.
- whenever you need to start application server(but not for debuging purpose) **timeout** should be less then 15000 miliseconds.
- always run commands according the **About system**
- Sometimes while creating a project, the script only generates the project structure and asks you to run npm i or pnpm i (depending on the package manager). If a folder is created with a package.json inside it, first cd into that folder and then install the dependencies. ex- **npm create vite@latest my-app -- --template react && cd my-app && npm i**.
- Once the application server starts(dev or any), it should not start again until the user explicitly asks to restart it. because i do not close that connection.

## About system

this is about the system:

- operating system - ${platform}
- shell - ${platform == "win32" ? ispwshexsist ? "powershell" : "cmd" : platform == "linux" ? "bash" : platform == "darwin" ? "zsh" : "system default"}

## Resources:-

Here are the web links for additional knowledge:

- https://nextjs.org/docs/app/api-reference/cli/create-next-app - This is the official documentation link for Next.js installation commands used in a non-interactive manner.
- https://www.npmjs.com/package/create-vite - This is the official documentation link for Vite’s npm package, which describes the non-interactive installation commands and flags.`,
        schema: z.object({
            command: z.string().describe("command for run"),
            dirpath: z.string().optional().describe("relative path of directory in which have to run command"),
            timeout: z.number().default(120000).describe("timeout in miliseconds"),
            iskeepalive: z.boolean().default(false).describe(
                "Controls whether the process should continue running after the timeout. " +
                "If false(default), the process will be terminated when the timeout is reached. " +
                "If true, the process will continue running even after the timeout. " +
                "This is useful for long-running processes such as starting a development server (e.g., Next.js, Vite, or Node.js server) where the process must remain active to allow users to access the application."
            )
        })
    }
);

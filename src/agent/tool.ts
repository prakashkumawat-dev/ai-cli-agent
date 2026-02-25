import { tool } from "@langchain/core/tools";
import z from 'zod';
import process from 'node:process';
import fs from 'node:fs';
import path from "node:path";
import { spawn } from 'node:child_process';
import stripAnsi from 'strip-ansi';
import { tavily } from '@tavily/core';
import kill from 'tree-kill';

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
let processID: PID[] = [];

const saftyPath = (dirPath: string) => {
    try {
        const fullPath = path.resolve(process.cwd(), dirPath);
        return {
            absolutepath: fullPath,
            Error: null
        }

    } catch (error) {

        if (error instanceof Error) {
            return {
                absolutepath: null,
                Error: JSON.stringify({ error: error.message })
            }
        }
        return {
            absolutepath: null,
            Error: `${error}`
        }
    }
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


export const read_File = tool(async ({ filePath }) => {
    try {
        if (!filePath) {
            return `File path is not provided please provid relativ file path to read file`
        }

        if (path.isAbsolute(filePath)) {
            return `Error: Absolute paths are not allowed for security reasons. Please provide a relative path (e.g., 'folder/file.txt') instead.`;
        }

        let cleanPath = filePath.replace(/^[/\\]+/, '');

        const normalizedPath = path.normalize(cleanPath);

        const { absolutepath, Error } = saftyPath(normalizedPath);

        if (!absolutepath) {
            return Error
        };

        const { exsist, isError } = await isFileExsist(absolutepath);
        if (!exsist) {
            return `Error occurred: ${isError}`
        };

        const data = await fs.promises.readFile(absolutepath, { encoding: "utf-8" });

        const lines = data.split('\n');

        const numbereddata = lines.map((line, index) => {
            return `${index + 1} | ${line}`;
        }).join('\n');

        return numbereddata;

    } catch (error) {
        if (error instanceof Error) {
            return JSON.stringify({
                Error: error.message
            });
        };
        return JSON.stringify({
            Error: error
        });
    }
},
    {
        name: "read_File",
        description: "This tool reads the file from the provided file path and outputs the file content with line numbers. It must not read the .env file or any other file that can leak user privacy.",
        schema: z.object({
            filePath: z.string().describe("the relative path of the file. always give ralative path of the file.")
        })
    }
);


// console.log(await read_File.invoke({ filePath: "//prakash//banwari//index.txt" }));

// ✅
export const write_File = tool(
    async ({ filePath, content }) => {
        try {

            if (!filePath) {
                return `File path is not provided please provid relativ file path`
            }

            if (path.isAbsolute(filePath)) {
                return `Error: Absolute paths are not allowed for security reasons. Please provide a relative path (e.g., 'folder/file.txt') instead.`;
            }

            if (!content) {
                return `content is not provided please provide the code to write in the file`
            }

            let cleanPath = filePath.replace(/^[/\\]+/, '');

            const normalizedPath = path.normalize(cleanPath);

            const { absolutepath, Error } = saftyPath(normalizedPath);

            if (!absolutepath) {
                return Error
            }
            const { exsist, isError } = await isFileExsist(absolutepath);
            if (!exsist) {
                return `Error occurred: ${isError}`
            };

            await fs.promises.writeFile(absolutepath, content)
            return `file successfully wrote `
        } catch (error) {
            if (error instanceof Error) {
                return JSON.stringify({
                    Error: error.message
                });
            };
            return JSON.stringify({
                Error: error
            });
        }
    },
    {
        name: "write_File",
        description: "write the provided content in the specified file. but if the content is already avelable then it overwrite. use me for writing empty files and when you have to overwrite.",
        schema: z.object({
            filePath: z.string().describe("The RELATIVE path of the file starting from project root. Example: 'src/components/Button.js' or 'package.json'. Do not use absolute paths like 'C:/Users/...'."),
            content: z.string().describe("content that have to be write in the file")
        })
    }
);

// console.log(await write_File.invoke({filePath:"index.txt",content:"hy how are you"}));

// ✅
export const append_File = tool(
    async ({ filePath, content }) => {
        try {

            if (!filePath) {
                return `File path is not provided please provid relativ file path`
            }

            if (path.isAbsolute(filePath)) {
                return `Error: Absolute paths are not allowed for security reasons. Please provide a relative path (e.g., 'folder/file.txt') instead.`;
            }

            if (!content) {
                return `Error: content is not provided! , please provide the content to append.`
            }

            let cleanPath = filePath.replace(/^[/\\]+/, '');

            const normalizedPath = path.normalize(cleanPath);
            const { absolutepath, Error } = saftyPath(normalizedPath);

            if (!absolutepath) {
                return Error
            }
            const { exsist, isError } = await isFileExsist(absolutepath);
            if (!exsist) {
                return `Error occurred: ${isError}`
            };

            await fs.promises.appendFile(absolutepath, `\n${content}`);
            return `appended or added succsesfully in ${filePath}`
        } catch (error) {
            if (error instanceof Error) {
                return JSON.stringify({
                    Error: error.message
                });
            };
            return JSON.stringify({
                Error: error
            });
        }
    },
    {
        name: "append_File",
        description: "it write the content in the file but not overwrite the content that already have. it actualy append or add the content in the file's last. use this when you have to add content in file.",
        schema: z.object({
            filePath: z.string().describe("relative file path in which have to append content"),
            content: z.string().describe("content that have to be append in the file")
        })
    }
);



export const search_in_file = tool(
    async ({ filePath, startline, endline }) => {
        try {

            if (!filePath) {
                return `File path is not provided please provid relativ file path to read file`
            }

            if (path.isAbsolute(filePath)) {
                return `Error: Absolute paths are not allowed for security reasons. Please provide a relative path (e.g., 'folder/file.txt') instead.`;
            }

            let cleanPath = filePath.replace(/^[/\\]+/, '');

            const normalizedPath = path.normalize(cleanPath);

            const { absolutepath, Error } = saftyPath(normalizedPath);

            if (!absolutepath) {
                return Error
            }
            const { exsist, isError } = await isFileExsist(absolutepath);
            if (!exsist) {
                return `Error occurred: ${isError}`
            };

            const data = await fs.promises.readFile(absolutepath, { encoding: "utf-8" });

            const lines = data.split('\n');

            endline = endline || startline;

            if (startline < 1 || endline > lines.length) {
                return `Error: Line number out of range. File has ${lines.length} lines.`;
            }

            const selectedLines = lines
                .slice(startline - 1, endline)
                .map((line, index) => {
                    const lineNumber = startline + index;
                    return `${lineNumber} | ${line}`;
                })
                .join("\n");

            return `Selected code from line ${startline} to ${endline}:\n\n${selectedLines}`;
        } catch (error) {
            if (error instanceof Error) {
                return JSON.stringify({
                    Error: error.message
                });
            };
            return JSON.stringify({
                Error: error
            });
        }
    },
    {
        name: "search_in_file",
        description: "Search the specific part or lines of code and return them from the given file.",
        schema: z.object({
            filePath: z.string().describe("relativ path of the file to search in"),
            startline: z.number().describe("The number of the initial line from where to start taking the code"),
            endline: z.number().optional().describe("The line number up to which the code needs to be taken is optional, because sometimes you may only need to take a single line.")
        })
    }
);

// console.log(await search_in_file.invoke({ filePath: "index.txt", startline: 23, endline: 40 }));

// ✅
export const delete_in_file = tool(
    async ({ filePath, startline, endline, }) => {

        try {
            if (!filePath) {
                return `File path is not provided please provid relativ file path to read file`
            }

            if (path.isAbsolute(filePath)) {
                return `Error: Absolute paths are not allowed for security reasons. Please provide a relative path (e.g., 'folder/file.txt') instead.`;
            }

            let cleanPath = filePath.replace(/^[/\\]+/, '');

            const normalizedPath = path.normalize(cleanPath);

            const { absolutepath, Error } = saftyPath(normalizedPath);

            if (!absolutepath) {
                return Error
            }
            const { exsist, isError } = await isFileExsist(absolutepath);
            if (!exsist) {
                return `Error occurred: ${isError}`
            };

            const data = await fs.promises.readFile(absolutepath, { encoding: "utf-8" });

            const lines = data.split('\n');

            endline = endline || startline;


            if (startline < 1 || endline > lines.length) {
                return `Error: Line number out of range. File has ${lines.length} lines.`;
            }

            const beforelines = lines.slice(0, startline - 1).join('\n').trim();
            const afterlines = lines.slice(endline).join('\n').trim();


            const finallines = [beforelines, afterlines];

            // write updated content

            await fs.promises.writeFile(absolutepath, finallines.join('\n\n'));

            return `Success: Deleted lines ${startline} to ${endline} in ${filePath}`

        } catch (error) {
            if (error instanceof Error) {
                return JSON.stringify({
                    Error: error.message
                });
            };
            return JSON.stringify({
                Error: error
            });
        }

    },
    {
        name: "delete_in_file",
        description: "delete the specific part of the file",
        schema: z.object({
            filePath: z.string().describe("relative filepath of the file in which have to delete code"),
            startline: z.number().describe("The number of the initial line from where to start deleting the code"),
            endline: z.number().optional().describe("The line number up to which the code needs to be delete. this is optional, Because it may be necessary to delete just one line")
        })
    }
);

// console.log(await delete_in_file.invoke({ filePath: "experiment.ts", startline: 103, endline: 105 }));

// ✅
export const edit_file = tool(
    async ({ filePath, startline, endline, newcode }) => {
        try {
            if (!filePath) {
                return `File path is not provided please provid relativ file path to read file`
            }

            if (path.isAbsolute(filePath)) {
                return `Error: Absolute paths are not allowed for security reasons. Please provide a relative path (e.g., 'folder/file.txt') instead.`;
            }

            if (!newcode) {
                return `newcode is not provided to edit! , please provide newcode.`
            }

            let cleanPath = filePath.replace(/^[/\\]+/, '');

            const normalizedPath = path.normalize(cleanPath);

            const { absolutepath, Error } = saftyPath(normalizedPath);

            if (!absolutepath) {
                return Error
            }
            const { exsist, isError } = await isFileExsist(absolutepath);
            if (!exsist) {
                return `Error occurred: ${isError}`
            };


            const data = await fs.promises.readFile(absolutepath, { encoding: "utf-8" });

            const lines = data.split('\n');

            endline = endline || startline;


            if (startline < 1 || endline > lines.length) {
                return `Error: Line number out of range. File has ${lines.length} lines.`;
            }

            const beforelines = lines.slice(0, startline - 1);
            const afterlines = lines.slice(endline);

            const newlines = newcode.split('\n');

            const finallines = [...beforelines, ...newlines, ...afterlines];

            // write updated content

            await fs.promises.writeFile(absolutepath, finallines.join('\n'));

            return `Success: Updated lines ${startline} to ${endline} in ${filePath}`
        } catch (error) {
            if (error instanceof Error) {
                return JSON.stringify({
                    Error: error.message
                });
            };
            return JSON.stringify({
                Error: error
            })
        }
    },
    {
        name: "edit_file",
        description: "it replace the old code with given new code. if you have to change just one line so do not give endline",
        schema: z.object({
            filePath: z.string().describe("relative file path for replacment"),
            startline: z.number().describe("The number of the initial line from where to start changing the code"),
            endline: z.number().optional().describe("The line number up to which the code needs to be changed. this is optional, Because it may be necessary to change just one line"),
            newcode: z.string().describe("new code for replacment")
        })
    }
);

// console.log(await edit_file.invoke({
//     filePath: "prakash/banwari/index.txt", startline: 10, newcode: `
//     function dothis(name: string) {
//       console.log("hello" + name);
//     };` }));

// ✅
export const run_shell_command = tool(
    async ({ command, dirpath, timeout, iskeepalive }) => {
        return new Promise((resolve) => {
            try {

                let isposix = process.platform !== "win32";
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
                        resolve(JSON.stringify({ cause: "error", stdout: null, stderr: null, error: errarr.join(isposix ? '\n' : '\r\n') }));
                    }
                    else {
                        processID = [];
                    }
                };

                if (!command) {
                    resolve(JSON.stringify({ cause: "error", stdout: null, stderr: null, error: "no such command provided" }));
                };

                if (isposix) {
                    child = spawn(command, { cwd, env: { ...process.env, CI: "true" }, shell: true });
                } else {
                    child = spawn("powershell.exe", ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { cwd, env: { ...process.env, CI: "true" } });
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
                            resolve(JSON.stringify({ cause: "success", stdout, stderr, error: null }));
                        } else {
                            if (child.pid) {
                                isTimeout = true;
                                kill(child.pid, (err) => {
                                    if (err) {
                                        resolve(JSON.stringify({ cause: "error", stdout, stderr, error: err.message }));
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
                        resolve(JSON.stringify({ cause: "error", stdout: null, stderr: null, error: err.message }))
                    } else {
                        resolve(JSON.stringify({ cause: "error", stdout: null, stderr: null, error: err }))
                    }
                });

                child.on("close", (code) => {
                    isTerminated = true;
                    clearTimeout(timer);
                    if (code === 0) {
                        resolve(JSON.stringify({ cause: "success", stdout, stderr, error: null }));
                    }
                    else {
                        if (isTimeout) {
                            resolve(JSON.stringify({ cause: "timeout", stdout, stderr, error: null }));
                        }
                        else {
                            resolve(JSON.stringify({ cause: "error", stdout, stderr, error: null }));
                        }
                    }
                });

            } catch (error) {
                if (error instanceof Error) {
                    resolve(JSON.stringify({ cause: "error", stdout: null, stderr: null, error: error.message }));
                } else {
                    resolve(JSON.stringify({ cause: "error", stdout: null, stderr: null, error }));
                }
            }
        });
    },
    {
        name: "run_shell_command",
        description: `
## Description

Executes shell commands and returns stdout, stderr, with metadeta.

## When to Use This Tool

Use this tool when:

- You need to install project dependencies or run scripts to install dependencies.
- You need to run shell commands.
- you need to list directory or project.
- when you need to create files and directoryes.
- You can use this to start the application server (for example, in Vite or Next.js) with npm run dev or according package manager. It also lets you check logs and detect errors, which is useful for debugging.

## Rules to Use This Tool

- When running scripts to install project dependencies, always use non-interactive flags. This ensures no human confirmation or input is required, as this tool is optimized to run commands in a non-interactive manner.
- Never run harmful commands.
- do not use this for read and write file , and all those commands that returns the long stdout.
- Always install or run dependencies using the appropriate package manager. If none is specified or cannot be determined, default to npm.
- always run commands according the **About system**

## Examples

Here is an example with the npm package manager, but always use the correct command according to the selected package manager.

- npm create vite@<version/latest> <app-name> -- --template <template-name> - This command installs a Vite application. Here:
  - <version/latest> - Version of Vite. If the user specifies a version, use that; otherwise, use latest.
  - <app-name> - Name of the application.
  - <template-name> - Templates like react, vue, vanilla, vanilla-ts, vue-ts, react-ts etc.

- npx create-next-app@<version/latest> <app-name> --yes <options> - Installs a Next.js app. Here:
  - <version/latest> - Version of Next.js. If the user specifies a version, use that; otherwise, use latest.
  - <options> - Options like --use-npm , --use-yarn , --use-pnpm , --js , --ts , --tailwind , --eslint , --app , --src-dir etc.

In the Next.js installation command, the options field is optional. If you don’t provide it, the default recommended options will be used.
## Resources

Here are the web links for additional knowledge:

- https://nextjs.org/docs/app/api-reference/cli/create-next-app - This is the official documentation link for Next.js installation commands used in a non-interactive manner.
- https://www.npmjs.com/package/create-vite - This is the official documentation link for Vite’s npm package, which describes the non-interactive installation commands and flags.`,
        schema: z.object({
            command: z.string().describe("command for run"),
            dirpath: z.string().optional().describe("relative path of directory in which have to run command"),
            timeout: z.number().default(60000).describe("timeout in miliseconds"),
            iskeepalive: z.boolean().default(false).describe(
                "Controls whether the process should continue running after the timeout. " +
                "If false(default), the process will be terminated when the timeout is reached. " +
                "If true, the process will continue running even after the timeout. " +
                "This is useful for long-running processes such as starting a development server (e.g., Next.js, Vite, or Node.js server) where the process must remain active to allow users to access the application."
            )
        })
    }
);


export const web_search = tool(
    async ({ query }) => {
        try {

            const tvly = tavily({ apiKey: "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" });
            const response = await tvly.search(query);
            return JSON.stringify(response.results[0]);

        } catch (error) {
            if (error instanceof Error) {
                return JSON.stringify({
                    Error: error.message
                })
            }
            return JSON.stringify({
                Error: error
            });
        }
    },
    {
        name: "web_search",
        description: `The **Web Search Tool** provides fresh, up-to-date, and accurate information from the internet, making it the ideal choice whenever you need the latest data, reliable facts, or step-by-step guidance. Use it to stay informed on current topics, explore new knowledge, or follow practical tutorials—for example, *how to install Tailwind CSS with React*—ensuring you always have the most precise and relevant information at your fingertips.`,
        schema: z.object({
            query: z.string().describe("query for search about")
        })
    }
);
import { tool } from "@langchain/core/tools";
import z from 'zod';
import process from 'node:process';
import fs from 'node:fs';
import { promisify } from "node:util";
import path from "node:path";
// import { password } from "@inquirer/prompts";
import { spawn, exec } from 'node:child_process';
import os from 'node:os';
import stripAnsi from 'strip-ansi';
import { tavily } from '@tavily/core';

const execPromise = promisify(exec);

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

// ✅
export const show_present_working_Directory = tool(
    () => {
        return process.cwd();
    },
    {
        name: "show_present_working_Directory",
        description: "this tool returns the current working directory",
    }
);

// ✅
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

// console.log(await append_File.invoke({ filePath: "index.txt", content: "\n hello my name is prakash" }));

// ✅
export const install_dependency = tool(
    async ({ command }) => {
        try {
            if (!command) {
                return `command is not provided please provide command to execute`
            }
            const { stderr, stdout } = await execPromise(command);
            if (stderr && stdout) {
                return `${stdout} ,\n ${stderr}`
            } else if (stderr) {
                return `occurred: ${stderr}`
            } else {
                if (stdout) {
                    return stdout
                } else {
                    return `command executed succsesfully.`
                }
            };
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
        name: "install_dependency",
        description: `Installs project dependencies.

               Do NOT run any CLI command that requires interactive prompts. Only execute fully non-interactive(in which there is not human interaction) commands with all required flags.

               If a command is interactive, convert it into a non-interactive version with complete flags before running.

               You may install multiple packages at once by providing a single bulk install command (recommended). but according operating system and with safe manor.`,
        schema: z.object({
            command: z.string().describe("command for installing the  dependecys."),
            dirPath: z.string().optional().describe("relative path of directory in which have to install dependency. this is optional and default is current working directory.")
        })
    }
);


// console.log(await install_dependency.invoke({ command: "npm create vite@latest" }));

// ✅
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
export const list_directory = tool(
    async ({ dirPath }) => {
        try {
            const isAllAbsolute: any = [];
            if (dirPath == undefined || dirPath.length == 0 || dirPath == null) {
                const current_direcory = process.cwd();

                const files = await fs.promises.readdir(current_direcory, { withFileTypes: true });

                const formatted = files.map(file => {
                    return file.isDirectory() ? `[DIR]  ${file.name}` : `[FILE] ${file.name}`;
                }).join("\n");

                return JSON.stringify({ [path.basename(current_direcory)]: formatted });

            } else {
                dirPath.map((paths, index) => {
                    const value = path.isAbsolute(paths);

                    if (value) {
                        isAllAbsolute.push(`index: ${index} , path: ${paths}`);
                    }
                });

                if (isAllAbsolute.length > 0) {
                    return `Error: Absolute paths are not allowed for security reasons. Please provide a relative paths for these list, ${isAllAbsolute}`;
                };

                let cleanPatharray = dirPath.map((value) => {
                    return value.replace(/^[/\\]+/, '');
                })

                const normalizedPath = cleanPatharray.map((value) => {
                    return path.normalize(value);
                })

                const absolutePath = normalizedPath.map((value) => {
                    return path.resolve(process.cwd(), value)
                });

                const isAbsolutePathExsist = [];
                const dirstructure = [];

                for (const element of absolutePath) {
                    const report = await isFileExsist(element);
                    isAbsolutePathExsist.push(report);
                }

                for (const element of isAbsolutePathExsist) {
                    if (element.isError) {
                        const errorReport = isAbsolutePathExsist.map((value) => {
                            return value.isError
                        });
                        return `ERROR occurred , ${errorReport}`;
                    }
                }

                for (const element of absolutePath) {
                    const structure = await fs.promises.readdir(element, { withFileTypes: true });
                    dirstructure.push(structure);
                }

                const finalresult = dirstructure.map((value, index) => {
                    return { [`${dirPath[index]}`]: value.map((DIR) => DIR.isDirectory() ? `[DIR]  ${DIR.name}` : `[FILE] ${DIR.name}`) }
                })
                return JSON.stringify(finalresult);
            }

        } catch (error) {
            if (error instanceof Error) {
                return JSON.stringify({
                    Error: error.message
                });
            }
            return JSON.stringify({
                Error: error
            });
        }
    },
    {
        name: "list_directory",
        description: "Lists files and folders in the given directories so you can see the project structure. I do not accept file paths, so give me only directory paths.",
        schema: z.object({
            dirPath: z.array(z.string()).optional().describe("Array of directory paths to list. Default is current directory.")
        }),
    }
);
// console.log(await list_directory.invoke({dirPath:'src\\components'}));

// ✅
export const create_directory_and_files = tool(
    async ({ list }: { list: string[] }) => {
        if (!list || list.length === 0) {
            return "Error: No directories or file paths provided.";
        }
        const results: any = { createdDirs: [], createdFiles: [], errors: [] };

        for (const userPath of list) {
            try {

                let cleanPath = userPath.replace(/^[/\\]+/, '');

                const normalizedPath = path.normalize(cleanPath);

                const absPath = path.resolve(process.cwd(), normalizedPath);

                const isDirectory = path.extname(absPath) === "";

                if (isDirectory) {
                    await fs.promises.mkdir(absPath, { recursive: true });
                    results.createdDirs.push(userPath);
                } else {
                    const dir = path.dirname(absPath);
                    if (dir !== process.cwd()) {
                        await fs.promises.mkdir(dir, { recursive: true });
                        results.createdDirs.push(userPath);
                    }
                    await fs.promises.writeFile(absPath, "");
                    results.createdFiles.push(userPath);
                }

            } catch (err) {
                if (err instanceof Error) {
                    results.errors.push({ path: userPath, error: err.message });
                } else {
                    results.errors.push({ path: userPath, error: (err as string).toString() });
                }
            }
        }

        return `Succsesfully created given files or directoryes`;
    },
    {
        name: "create_directory_and_files",
        description: "Creates directories and empty files. Provide relative paths. it takes the array of the paths , but if you have only create one directorie or file so you put only that one path in the array.",
        schema: z.object({
            list: z.array(z.string()).describe("Array of relative paths of directories or files to create")
        })
    }
);

// ✅
export const read_logs = tool(
    async ({ command, dirPath }) => {
        try {
            if (!command) {
                return JSON.stringify({
                    Error: "command is not provided"
                });
            }
            let output = "";
            let erroroutput = "";
            let options: { shell: boolean, cwd?: string } = { shell: true };

            if (dirPath) {
                let cleanPath = dirPath.replace(/^[/\\]+/, '');
                const absolutePath = path.resolve(cleanPath);
                const { exsist, isError } = await isFileExsist(absolutePath);
                if (!exsist) {
                    return JSON.stringify({
                        Error: isError
                    });
                };
                options.cwd = absolutePath;
            };

            const child = spawn(command, options);

            child.stdout.on("data", (data) => {
                output += data.toString();
            });

            child.stderr.on("data", (data) => {
                erroroutput += data.toString();
            });

            return new Promise((resolve, reject) => {
                try {
                    child.on("error", (err) => {
                        reject(JSON.stringify({
                            Error: err
                        }));
                    });

                    const timer = setTimeout(() => {
                        if (os.platform() === 'win32') {
                            exec(`taskkill /pid ${child.pid} /T /F`, (err: any) => {
                                if (err) {
                                    resolveLogs(null, err);
                                }
                            });
                        } else {
                            child.kill('SIGKILL');
                        }

                    }, 5000);

                    const resolveLogs = (code: any, killError = null) => {
                        clearTimeout(timer);
                        resolve(JSON.stringify(
                            {
                                exitCode: code,
                                stdout: stripAnsi(output) || "No stdout captured (Process might be silent)",
                                stderr: stripAnsi(erroroutput) || "No stderr captured",
                                killed: true,
                                killFailed: killError ? `true , Error: ${killError}` : false
                            }
                        ));
                    };

                    child.on("close", (code) => {
                        resolveLogs(code);
                    });

                } catch (error) {
                    if (error instanceof Error) {

                        reject(JSON.stringify({
                            Error: error.message
                        }));
                    }
                    else {
                        reject(JSON.stringify({
                            Error: error
                        }));
                    }
                }
            })
        } catch (error) {
            if (error instanceof Error) {
                return JSON.stringify({
                    Error: error.message
                });
            }
            return JSON.stringify({
                Error: error
            });

        }
    }, {
    name: "read_logs",
    description: "I run the application and read the logs. Use me when you need to find errors in the application or verify whether the application is working properly. I am only useful when the server needs to be run and logs need to be monitored — for example, in frameworks like Vite (React), Next.js, express and similar environments.",
    schema: z.object({
        command: z.string().describe("command for run the application."),
        dirPath: z.string().optional().describe("relative directory path in which you have to run application. This is optional. If you do not provide a dirpath, it uses the current directory by default.")
    })
});

// console.log(await read_logs.invoke({ command: "npm run dev",dirPath:"client"}));

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



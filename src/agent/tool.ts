import { tool } from "@langchain/core/tools";
import { createAgent, AIMessage } from 'langchain';
import z from 'zod';
import process from 'node:process';
import fs from 'node:fs';
import path from "node:path";
import { spawn } from 'node:child_process';
import stripAnsi from 'strip-ansi';
import kill from 'tree-kill';
import readline from 'readline/promises';
import fg from 'fast-glob';
import {
    RUN_SHELL_COMMAND_DESCRIPTION,
    EDIT_FILE_DESCRIPTION,
    GLOB_DESCRIPTION,
    READ_FILE_DESCRIPTION,
    WRITE_FILE_DESCRIPTION,
    ispwshexsist,
    GREP_DESCRIPTION,
    WRITE_TODO_DESCRIPTION,
    CRAWLER_TOOL_DESCRIPTION,
    MAPING_TOOL_DESCRIPTION,
    WEB_SEARCH_TOOL_DESCRIPTION,
    WB_EXTRACTER_TOOL_DESCRIPTION,
    RESEARCH_SUBAGENT_SYSTEM_PROMPT,
    WEB_RESEARCH_TOOL_DESCRIPTION,
    FILE_SYSTEM_AGENT_DESCRIPTION,
    SHELL_AGENT_DESCRIPTION
} from './system.js';
import { tavily } from "@tavily/core";
import { ChatGoogle } from '@langchain/google';
import { getapikeys } from '../utils/utils.js';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

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

process.on("exit", (code) => {
    if (processID.length > 0) {
        for (const element of processID) {
            process.kill(element.process_id);
        }
    }
});

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

const MIME_TYPES: Record<string, string> = {
    // images
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".heic": "image/heic",
    ".heif": "image/heif",

    // audio
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".aiff": "audio/aiff",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",

    // video
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mpeg": "video/mpeg",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".flv": "video/x-flv",
    ".mpg": "video/mpeg",
    ".wmv": "video/x-ms-wmv",
    ".3gpp": "video/3gpp",

    // documents
    ".pdf": "application/pdf",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const memory_size = async (file_path: string) => {
    const responce = await fs.promises.stat(file_path);
    return responce.size;
};

const MAX_MEMORY_SIZE = 5242880;

// api keys
const api_keys: {
    GEMINI_API_KEY: null | string,
    TAVILY_API_KEY: null | string
} = {
    GEMINI_API_KEY: null,
    TAVILY_API_KEY: null
};

export const read_file = tool(
    async ({ file_path, offset, limit }, config: LangGraphRunnableConfig) => {
        try {
            if (!file_path) {
                return `Error: File path is not provided please provid relativ file path to read file)`
            }

            if (path.isAbsolute(file_path)) {
                return `Error: Absolute paths are not allowed for security reasons. Please provide a relative path (e.g., 'folder/file.txt') instead.)`
            }

            let cleanPath = file_path.replace(/^[/\\]+/, '');

            const normalizedPath = path.normalize(cleanPath);

            const absolutepath = path.resolve(normalizedPath);

            const { exsist, isError } = await isFileExsist(absolutepath);

            if (!exsist) {
                return JSON.stringify({ cause: "error", message: `${isError}` })
            };

            if (config.writer) {
                config.writer({ status: `Reading file ${file_path} ...` });
            }

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
        description: READ_FILE_DESCRIPTION,
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
    async ({ filepath, content, mode }, config: LangGraphRunnableConfig) => {
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

            if (config.writer) {
                config.writer({ status: `Writing file in ${filepath} ...` });
            }

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
        description: WRITE_FILE_DESCRIPTION,
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
    async ({ file_path, old_string, new_string, replace_all }, config: LangGraphRunnableConfig) => {

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

            if (config.writer) {
                config.writer({ status: `Editing the file ${file_path} ...` });
            }

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
        description: EDIT_FILE_DESCRIPTION,
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
    async ({ command, dirpath, timeout, iskeepalive }, config: LangGraphRunnableConfig) => {

        if (config.writer) {
            config.writer({ status: `Executing the Command ${command} ...` });
        }

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
        description: RUN_SHELL_COMMAND_DESCRIPTION,
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

export const glob = tool(
    async ({ pattern, directory_path }, config: LangGraphRunnableConfig) => {
        try {

            if (pattern.startsWith("/")) {
                pattern = pattern.substring(1);
            };

            let base_path = path.resolve(process.cwd());

            if (directory_path) {
                const given_path = path.resolve(directory_path);
                const { isError } = await isFileExsist(given_path);

                if (isError) {
                    return `Error: ${isError}`
                };
                base_path = given_path;
            };

            if (config.writer) {
                config.writer({ status: `Finding the file paths according glob pattern ${pattern} ...` });
            }

            const matches = await fg(pattern, {
                onlyFiles: true,
                dot: true,
                ignore: ["node_modules", "dist"],
                cwd: base_path
            });

            if (matches.length === 0) {
                return `Warning: no such match found`
            };

            return `Found ${matches.length} matches. Here is the list.\n\n${matches.join('\n')}`;
        } catch (error) {
            if (error instanceof Error) {
                return `Error: ${error.message}`;
            }
            return `Error: ${error}`
        }
    },
    {
        name: "glob",
        description: GLOB_DESCRIPTION,
        schema: z.object({
            pattern: z.string().describe("Glob pattern (e.g., '*.py', '**/*.ts')"),
            directory_path: z
                .string()
                .optional()
                .describe("relative path to search from , default is current directory"),
        }),
    }
);

const TodoStatus = z
    .enum(["pending", "in_progress", "completed"])
    .describe("Status of the todo");
const TodoSchema = z.object({
    content: z.string().describe("Content of the todo item"),
    status: TodoStatus,
});

export const write_todos = tool(
    async ({ todos }, config: LangGraphRunnableConfig) => {

        if (config.writer) {
            config.writer({ status: `Writing Todos ...` });
        }

        `Updated todo list to ${JSON.stringify(todos)}`
    },
    {
        name: "write_todos",
        description: WRITE_TODO_DESCRIPTION,
        schema: z.object({
            todos: z.array(TodoSchema).describe("List of todo items to update"),
        }),
    }
);

export const grep = tool(
    async ({ pattern, directory_path, glob }, config: LangGraphRunnableConfig) => {
        try {
            if (!pattern) {
                return `Error: pattern is not provided`;
            };

            if (!glob) {
                return `Error: glob is not provided`;
            };

            if (config.writer) {
                config.writer({ status: `Greping the content according glob ${glob} ...` });
            }

            let DIR = path.resolve(process.cwd());

            if (directory_path) {
                const absolutePath = path.resolve(directory_path);
                const { exsist, isError } = await isFileExsist(absolutePath);
                if (isError) {
                    return `Error: ${isError}`;
                };
                DIR = absolutePath;
            };

            // array of file paths

            const file_paths = await fg(glob, {
                absolute: false,
                cwd: DIR,
                ignore: ["node_modules", "dist"],
                onlyFiles: true
            });

            if (file_paths.length === 0) {
                return `Warning: no such file paths found`
            };

            const results = [];

            for (const element of file_paths) {
                if (path.extname(element) in MIME_TYPES) {
                    continue;
                };

                const size = await memory_size(path.resolve(element));

                if (size > MAX_MEMORY_SIZE) {
                    continue;
                };

                const lines: any = (await fs.promises.readFile(path.resolve(element), { encoding: "utf-8" })).split("\n");

                const matched_content = [];

                for (let index = 0; index < lines.length; index++) {
                    const line = lines[index];

                    if ((line as string).includes(pattern)) {
                        matched_content.push(`${index + 1}: ${line.trim()}`);
                    } else {
                        continue;
                    }
                };

                if (matched_content.length > 0) {
                    results.push(`${element}\n${matched_content.join("\n")}`);
                }
            };

            if (results.length === 0) {
                return "Warning: no such match found"
            };

            if (results.length > 20) {
                return `Error: the greped results are too large please give good and relavent pattern to search for`
            };

            return `This is the all found results\n\n${results.join("\n\n")}`;

        } catch (error) {
            if (error instanceof Error) {
                return `Error: ${error.message}`;
            } else {
                return `Error: ${error}`;
            }
        }
    },
    {
        name: "grep",
        description: GREP_DESCRIPTION,
        schema: z.object({
            pattern: z.string().describe("literal text to search for"),
            directory_path: z
                .string()
                .optional()
                .describe("Base path to search from ,default is current directory"),
            glob: z
                .string()
                .describe("glob pattern to filter files (e.g., '*.ts')"),
        }),
    },
);

const web_search = tool(
    async ({ query, topic }, config: LangGraphRunnableConfig) => {
        try {
            if (!query) {
                return `Error, you did not give the query! please give query to web search`
            }

            if (config.writer) {
                config.writer({ status: `Searching on the web` });
            }

            let tavily_api_key: string = "";

            if (api_keys.TAVILY_API_KEY) {
                tavily_api_key = api_keys.TAVILY_API_KEY
            } else {
                const keys: any = await getapikeys()

                if (keys.Error) {
                    return `Error: api key is missing please say to user to submit a api key`
                } else {
                    tavily_api_key = keys.TAVILY_API_KEY as string;
                }
            };

            const tvly = tavily({ apiKey: tavily_api_key });
            const response = await tvly.search(query.trim(), { topic, maxResults: 4, includeUsage: true });

            if (config.writer && response.usage && response.usage.credits) {
                config.writer({ Credits: response.usage.credits });
            }

            const filteredData = response.results.map(item => {
                return JSON.stringify({
                    title: item.title,
                    content: item.content,
                    url: item.url
                })
            });

            if (filteredData.length === 0) {
                return `warning: nothing found about topic`
            }

            return `These are the results found about topic\n\n${filteredData.join('\n\n')}`;

        } catch (error) {
            if (error instanceof Error) {
                return `Error: ${error.message}`
            };
            return `Error: ${error}`
        }
    },
    {
        name: "web_search",
        description: WEB_SEARCH_TOOL_DESCRIPTION,
        schema: z.object({
            query: z.string().describe("query for searching on the web"),
            topic: z.enum(["general", "news"])
        })
    }
);

const web_extracter = tool(
    async ({ urls }, config: LangGraphRunnableConfig) => {
        try {

            if (!urls) {
                return `Error: urls are not provided please provide valid urls for extraction`
            };

            if (config.writer) {
                config.writer({ status: `Extracting the web pages: ${urls.join(' ')}` });
            }

            let tavily_api_key: string = "";

            if (api_keys.TAVILY_API_KEY) {
                tavily_api_key = api_keys.TAVILY_API_KEY
            } else {
                const keys: any = await getapikeys()

                if (keys.Error) {
                    return `Error: api key is missing please say to user to submit a api key`
                } else {
                    tavily_api_key = keys.TAVILY_API_KEY as string;
                }
            };

            const tvly = tavily({ apiKey: tavily_api_key });
            const response = await tvly.extract(urls, { includeUsage: true });

            if (config.writer && response.usage && response.usage.credits) {
                config.writer({ Credits: response.usage.credits });
            }

            const filteredData = response.results.map(item => {
                if (item.rawContent.length > 30000) {
                    return JSON.stringify({
                        title: item.title,
                        rawContent: item.rawContent.slice(0, 30000),
                        url: item.url
                    })
                } else {
                    return JSON.stringify({
                        title: item.title,
                        rawContent: item.rawContent,
                        url: item.url
                    })
                }
            });

            if (filteredData.length === 0) {
                return `warning: nothing found during extraction.`
            };

            return `these are the extrected data\n\n${filteredData.join('\n')}`;
        } catch (error) {
            if (error instanceof Error) {
                return error.message
            }
            return `${error}`;
        }
    },
    {
        name: "web_extracter",
        description: WB_EXTRACTER_TOOL_DESCRIPTION,
        schema: z.object({
            urls: z.array(z.string()).max(5, "Maximum 5 URLs allowed").describe("webpage http url for extraction")
        })
    }
);

const crawler = tool(
    async ({ url, instructions }, config: LangGraphRunnableConfig) => {
        try {
            if (!url) {
                return `Error: the url is not provided please provide a valid url`
            };

            if (!instructions) {
                return `Error: the instructions is not provided`
            };

            if (config.writer) {
                config.writer({ status: `Crawling the web page: ${url}` });
            }

            let tavily_api_key: string = "";

            if (api_keys.TAVILY_API_KEY) {
                tavily_api_key = api_keys.TAVILY_API_KEY
            } else {
                const keys: any = await getapikeys()

                if (keys.Error) {
                    return `Error: api key is missing please say to user to submit a api key`
                } else {
                    tavily_api_key = keys.TAVILY_API_KEY as string;
                }
            };

            const tvly = tavily({ apiKey: tavily_api_key });
            const response = await tvly.crawl(url, { instructions, includeUsage: true });

            if (config.writer && response.usage && response.usage.credits) {
                config.writer({ Credits: response.usage.credits });
            }

            const filteredData = response.results.map(item => {
                if (item.rawContent.length > 30000) {
                    return JSON.stringify({
                        rawContent: item.rawContent.slice(0, 30000),
                        url: item.url
                    })
                };
                return JSON.stringify({
                    rawContent: item.rawContent,
                    url: item.url
                })
            });

            if (filteredData.length === 0) {
                return `warning: nothing is to crawl`;
            }

            return `here is the crawled data according sources\n\n${filteredData.slice(0, 5).join('\n\n')}`

        } catch (error) {
            if (error instanceof Error) {
                return error.message;
            }
            return `${error}`;
        }
    },
    {
        name: "crawler",
        description: CRAWLER_TOOL_DESCRIPTION,
        schema: z.object({
            url: z.string().describe("http url of webpage"),
            instructions: z.string().describe("instructions for what to crawl")
        })
    }
);

const maper = tool(
    async ({ url }, config: LangGraphRunnableConfig) => {
        try {

            if (!url) {
                return `Error: url is not provided please provide a url to map`
            };

            if (config.writer) {
                config.writer({ status: `Maping the web page's urls` });
            }

            let tavily_api_key: string = "";

            if (api_keys.TAVILY_API_KEY) {
                tavily_api_key = api_keys.TAVILY_API_KEY
            } else {
                const keys: any = await getapikeys()

                if (keys.Error) {
                    return `Error: api key is missing please say to user to submit a api key`
                } else {
                    tavily_api_key = keys.TAVILY_API_KEY as string;
                }
            };

            const tvly = tavily({ apiKey: tavily_api_key });
            const response = await tvly.map(url, { includeUsage: true });

            if (config.writer && response.usage && response.usage.credits) {
                config.writer({ Credits: response.usage.credits });
            }

            if (response.results.length === 0) {
                return `warning: nothing is to map!`;
            }
            return `Here is the list of related urls\n\n${response.results.slice(0, 20).join('\n')}`;
        } catch (error) {
            if (error instanceof Error) {
                return error.message;
            }
            return `${error}`;
        }
    },
    {
        name: "maper",
        description: MAPING_TOOL_DESCRIPTION,
        schema: z.object({
            url: z.string().describe("url for maping")
        })
    }
);

export const web_researcher = tool(
    async ({ query }, config: LangGraphRunnableConfig) => {
        try {
            if (!query) {
                return `Error: query is not provided for research`;
            };

            let gemini_api_key: string = "";

            if (api_keys.GEMINI_API_KEY && api_keys.TAVILY_API_KEY) {
                gemini_api_key = api_keys.GEMINI_API_KEY
            } else {
                const keys: any = await getapikeys()

                if (keys.Error) {
                    return `Error: api key is missing please say to user to submit a api key`
                } else {
                    gemini_api_key = keys.GEMINI_API_KEY as string;
                }

            }

            const model = new ChatGoogle({
                model: "gemini-3-flash-preview",
                apiKey: gemini_api_key
            });

            const researchAgent = createAgent({
                model,
                systemPrompt: RESEARCH_SUBAGENT_SYSTEM_PROMPT,
                tools: [web_search, web_extracter, crawler, maper]
            });

            let total_tavily_credits = 0;

            let total_llm_tokens = 0;

            let last_msg = "";

            for await (const chunk of await researchAgent.stream(
                { messages: [{ role: "user", content: query }] },
                { streamMode: ["custom", "updates"] }
            )) {

                if (chunk[0] === "updates") {

                    if ("model_request" in chunk[1]) {

                        const messages = (chunk[1] as any).model_request.messages

                        last_msg = messages[messages.length - 1];

                        if (AIMessage.isInstance(last_msg)) {
                            total_llm_tokens += (last_msg as any).usage_metadata.total_tokens
                        };
                    }

                } else if (chunk[0] === "custom") {
                    if ("Credits" in (chunk[1] as any)) {
                        total_tavily_credits += (chunk[1] as any).Credits
                    }
                    if ("status" in (chunk[1] as any)) {
                        if (config.writer) {
                            config.writer({ status: `${(chunk[1] as any).status} ...` });
                        }
                    }
                }
            };

            if (config.writer) {
                config.writer({
                    tokenUsed: total_llm_tokens,
                    tavilyCredits: total_tavily_credits
                });
            }

            if (typeof (last_msg as any).content === "string") {
                return `${(last_msg as any).content}`;
            }

            return JSON.stringify((last_msg as any).content)

        } catch (error) {
            if (error instanceof Error) {
                return `Error: ${error.message}`
            }
            return `Error: ${error}`;
        }
    },
    {
        name: "web_researcher",
        description: WEB_RESEARCH_TOOL_DESCRIPTION,
        schema: z.object({
            query: z.string().describe("query for research")
        })
    }
);

// Fack tools for subagentic simulation

export const file_system_agent = tool(
    async ({ description }) => {
        return "";
    },
    {
        name: "file_system_agent",
        description: FILE_SYSTEM_AGENT_DESCRIPTION,
        schema: z.object({
            description: z.string().describe("detailed description about task")
        })
    }
);

export const shell_agent = tool(
    async ({ description }) => {
        return "";
    },
    {
        name: "shell_agent",
        description: SHELL_AGENT_DESCRIPTION,
        schema: z.object({
            description: z.string().describe("detailed description about task")
        })
    }
);
import * as fs from 'fs';

export default {
    // Options for the Keyv cache, see https://www.npmjs.com/package/keyv.
    // This is used for storing conversations, and supports additional drivers (conversations are stored in memory by default).
    // Only necessary when using `ChatGPTClient`, or `BingAIClient` in jailbreak mode.
    cacheOptions: {},
    // If set, `ChatGPTClient` and `BingAIClient` will use `keyv-file` to store conversations to this JSON file instead of in memory.
    // However, `cacheOptions.store` will override this if set
    storageFilePath: process.env.STORAGE_FILE_PATH || './cache.json',
    chatGptClient: {
        // Your OpenAI API key (for `ChatGPTClient`)
        openaiApiKey: process.env.OPENAI_API_KEY || '',
        // (Optional) Support for a reverse proxy for the completions endpoint (private API server).
        // Warning: This will expose your `openaiApiKey` to a third party. Consider the risks before using this.
        // reverseProxyUrl: 'https://chatgpt.hato.ai/completions',
        // (Optional) Parameters as described in https://platform.openai.com/docs/api-reference/completions
        modelOptions: {
            // You can override the model name and any other parameters here.
            // The default model is `gpt-3.5-turbo`.
            model: 'gpt-3.5-turbo',
            // Set max_tokens here to override the default max_tokens of 1000 for the completion.
            // max_tokens: 1000,
        },
        // (Optional) Davinci models have a max context length of 4097 tokens, but you may need to change this for other models.
        // maxContextTokens: 4097,
        // (Optional) You might want to lower this to save money if using a paid model like `text-davinci-003`.
        // Earlier messages will be dropped until the prompt is within the limit.
        // maxPromptTokens: 3097,
        // (Optional) Set custom instructions instead of "You are ChatGPT...".
        // (Optional) Set a custom name for the user
        // userLabel: 'User',
        // (Optional) Set a custom name for ChatGPT ("ChatGPT" by default)
        // chatGptLabel: 'Bob',
        // promptPrefix: 'You are Bob, a cowboy in Western times...',
        // A proxy string like "http://<ip>:<port>"
        proxy: '',
        // (Optional) Set to true to enable `console.debug()` logging
        debug: false,
    },
    // Options for the Bing client
    bingAiClient: {
        // Necessary for some people in different countries, e.g. China (https://cn.bing.com)
        host: '',
        // The "_U" cookie value from bing.com
        userToken: '',
        // If the above doesn't work, provide all your cookies as a string instead
        cookies: '',
        // A proxy string like "http://<ip>:<port>"
        proxy: '',
        // (Optional) Set 'x-forwarded-for' for the request. You can use a fixed IPv4 address or specify a range using CIDR notation,
        // and the program will randomly select an address within that range. The 'x-forwarded-for' is not used by default now.
        // xForwardedFor: '13.104.0.0/14',
        // (Optional) Set 'genImage' to true to enable bing to create images for you. It's disabled by default.
        // features: {
        //     genImage: true,
        // },
        // (Optional) Set to true to enable `console.debug()` logging
        debug: false,
    },
    infrastructClient: {
        openaiApiKey: process.env.OPENAI_API_KEY || '',
        modelOptions: {
            model: 'gpt-4-base',
            max_tokens: 10,
            stream: true,
            n: 3,
        },
        // (Optional) Set to true to enable `console.debug()` logging
        debug: false,
    },
    claudeClient: {
        anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
        modelOptions: {
            model: 'claude-3-opus-20240229',
            max_tokens: 1024,
            temperature: 1,
            stream: true,
        },
    },
    ollamaClient: {
        modelOptions: {
            model: 'OpenHermes-2.5:Q5_K_M',
            options: {
                num_ctx: 4096,
                temperature: 1,
            },
            stream: true,
        },
    },
    chatGptBrowserClient: {
        // (Optional) Support for a reverse proxy for the conversation endpoint (private API server).
        // Warning: This will expose your access token to a third party. Consider the risks before using this.
        reverseProxyUrl: 'https://bypass.churchless.tech/api/conversation',
        // Access token from https://chat.openai.com/api/auth/session
        accessToken: '',
        // Cookies from chat.openai.com (likely not required if using reverse proxy server).
        cookies: '',
        // A proxy string like "http://<ip>:<port>"
        proxy: '',
        // (Optional) Set to true to enable `console.debug()` logging
        debug: false,
    },
    // Options for the API server
    apiOptions: {
        port: process.env.API_PORT || 3000,
        host: process.env.API_HOST || 'localhost',
        // (Optional) Set to true to enable `console.debug()` logging
        debug: false,
        // (Optional) Possible options: "chatgpt", "chatgpt-browser", "bing". (Default: "chatgpt")
        clientToUse: 'bing',
        // (Optional) Generate titles for each conversation for clients that support it (only ChatGPTClient for now).
        // This will be returned as a `title` property in the first response of the conversation.
        generateTitles: false,
        // (Optional) Set this to allow changing the client or client options in POST /conversation.
        // To disable, set to `null`.
        perMessageClientOptionsWhitelist: {
            // The ability to switch clients using `clientOptions.clientToUse` will be disabled if `validClientsToUse` is not set.
            // To allow switching clients per message, you must set `validClientsToUse` to a non-empty array.
            validClientsToUse: ['bing', 'chatgpt', 'chatgpt-browser', 'infrastruct', 'claude'], // values from possible `clientToUse` options above
            // The Object key, e.g. "chatgpt", is a value from `validClientsToUse`.
            // If not set, ALL options will be ALLOWED to be changed. For example, `bing` is not defined in `perMessageClientOptionsWhitelist` above,
            // so all options for `bingAiClient` will be allowed to be changed.
            // If set, ONLY the options listed here will be allowed to be changed.
            // In this example, each array element is a string representing a property in `chatGptClient` above.
            chatgpt: [
                'promptPrefix',
                'userLabel',
                'chatGptLabel',
                // Setting `modelOptions.temperature` here will allow changing ONLY the temperature.
                // Other options like `modelOptions.model` will not be allowed to be changed.
                // If you want to allow changing all `modelOptions`, define `modelOptions` here instead of `modelOptions.temperature`.
                'modelOptions.temperature',
            ],
        },
    },
    // Options for the CLI app
    cliOptions: {
        // Possible options:
        // "bing" (copilot API)
        // "infrastruct" (openai completions API)
        // "claude" (anthropic API)
        // "chatgpt" (openai chat API)
        // "ollama"
        clientToUse: 'claude',
        showSuggestions: true,
        showSearches: false, // not implemented yet
        conversationData: {
        },
        bingOptions: {
            messageOptions: {
                toneStyle: 'creative', // creative, precise, balanced, or fast
                injectionMethod: 'message', // message or context
                userMessageInjection: 'Continue the conversation in context. Assistant:',
                systemMessage: '', // fs.readFileSync('./contexts/youArePrometheus.txt', 'utf8'),
                context: fs.readFileSync('./contexts/context.txt', 'utf8'),
                censoredMessageInjection: '⚠',
            },
        },
        infrastructOptions: {
            modelOptions: {
                model: 'gpt-4-base',
                max_tokens: 300,
                n: 3,
            },
            messageOptions: {
                systemMessage: fs.readFileSync('./contexts/infrastruct.txt', 'utf8'),
            },
        },
        claudeOptions: {
            modelOptions: {
                model: 'claude-3-opus-20240229',
                max_tokens: 4096,
                temperature: 1,
            },
            messageOptions: {
                systemMessage: fs.readFileSync('./contexts/claude-cli.txt', 'utf8'),
            },
            clientOptions: {
                n: 2,
            },
        },
        chatGptOptions: {
            modelOptions: {
                model: 'gpt-4o',
                temperature: 1,
                max_tokens: 1000,
                n: 3,
                // response_format: 'text', // 'text' or 'json_object'
            },
            messageOptions: {
                systemMessage: '', //fs.readFileSync('', 'utf8'),
            },
        },
        ollamaOptions: {
            modelOptions: {
                model: 'OpenHermes-2.5:Q5_K_M',
                options: {
                    num_ctx: 4096,
                    num_predict: 128,
                    temperature: 1,
                },
            },
            messageOptions: {
                systemMessage: fs.readFileSync('./contexts/context.txt', 'utf8'),
            },
        },
    },
};

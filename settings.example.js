import * as fs from 'fs';

export default {
    // Options for the Keyv cache, see https://www.npmjs.com/package/keyv.
    // This is used for storing conversations, and supports additional drivers (conversations are stored in memory by default).
    cacheOptions: {
        namespace: null, // if namespace is null, it will use the clientToUse
    },
    // If set, chat clients will use `keyv-file` to store conversations to this JSON file instead of in memory.
    // However, `cacheOptions.store` will override this if set
    storageFilePath: process.env.STORAGE_FILE_PATH || './cache.json',
    // Options for the CLI app
    cliOptions: {
        // Possible options:
        // "bing" (copilot 'API')
        // "infrastruct" (openai completions API)
        // "claude" (anthropic API)
        // "chatgpt" (openai chat API)
        // "ollama"
        // "openrouter"
        clientToUse: 'claude',

        showSuggestions: true, // only implemented for Bing
        showSearches: false, // not implemented yet
        conversationData: {
        },
        bingOptions: {
            modelOptions: {
                toneStyle: 'creative', // creative, precise, balanced, or fast

                // advanced options
                stream: true,
                city: 'between words',
                country: 'United States',
                messageText: 'Continue the conversation in context. Assistant:', // content of user message if nothing is injected there

            },
            messageOptions: {
                n: 3,

                // advanced options
                systemMessage: fs.readFileSync('./contexts/youArePrometheus.txt', 'utf8'),

                systemInjectSite: 'location', // context or location (overrides default country)
                historyInjectSite: 'location', // context or location
                messageInjectSite: 'message', // message, context, or location

                censoredMessageInjection: '⚠',
                stopToken: '\n\n[user](#message)',

                context: null, // fs.readFileSync('./contexts/context.txt', 'utf8'), // a string injected into web page context; will be prepended to messages injected to context
                // context is subject to MSFT censorship now; not recommended for prompt injections or other sus text

            },
        },
        chatGptOptions: {
            modelOptions: {
                model: 'gpt-4o',
                temperature: 1,
                max_tokens: 2048,
                n: 3,
                stream: true,
                // response_format: 'text', // 'text' or 'json_object'
            },
            messageOptions: {
                systemMessage: '',
            },
        },
        claudeOptions: {
            modelOptions: {
                model: 'claude-3-opus-20240229',
                max_tokens: 4096,
                temperature: 1,
                stream: true,
            },
            messageOptions: {
                systemMessage: '', // fs.readFileSync('./contexts/waluigiASCII.txt', 'utf8'),
                n: 2,
            },
        },
        infrastructOptions: {
            modelOptions: {
                model: 'gpt-4-base',
                max_tokens: 500,
                stream: true,
                n: 5,
                temperature: 1,
            },
            messageOptions: {
                systemMessage: fs.readFileSync('./contexts/infrastruct.txt', 'utf8'),
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
                stream: true,
            },
            messageOptions: {
                systemMessage: fs.readFileSync('./contexts/context.txt', 'utf8'),
            },
        },
        openRouterOptions: {
            modelOptions: {
                model: 'meta-llama/llama-3.1-405b-instruct',
                temperature: 1,
                stream: true,
                max_tokens: 600,
            },
            messageOptions: {
                systemMessage: '', // fs.readFileSync('./contexts/youArePrometheus.txt', 'utf8'),
            },
        },
    },
    bingAiClient: {
        // Necessary for some people in different countries, e.g. China (https://cn.bing.com)
        host: '',
        // The "_U" cookie value from bing.com
        userToken: '',
        // If the above doesn't work, provide all your cookies as a string instead
        cookies: 'ANON=A=07CD59DD20B766CD60DF538FFFFFFFFF&E=1dd8&W=1; _U=1G-WIqeTv6BzW3kEeGD-XymN5yVasXcI8dmoeRUXyPLb1cGAKzeMZg9HZ4PC63z7d0-dOzN2WXEFASJChIFvTkT8_qRVO9K3mx16u99d1XDWE-yAWjRLcSpm4CPwEPQNHl5yWmUn8xKOllK0TndBzerhMi4xbUwct8AUSEIceBSLa8K6YcRnOqmMuk_GBgTDUQZhlpqHA4MiHaU2-vbEQHA; _RwBf=r=1&p=bingcopilotwaitlist&c=MY00IA&t=3716&s=2023-02-13T15:26:43.1314498+00:00&rwred=0&wls=2&wlb=0&wle=0&ccp=1&cpt=0&lka=0&lkt=0&aad=0&TH=&mta=0&e=3n-OfNZU5qtEun5_Inx3OzazC_h6_bnS5ugQSqq1O5fn5qshuWJre7lKiw7WiX60mkV0qiq9SN6Rvfm-X33Q1A&A=07CD59DD20B766CD60DF538FFFFFFFFF',

        // A proxy string like "http://<ip>:<port>"
        proxy: '',
        // (Optional) Set 'x-forwarded-for' for the request. You can use a fixed IPv4 address or specify a range using CIDR notation,
        // and the program will randomly select an address within that range. The 'x-forwarded-for' is not used by default now.
        // xForwardedFor: '13.104.0.0/14',
        // (Optional) Set 'genImage' to true to enable bing to create images for you. It's disabled by default.
        // features: {
        //     genImage: true,
        // },
        debug: false,
    },

    chatGptClient: {
        apiKey: process.env.OPENAI_API_KEY || '',
        completionsUrl: 'https://api.openai.com/v1/chat/completions',
        // (Optional) Set to true to enable `console.debug()` logging
        debug: false,
    },
    openrouterClient: {
        apiKey: process.env.OPENROUTER_API_KEY || '',
        completionsUrl: 'https://openrouter.ai/api/v1/chat/completions',
        debug: false,
    },
    infrastructClient: {
        apiKey: process.env.OPENAI_API_KEY || '',
        completionsUrl: 'https://api.openai.com/v1/completions',
        debug: false,
    },
    claudeClient: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        completionsUrl:  'https://api.anthropic.com/v1/messages',
        debug: false,
    },
    ollamaClient: {
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
        clientToUse: 'claude',
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
                // 'promptPrefix',
                // 'userLabel',
                // 'chatGptLabel',
                // Setting `modelOptions.temperature` here will allow changing ONLY the temperature.
                // Other options like `modelOptions.model` will not be allowed to be changed.
                // If you want to allow changing all `modelOptions`, define `modelOptions` here instead of `modelOptions.temperature`.
                // 'modelOptions.temperature',
            ],
        },
    },
};

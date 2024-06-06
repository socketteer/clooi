import './fetch-polyfill.js';
import { encoding_for_model as encodingForModel, get_encoding as getEncoding } from '@dqbd/tiktoken';

import ChatClient from './ChatClient.js';

const MODEL_INFO = {
    default: {
        contextLength: 8192,
        vision: false,
        json: false,
        maxResponseTokens: 4096,
    },
    'gpt-4o-2024-05-13': {
        contextLength: 128000,
        vision: true,
    },
    'gpt-4-turbo-2024-04-09': {
        contextLength: 128000,
        vision: true,
        json: true,
    },
    'gpt-4-0125-preview': {
        contextLength: 128000,
        maxResponseTokens: 4096,
    },
    'gpt-4-1106-preview': {
        contextLength: 128000,
        maxResponseTokens: 4096,
        json: true,
    },
    'gpt-4-1106-vision-preview': {
        contextLength: 128000,
        vision: true,
    },
    'gpt-4-0613': {
        contextLength: 8192,
    },
    'gpt-4-32k-0613': {
        contextLength: 32768,
    },
};

const MODEL_POINTERS = {
    'gpt-4o': 'gpt-4o-2024-05-13',
    'gpt-4-turbo': 'gpt-4-turbo-2024-04-09',
    'gpt-4-turbo-preview': 'gpt-4-0125-preview',
    'gpt-4-vision-preview': 'gpt-4-1106-preview',
    'gpt-4': 'gpt-4-0613',
    'gpt-4-32k': 'gpt-4-32k-0613',
};

const CHATGPT_DEFAULT_MODEL_OPTIONS = {
    // set some good defaults (check for undefined in some cases because they may be 0)
    model: 'gpt-4o',
    temperature: 1,
    stream: true,
    max_tokens: 600,
};

const CHATGPT_PARTICIPANTS = {
    bot: {
        display: 'ChatGPT',
        author: 'assistant',
        defaultMessageType: 'message',
    },
};

const tokenizersCache = {};

export default class ChatGPTClient extends ChatClient {
    constructor(
        apiKey,
        options = {},
        cacheOptions = {},
    ) {
        cacheOptions.namespace = cacheOptions.namespace || 'chatgpt';
        super(options);
        this.apiKey = apiKey;
        this.completionsUrl = 'https://api.openai.com/v1/chat/completions';
        this.isChatGptModel = true;
        this.modelInfo = MODEL_INFO;
        this.modelPointers = MODEL_POINTERS;
        this.modelOptions = CHATGPT_DEFAULT_MODEL_OPTIONS;
        this.participants = CHATGPT_PARTICIPANTS;

        // this.conversationsCache = new Keyv(cacheOptions);

        this.setOptions(options);
    }

    setOptions(options) {
        super.setOptions(options);
        if (this.options.openaiApiKey) {
            this.apiKey = this.options.openaiApiKey;
        }
        return this;
    }

    static getTokenizer(encoding, isModelName = false, extendSpecialTokens = {}) {
        if (tokenizersCache[encoding]) {
            return tokenizersCache[encoding];
        }
        let tokenizer;
        if (isModelName) {
            tokenizer = encodingForModel(encoding, extendSpecialTokens);
        } else {
            tokenizer = getEncoding(encoding, extendSpecialTokens);
        }
        tokenizersCache[encoding] = tokenizer;
        return tokenizer;
    }

    buildApiParams(userMessage = null, previousMessages = [], systemMessage = null) {
        const history = [
            ...systemMessage ? [systemMessage] : [],
            ...previousMessages,
            ...userMessage ? [userMessage] : [],
        ];
        const messages = history.map(msg => this.toAPImessage(msg));
        return {
            messages,
        };
    }
}

//     async generateTitle(userMessage, botMessage) {
//         const instructionsPayload = {
//             role: 'system',
//             content: `Write an extremely concise subtitle for this conversation with no more than a few words. All words should be capitalized. Exclude punctuation.

// ||>Message:
// ${userMessage.message}
// ||>Response:
// ${botMessage.message}

// ||>Title:`,
//         };

//         const titleGenClientOptions = JSON.parse(JSON.stringify(this.options));
//         titleGenClientOptions.modelOptions = {
//             model: 'gpt-3.5-turbo',
//             temperature: 0,
//             presence_penalty: 0,
//             frequency_penalty: 0,
//         };
//         const titleGenClient = new ChatGPTClient(this.apiKey, titleGenClientOptions);
//         const result = await titleGenClient.getCompletion([instructionsPayload], null);
//         // remove any non-alphanumeric characters, replace multiple spaces with 1, and then trim
//         return result.choices[0].message.content
//             .replace(/[^a-zA-Z0-9' ]/g, '')
//             .replace(/\s+/g, ' ')
//             .trim();
//     }

    // async buildPrompt(messages, parentMessageId, { isChatGptModel = false, promptPrefix = null }) {
    //     const orderedMessages = this.constructor.getMessagesForConversation(messages, parentMessageId);

    //     promptPrefix = (promptPrefix || this.options.promptPrefix || '').trim();
    //     if (promptPrefix) {
    //         // If the prompt prefix doesn't end with the end token, add it.
    //         if (!promptPrefix.endsWith(`${this.endToken}`)) {
    //             promptPrefix = `${promptPrefix.trim()}${this.endToken}\n\n`;
    //         }
    //         promptPrefix = `${this.startToken}Instructions:\n${promptPrefix}`;
    //     } else {
    //         const currentDateString = new Date().toLocaleDateString(
    //             'en-us',
    //             { year: 'numeric', month: 'long', day: 'numeric' },
    //         );
    //         promptPrefix = `${this.startToken}Instructions:\nYou are ChatGPT, a large language model trained by OpenAI. Respond conversationally.\nCurrent date: ${currentDateString}${this.endToken}\n\n`;
    //     }

    //     const promptSuffix = `${this.startToken}${this.chatGptLabel}:\n`; // Prompt ChatGPT to respond.

    //     const instructionsPayload = {
    //         role: 'system',
    //         name: 'instructions',
    //         content: promptPrefix,
    //     };

    //     const messagePayload = {
    //         role: 'system',
    //         content: promptSuffix,
    //     };

    //     let currentTokenCount;
    //     if (isChatGptModel) {
    //         currentTokenCount = this.getTokenCountForMessage(instructionsPayload) + this.getTokenCountForMessage(messagePayload);
    //     } else {
    //         currentTokenCount = this.getTokenCount(`${promptPrefix}${promptSuffix}`);
    //     }
    //     let promptBody = '';
    //     const maxTokenCount = this.maxPromptTokens;

    //     const context = [];

    //     // Iterate backwards through the messages, adding them to the prompt until we reach the max token count.
    //     // Do this within a recursive async function so that it doesn't block the event loop for too long.
    //     const buildPromptBody = async () => {
    //         if (currentTokenCount < maxTokenCount && orderedMessages.length > 0) {
    //             const message = orderedMessages.pop();
    //             const roleLabel = message.role === 'User' ? this.userLabel : this.chatGptLabel;
    //             const messageString = `${this.startToken}${roleLabel}:\n${message.message}${this.endToken}\n`;
    //             let newPromptBody;
    //             if (promptBody || isChatGptModel) {
    //                 newPromptBody = `${messageString}${promptBody}`;
    //             } else {
    //                 // Always insert prompt prefix before the last user message, if not gpt-3.5-turbo.
    //                 // This makes the AI obey the prompt instructions better, which is important for custom instructions.
    //                 // After a bunch of testing, it doesn't seem to cause the AI any confusion, even if you ask it things
    //                 // like "what's the last thing I wrote?".
    //                 newPromptBody = `${promptPrefix}${messageString}${promptBody}`;
    //             }

    //             context.unshift(message);

    //             const tokenCountForMessage = this.getTokenCount(messageString);
    //             const newTokenCount = currentTokenCount + tokenCountForMessage;
    //             if (newTokenCount > maxTokenCount) {
    //                 if (promptBody) {
    //                     // This message would put us over the token limit, so don't add it.
    //                     return false;
    //                 }
    //                 // This is the first message, so we can't add it. Just throw an error.
    //                 throw new Error(`Prompt is too long. Max token count is ${maxTokenCount}, but prompt is ${newTokenCount} tokens long.`);
    //             }
    //             promptBody = newPromptBody;
    //             currentTokenCount = newTokenCount;
    //             // wait for next tick to avoid blocking the event loop
    //             await new Promise(resolve => setImmediate(resolve));
    //             return buildPromptBody();
    //         }
    //         return true;
    //     };

    //     await buildPromptBody();

    //     const prompt = `${promptBody}${promptSuffix}`;
    //     if (isChatGptModel) {
    //         messagePayload.content = prompt;
    //         // Add 2 tokens for metadata after all messages have been counted.
    //         currentTokenCount += 2;
    //     }

    //     // Use up to `this.maxContextTokens` tokens (prompt + response), but try to leave `this.maxTokens` tokens for the response.
    //     this.modelOptions.max_tokens = Math.min(this.maxContextTokens - currentTokenCount, this.maxResponseTokens);

    //     if (isChatGptModel) {
    //         return { prompt: [instructionsPayload, messagePayload], context };
    //     }
    //     return { prompt, context };
    // }

    // getTokenCount(text) {
    //     return this.gptEncoder.encode(text, 'all').length;
    // }

    // /**
    //  * Algorithm adapted from "6. Counting tokens for chat API calls" of
    //  * https://github.com/openai/openai-cookbook/blob/main/examples/How_to_count_tokens_with_tiktoken.ipynb
    //  *
    //  * An additional 2 tokens need to be added for metadata after all messages have been counted.
    //  *
    //  * @param {*} message
    //  */
    // getTokenCountForMessage(message) {
    //     let tokensPerMessage;
    //     let nameAdjustment;
    //     if (this.modelOptions.model.startsWith('gpt-4')) {
    //         tokensPerMessage = 3;
    //         nameAdjustment = 1;
    //     } else {
    //         tokensPerMessage = 4;
    //         nameAdjustment = -1;
    //     }

    //     // Map each property of the message to the number of tokens it contains
    //     const propertyTokenCounts = Object.entries(message).map(([key, value]) => {
    //         // Count the number of tokens in the property value
    //         const numTokens = this.getTokenCount(value);

    //         // Adjust by `nameAdjustment` tokens if the property key is 'name'
    //         const adjustment = (key === 'name') ? nameAdjustment : 0;
    //         return numTokens + adjustment;
    //     });

    //     // Sum the number of tokens in all properties and add `tokensPerMessage` for metadata
    //     return propertyTokenCounts.reduce((a, b) => a + b, tokensPerMessage);
    // }

    // /**
    //  * Iterate through messages, building an array based on the parentMessageId.
    //  * Each message has an id and a parentMessageId. The parentMessageId is the id of the message that this message is a reply to.
    //  * @param messages
    //  * @param parentMessageId
    //  * @returns {*[]} An array containing the messages in the order they should be displayed, starting with the root message.
    //  */
    // static getMessagesForConversation(messages, parentMessageId) {
    //     const orderedMessages = [];
    //     let currentMessageId = parentMessageId;
    //     while (currentMessageId) {
    //         // eslint-disable-next-line no-loop-func
    //         const message = messages.find(m => m.id === currentMessageId);
    //         if (!message) {
    //             break;
    //         }
    //         orderedMessages.unshift(message);
    //         currentMessageId = message.parentMessageId;
    //     }

    //     return orderedMessages;
    // }

    // static formatHistory(messageHistory) {
    //     return messageHistory.map(message => `#### ${message.role}:\n${message.message}`).join('\n\n');
    // }
// }

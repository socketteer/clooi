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
    constructor(options = {}) {
        options.cache.namespace = options.cache.namespace || 'chatgpt';
        super(options);
        this.apiKey = process.env.OPENAI_API_KEY || '';
        this.completionsUrl = 'https://api.openai.com/v1/chat/completions';
        this.isChatGptModel = true;
        this.modelInfo = MODEL_INFO;
        this.modelPointers = MODEL_POINTERS;
        this.modelOptions = CHATGPT_DEFAULT_MODEL_OPTIONS;
        this.participants = CHATGPT_PARTICIPANTS;

        this.setOptions(options);
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


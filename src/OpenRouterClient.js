import './fetch-polyfill.js';
import ChatClient from './ChatClient.js';

//TODO: add support for other models
const MODEL_INFO = {
    default: {
        contextLength: 8192,
        vision: false,
        json: false,
        maxResponseTokens: 4096,
    },
    'meta-llama/llama-3.1-8b-instruct': {
        contextLength: 131072,
    },
    'meta-llama/llama-3.1-405b-instruct': {
        contextLength: 131072,
    },
};

const OPENROUTER_DEFAULT_MODEL_OPTIONS = {
    model: 'meta-llama/llama-3.1-405b-instruct',
    temperature: 1,
    stream: true,
    max_tokens: 600,
};

const OPENROUTER_PARTICIPANTS = {
    bot: {
        display: 'OpenRouter',
        author: 'assistant',
        defaultMessageType: 'message',
    },
    user: {
        display: 'You',
        author: 'user',
        defaultMessageType: 'message',
    },
};

export default class OpenRouterClient extends ChatClient {
    constructor(options = {}) {
        options.cache.namespace = options.cache.namespace || 'openrouter';
        super(options);
        this.apiKey = process.env.OPENROUTER_API_KEY || '';
        this.completionsUrl = 'https://openrouter.ai/api/v1/chat/completions';
        this.isChatGptModel = true;
        this.modelInfo = MODEL_INFO;
        this.modelOptions = OPENROUTER_DEFAULT_MODEL_OPTIONS;
        this.participants = OPENROUTER_PARTICIPANTS;

        this.setOptions(options);
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
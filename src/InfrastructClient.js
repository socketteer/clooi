import ChatClient from './ChatClient.js';

const INFRASTRUCT_MODEL_INFO = {
    default: {
        contextLength: 8192,
    },
    'gpt-4-base': {
        contextLength: 8192,
    },
    'davinci-002': {
        contextLength: 16384,
    },
    'babbage-002': {
        contextLength: 16384,
    },
};

const INFRASTRUCT_PARTICIPANTS = {
    bot: {
        display: 'Infrastruct',
        author: 'assistant',
        defaultMessageType: 'message',
    },
    system: {
        display: 'System',
        author: 'system',
        defaultMessageType: 'instructions',
    },
};

const INFRASTRUCT_DEFAULT_MODEL_OPTIONS = userHandle => ({
    model: 'gpt-4-base',
    temperature: 1,
    n: 3,
    stop: `\n[${userHandle}](#`,
    stream: true,
    max_tokens: 300,
});

export default class InfrastructClient extends ChatClient {
    constructor(apiKey, options) {
        options.cache.namespace = options.cache.namespace || 'infrastruct';
        super(options);
        this.apiKey = apiKey;
        this.completionsUrl = 'https://api.openai.com/v1/completions';
        this.participants = INFRASTRUCT_PARTICIPANTS;
        this.modelInfo = INFRASTRUCT_MODEL_INFO;
        this.setOptions(options);
        this.modelOptions = INFRASTRUCT_DEFAULT_MODEL_OPTIONS(this.participants.user.author);
        // this.options.debug = true;
    }

    setOptions(options) {
        super.setOptions(options);
        if (this.options.openaiApiKey) {
            this.apiKey = this.options.openaiApiKey;
        }
        return this;
    }

    buildApiParams(userMessage, previousMessages = [], systemMessage = null) {
        const history = [
            ...systemMessage ? [systemMessage] : [],
            ...previousMessages,
            ...userMessage ? [userMessage] : [],
        ];
        const transcript = this.toTranscript(history);
        return {
            prompt: `${transcript}\n\n[${this.participants.bot.author}](#${this.participants.bot.defaultMessageType})\n`,

        };
    }
}

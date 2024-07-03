import ChatClient from './ChatClient.js';

const CLAUDE_MODEL_INFO = {
    default: {
        contextLength: 100000,
        vision: true,
        maxResponseTokens: 10000,
    },
    'claude-3-opus-20240229': {
        contextLength: 100000,
        vision: true,
        maxResponseTokens: 10000,
    },
    'claude-3-sonnet-20240229': {
        contextLength: 100000,
        vision: true,
        maxResponseTokens: 10000,
    },
    'claude-3-haiku-20240307': {
        contextLength: 100000,
        vision: true,
        maxResponseTokens: 10000,
    },
    'claude-3-sonnet-20240229-steering-preview': {
        contextLength: 100000,
        vision: true,
        maxResponseTokens: 10000,
    },
};

const CLAUDE_PARTICIPANTS = {
    bot: {
        display: 'Claude',
        author: 'assistant',
        defaultMessageType: 'message',
    },
};

const CLAUDE_DEFAULT_MODEL_OPTIONS = {
    model: 'claude-3-opus-20240229',
    max_tokens: 4096,
    temperature: 1,
    stream: true,
};

export default class ClaudeClient extends ChatClient {
    constructor(options = {}) {
        options.cache.namespace = options.cache.namespace || 'claude';
        super(options);
        this.apiKey = process.env.ANTHROPIC_API_KEY || '';
        this.completionsUrl = 'https://api.anthropic.com/v1/messages';
        this.modelOptions = CLAUDE_DEFAULT_MODEL_OPTIONS;
        this.participants = CLAUDE_PARTICIPANTS;
        this.modelInfo = CLAUDE_MODEL_INFO;
        this.n = 1;
        this.setOptions(options);
    }

    getHeaders() {
        let anthropicBeta
        if (this.modelOptions.includes('steering')) {
            anthropicBeta = 'steering-2024-06-04';
        } else {
            anthropicBeta = 'messages-2023-12-15';
        }
        return {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': anthropicBeta,
        };
    }

    onProgressIndexical(message, replies, idx, opts) {
        if (message === '[DONE]') {
            // opts.onProgress('[DONE]', idx);
            opts.onFinished(idx);
        }
        if (message.type === 'message_start') {
            return;
        }
        if (message.type === 'message_end') {
            // opts.onProgress('message_end', idx);
            return;
        }
        if (message.type === 'content_block_start') {
            return;
        }
        if (message.type === 'content_block_delta') {
            if (message?.delta?.text) {
                if (!replies[idx]) {
                    replies[idx] = '';
                }
                replies[idx] += message.delta.text;
                opts.onProgress(message.delta.text, idx);
            }
            // if (idx === 0) {
            //     opts.onProgress(message.delta.text);
            // }
        } else {
            // console.debug(progressMessage);
        }
    }


    parseReplies(result, replies) {
        result.forEach((res, idx) => {
            replies[idx] = res.choices[0].message.content;
        });
    }

    buildApiParams(userMessage = null, previousMessages = [], systemMessage = null) {
        // const maxHistoryLength = 20;
        const { messages: history, system } = super.buildApiParams(userMessage, previousMessages, systemMessage);
        // merge all consecutive messages from the same author
        const mergedMessageHistory = [];
        let lastMessage = null;
        for (const message of history) {
            if (lastMessage && lastMessage.role === message.role) {
                lastMessage.content += `${message.content}`;
            } else {
                lastMessage = message;
                mergedMessageHistory.push(message);
            }
        }
        return {
            messages: mergedMessageHistory, //.slice(-maxHistoryLength),
            ...(system ? { system } : {}),
        };
    }
}

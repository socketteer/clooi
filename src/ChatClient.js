import crypto from 'crypto';

import Keyv from 'keyv';
import { fetchEventSource } from '@waylaidwanderer/fetch-event-source';
import { Agent } from 'undici';
import { getMessagesForConversation } from './conversation.js';
import { encoding_for_model as encodingForModel, get_encoding as getEncoding } from '@dqbd/tiktoken';

import * as conversions from './typeConversionUtil.js';

const DEFAULT_MODEL_INFO = {
    default: {
        contextLength: 8192,
        maxResponseTokens: 4096,
    },
};

const DEFAULT_PARTICIPANTS = {
    user: {
        display: 'User',
        author: 'user',
        defaultMessageType: 'message',
    },
    bot: {
        display: 'Assistant',
        author: 'assistant',
        defaultMessageType: 'message',
    },
    system: {
        display: 'System',
        author: 'system',
        defaultMessageType: 'message',
    },
};

const DEFAULT_API_MESSAGE_SCHEMA = {
    author: 'role',
    text: 'content',
};

const tokenizersCache = {};

export default class ChatClient {
    constructor(options) {
        if (options.keyv) {
            if (!options.keyv.namespace) {
                console.warn(
                    'The given Keyv object has no namespace. This is a bad idea if you share a database.',
                );
            }
            this.conversationsCache = options.keyv;
        } else {
            const cacheOptions = options.cache || {};
            cacheOptions.namespace = cacheOptions.namespace || 'default';
            this.conversationsCache = new Keyv(cacheOptions);
        }
        this.isChatGptModel = false;
        this.endToken = '';
        this.apiMessageSchema = DEFAULT_API_MESSAGE_SCHEMA;
        this.modelInfo = DEFAULT_MODEL_INFO;
        this.modelPointers = {};
        this.n = null;
        this.setOptions(options);
        // this.options.debug = true;
    }

    setOptions(options) {
        // don't allow overriding cache options for consistency with other clients
        delete options.cache;
        if (this.options && !this.options.replaceOptions) {
            this.options = {
                ...this.options,
                ...options,
            };
        } else {
            this.options = {
                ...options,
            };
        }
        if (this.options.apiKey) {
            this.apiKey = this.options.apiKey;
        }
        if (this.options.completionsUrl) {
            this.completionsUrl = this.options.completionsUrl;
        }
        if (this.options.n) {
            this.n = this.options.n;
        }
        const modelOptions = this.options.modelOptions || {};
        this.modelOptions = {
            ...this.modelOptions,
            ...modelOptions,
        };
        const participants = this.options.participants || {};
        this.participants = {
            ...DEFAULT_PARTICIPANTS,
            ...this.participants,
            ...participants,
        };
        const modelInfo = this.modelInfo[this.modelOptions.model] ||
        this.modelInfo[this.modelPointers[this.modelOptions.model]] ||
        this.modelInfo.default;
        this.maxContextTokens = modelInfo.contextLength;
        this.maxResponseTokens = this.modelOptions.max_tokens || modelInfo.maxResponseTokens || 400;
        this.maxPromptTokens = this.options.maxPromptTokens || (this.maxContextTokens - this.maxResponseTokens);

        if (this.maxPromptTokens + this.maxResponseTokens > this.maxContextTokens) {
            throw new Error(`maxPromptTokens + max_tokens (${this.maxPromptTokens} + ${this.maxResponseTokens} = ${this.maxPromptTokens + this.maxResponseTokens}) must be less than or equal to maxContextTokens (${this.maxContextTokens})`);
        }
        return this;
    }

    get names() {
        return this.participants;
    }

    convertAlias(sourceType, targetType, alias) {
        // console.log('sourceType:', sourceType);
        for (const participant in this.participants) {
            if (this.participants[participant][sourceType] === alias) {
                return this.participants[participant][targetType];
            }
        }
        return alias;
    }

    // TODO trim prompt to fit context length
    async buildConversationHistory(conversationId, parentMessageId = null) {
        const conversation = (await this.conversationsCache.get(conversationId)) || {
            messages: [],
            createdAt: Date.now(),
        };

        const previousMessages = getMessagesForConversation(
            conversation.messages,
            parentMessageId,
        ).map(msg => this.toBasicMessage(msg));

        const parentId = parentMessageId || previousMessages[conversation.messages.length - 1]?.id || crypto.randomUUID();

        return {
            parentId,
            previousMessages,
            conversation,
        };
    }

    buildMessage(message = '', author = null, type = null, opts={}) {
        const text = message?.text || message;
        author = message?.author || author;
        type = message?.type || type;
        const basicMessage = {
            author: author || this.participants.user.author,
            text,
            type: type || this.participants[author]?.defaultMessageType || 'message',
            ...opts,
        };
        return basicMessage;
    }

    buildApiParams(userMessage = null, previousMessages = [], systemMessage = null) {
        const history = [
            ...userMessage ? [userMessage] : [],
            ...previousMessages,
        ];
        const messages = history.map(msg => this.toAPImessage(msg));
        return {
            messages,
            system: systemMessage?.text || null,
        };
    }

    async yieldGenContext(userMessage, modelOptions = {}, opts = {}) {
        if (opts.clientOptions && typeof opts.clientOptions === 'object') {
            this.setOptions(opts.clientOptions);
        }

        let {
            conversationId,
            systemMessage,
        } = opts;

        const {
            saveToCache = false,
            parentMessageId,
        } = opts;

        if (conversationId === null) {
            conversationId = crypto.randomUUID();
        }

        const {
            parentId,
            previousMessages,
            conversation,
        } = await this.buildConversationHistory(conversationId, parentMessageId);

        if (typeof systemMessage === 'string' && systemMessage.length) {
            systemMessage = this.buildMessage(systemMessage, this.participants.system.author);
        }
        if (typeof userMessage === 'string' && userMessage.length) {
            userMessage = this.buildMessage(userMessage, this.participants.user.author);
        }

        let userConversationMessage;
        if (userMessage && saveToCache) {
            userConversationMessage = this.createConversationMessage(userMessage, parentId);
            conversation.messages.push(userConversationMessage);
            await this.conversationsCache.set(conversationId, conversation);
        }

        const completionParentId = userConversationMessage ? userConversationMessage.id : parentId;

        const apiParams = {
            ...modelOptions,
            ...this.buildApiParams(userMessage, previousMessages, systemMessage, { ...modelOptions, ...opts }),
        };

        return {
            apiParams,
            conversationId,
            completionParentId,
            userConversationMessage,
            conversation,
        };
    }

    async sendMessage(message, modelOptions = {}, opts = {}) {
        const {
            apiParams,
            conversationId,
            completionParentId,
            userConversationMessage,
            conversation,
        } = await this.yieldGenContext(message, modelOptions, opts);

        const { result, replies } = await this.callAPI(apiParams, opts);

        const newConversationMessages = [];
        if (opts.saveToCache) {
            for (const text of Object.values(replies)) {
                const simpleMessage = this.buildMessage(text.trim(), this.participants.bot.author);
                newConversationMessages.push(this.createConversationMessage(simpleMessage, completionParentId));
            }
            conversation.messages.push(...newConversationMessages);
            await this.conversationsCache.set(conversationId, conversation);
        }
        // const botConversationMessage = newConversationMessages[0];

        return {
            result,
            replies,
            conversationId,
            apiParams,
            opts,
            completionParentId,
            userConversationMessage,
            newConversationMessages,
        };
    }

    async standardCompletion(messages={}, modelOptions = {}, opts = {}) {
        const {
            userMessage,
            previousMessages,
            systemMessage,
        } = messages;
        
        const apiParams = {
            ...modelOptions,
            ...this.buildApiParams(userMessage, previousMessages, systemMessage, { ...modelOptions, ...opts }),
        };

        result = await this.callAPI(apiParams, opts);
        return result
    }

    getHeaders() {
        return {
            Authorization: `Bearer ${this.apiKey}`,
        };
    }

    onProgressWrapper(message, replies, opts) {
        if (message === '[DONE]') {
            return;
        }
        if (!message.choices) {
            // console.debug('no choices, message:', message);
            return;
        }
        const idx = message.choices[0]?.index;

        this.onProgressIndexical(message, replies, idx, opts);
    }

    onProgressIndexical(message, replies, idx, opts) {
        const token = this.isChatGptModel ? message.choices[0]?.delta.content : message.choices[0]?.text;

        if (idx !== undefined) {
            if (token && token !== this.endToken) {
                if (!replies[idx]) {
                    replies[idx] = '';
                }
                replies[idx] += token;
                opts.onProgress(token, idx);
            }
        }

        if (message.choices[0]?.finish_reason) {
            opts.onFinished(idx, null, message.choices[0]?.finish_reason);
        }
    }

    parseReplies(result, replies) {
        Array.from(result.choices).forEach((choice, index) => {
            replies[index] = this.isChatGptModel ? choice.message.content : choice.text;
        });
    }

    async callAPI(params, opts = {}) {
        // let reply = '';

        const modelOptions = {
            ...this.modelOptions,
            ...params,
        };
        if (modelOptions.stream) {
            if (typeof opts.onProgress !== 'function') {
                opts.onProgress = () => {};
            }
            if (typeof opts.onFinished !== 'function') {
                opts.onFinished = () => {};
            }
        }
        const n = opts.n || this.n || null;

        let result = null;
        const replies = {};

        const completion = async onProgress => this.getCompletion(
            modelOptions,
            modelOptions.stream ? onProgress : null,
            opts.abortController || new AbortController(),
        );

        if (n) {
            result = await Promise.all([...Array(n).keys()].map(async idx => completion(
                message => this.onProgressIndexical(message, replies, idx, opts),
            )));
        } else {
            result = await completion(message => this.onProgressWrapper(message, replies, opts));
        }
        if (!modelOptions.stream) {
            this.parseReplies(result, replies);
        }
        return {
            result,
            replies,
        };
    }

    async getCompletion(modelOptions, onProgress, abortController, debug = false) {

        const opts = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...this.getHeaders(),
            },
            body: JSON.stringify(modelOptions),
            dispatcher: new Agent({
                bodyTimeout: 0,
                headersTimeout: 0,
            }),
        };

        if (debug) {
            console.debug('model options:', modelOptions);
        }

        const url = this.completionsUrl;

        if (modelOptions.stream) {
            // eslint-disable-next-line no-async-promise-executor
            return new Promise(async (resolve, reject) => {
                abortController.signal.addEventListener('abort', () => {
                    // clearTimeout(messageTimeout);
                    // this.constructor.cleanupWebSocketConnection(ws);
                    reject(new Error('Request aborted'));
                });

                try {
                    let done = false;
                    await fetchEventSource(url, {
                        ...opts,
                        signal: abortController.signal,
                        async onopen(response) {
                            if (response.status === 200) {
                                return;
                            }
                            if (debug) {
                                console.debug(response);
                            }
                            let error;
                            try {
                                const body = await response.text();
                                error = new Error(`Failed to send message. HTTP ${response.status} - ${body}`);
                                error.status = response.status;
                                error.json = JSON.parse(body);
                            } catch {
                                error = error || new Error(`Failed to send message. HTTP ${response.status}`);
                            }
                            throw error;
                            // reject(error);
                        },
                        onclose() {
                            if (debug) {
                                console.debug('Server closed the connection unexpectedly, returning...');
                            }
                            // workaround for private API not sending [DONE] event
                            if (!done) {
                                onProgress('[DONE]');
                                // abortController.abort();
                                resolve();
                            }
                        },
                        onerror(err) {
                            if (debug) {
                                console.debug(err);
                            }
                            // rethrow to stop the operation
                            throw err;
                            // reject(err);
                        },
                        onmessage(message) {
                            if (debug) {
                                console.debug(message);
                            }
                            if (!message.data || message.event === 'ping') {
                                return;
                            }
                            if (message.data === '[DONE]') {
                                onProgress('[DONE]');
                                // abortController.abort();
                                resolve(message);
                                done = true;
                                return;
                            }
                            onProgress(JSON.parse(message.data));
                        },
                    });
                } catch (err) {
                    reject(err);
                }
            });
        }
        const response = await fetch(
            url,
            {
                ...opts,
                signal: abortController.signal,
            },
        );
        if (response.status !== 200) {
            const body = await response.text();
            const error = new Error(`Failed to send message. HTTP ${response.status} - ${body}`);
            error.status = response.status;
            try {
                error.json = JSON.parse(body);
            } catch {
                error.body = body;
            }
            throw error;
        }
        return response.json();
    }

    async addMessages(conversationId, messages, parentMessageId = null, chain = true) {
        // if chain is true, messages will be added in a consecutive chain
        // otherwise, they will be added in parallel to the same parent
        if (!conversationId) {
            conversationId = crypto.randomUUID();
        }
        const conversation = (await this.conversationsCache.get(conversationId)) || {
            messages: [],
            createdAt: Date.now(),
        };
        parentMessageId = parentMessageId || conversation.messages[conversation.messages.length - 1]?.id || crypto.randomUUID();

        let newConversationMessages;
        if (chain) {
            newConversationMessages = this.createConversationMessages(
                messages,
                parentMessageId,
            );
            conversation.messages = conversation.messages.concat(newConversationMessages);
            // messageId = conversation.messages[conversation.messages.length - 1].id;
        } else {
            newConversationMessages = [];
            for (const message of messages) {
                const conversationMessage = this.createConversationMessage(
                    message,
                    parentMessageId,
                );
                newConversationMessages.push(conversationMessage);
            }
            conversation.messages.push(...newConversationMessages);
        }
        const messageId = newConversationMessages[newConversationMessages.length - 1].id;

        await this.conversationsCache.set(conversationId, conversation);
        return {
            conversationId,
            messageId,
            newConversationMessages,
            messages: conversation.messages,
            parentMessageId,
        };
    }

    toAPImessage(message) {
        // for every key in this.apiMessageSchema, map the value from the message
        const apiMessage = {};
        for (const key in this.apiMessageSchema) {
            if (message[key]) {
                apiMessage[this.apiMessageSchema[key]] = message[key];
            }
        }
        return apiMessage;
    }

    toBasicMessage(conversationMessage) {
        const author = this.convertAlias('display', 'author', conversationMessage.role);
        return {
            text: conversationMessage.message || '',
            author,
            type: conversationMessage.type || this.participants[author]?.defaultMessageType || 'message',
        };
    }

    toMessages(history) {
        switch (conversions.getDataType(history)) {
            case '[basicMessage]': return history;
            case 'transcript': return conversions.parseTranscript(history);
            // case 'xml': return conversions.parseXml(history);
            case 'basicMessage': return [history];
            case 'conversationMessage': return [this.toBasicMessage(history)];
            case '[conversationMessage]': return history.map(message => this.toBasicMessage(message));
            case 'xml':
            case 'string': return [{ text: history, author: this.participants.user.author }];
            default:
                return [];
                // throw new Error('Invalid history data type:', typeof history); // return null;
        }
    }

    toTranscript(history) {
        return conversions.toTranscript(this.toMessages(history));
    }

    createConversationMessage(message, parentMessageId, opts = {}) {
        const role = this.convertAlias('author', 'display', message.author);
        return {
            id: crypto.randomUUID(),
            parentMessageId,
            role,
            message: message.text,
            unvisited: true,
            ...(message.type ? { type: message.type } : {}),
            ...(message.details ? { details: message.details } : {}),
            ...opts,
            // ...(opts || {}),
        };
    }

    createConversationMessages(messages, rootMessageId) {
        messages = this.toMessages(messages);
        const conversationMessages = [];
        let parentMessageId = rootMessageId;
        for (const message of messages) {
            const conversationMessage = this.createConversationMessage(
                message,
                parentMessageId,
            );
            conversationMessages.push(conversationMessage);
            parentMessageId = conversationMessage.id;
        }
        return conversationMessages;
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

    getTokenCount(text) {
        return this.gptEncoder.encode(text, 'all').length;
    }

    static getUserSuggestions(message) {
        return message?.suggestedResponses || null;
    }
}

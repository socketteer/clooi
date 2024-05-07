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

    buildMessage(message = '', author = null, type = null) {
        const text = message?.text || message;
        author = message?.author || author;
        type = message?.type || type;
        const basicMessage = {
            author: author || this.participants.user.author,
            text,
            type: type || this.participants[author]?.defaultMessageType || 'message',
        };
        return basicMessage;
    }

    buildApiParams(userMessage, previousMessages = [], systemMessage = null) {
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

    async sendMessage(message, opts = {}) {
        if (opts.clientOptions && typeof opts.clientOptions === 'object') {
            this.setOptions(opts.clientOptions);
        }

        let {
            conversationId = null,
            onProgress,
            systemMessage = null,
        } = opts;

        const {
            parentMessageId,
            saveToCache = true,
        } = opts;

        if (typeof onProgress !== 'function') {
            onProgress = () => {};
        }

        if (conversationId === null) {
            conversationId = crypto.randomUUID();
        }
        const { parentId, previousMessages, conversation } = await this.buildConversationHistory(conversationId, parentMessageId);

        let userMessage;
        if (message) {
            userMessage = this.buildMessage(message, this.participants.user.author);
        }

        let userConversationMessage;
        if (saveToCache && userMessage) {
            userConversationMessage = this.createConversationMessage(userMessage, parentId);
            conversation.messages.push(userConversationMessage);
        }

        if (systemMessage) {
            systemMessage = this.buildMessage(systemMessage, this.participants.system.author);
        }

        const completionParentId = userConversationMessage ? userConversationMessage.id : parentMessageId;

        const apiParams = this.buildApiParams(userMessage, previousMessages, systemMessage);
        if (this.options.debug) {
            console.debug('apiParams:', apiParams);
            console.debug('opts:', opts);
            console.debug('userConversationMessage:', userConversationMessage);
        }
        const { result, replies } = await this.callAPI(apiParams, opts);
        const newConversationMessages = [];
        for (const [index, text] of Object.entries(replies)) {
            const simpleMessage = this.buildMessage(text.trim(), this.participants.bot.author);
            newConversationMessages.push(this.createConversationMessage(simpleMessage, completionParentId));
        }

        if (saveToCache) {
            conversation.messages.push(...newConversationMessages);
            await this.conversationsCache.set(conversationId, conversation);
        }
        const botConversationMessage = newConversationMessages[0];

        return {
            conversationId,
            parentId: completionParentId,
            messageId: botConversationMessage.id,
            messages: conversation.messages,
            apiParams,
            response: result,
            replies: newConversationMessages,
            details: null,
        };
    }

    getHeaders() {
        return {
            Authorization: `Bearer ${this.apiKey}`,
        };
    }

    onProgressWrapper(message, replies, opts) {
        if (message === '[DONE]') {
            // if (opts.onAllMessagesDone) {
            //     opts.onAllMessagesDone(result, replies);
            // }
            return;
        }
        const index = message.choices[0]?.index;
        const token = this.isChatGptModel ? message.choices[0]?.delta.content : message.choices[0]?.text;
        if (this.options.debug) {
            console.debug('token:', token);
        }

        if (!token || token === this.endToken) {
            if (this.options.debug) {
                console.debug('encountered end token');
            }
            if (index === 0) {
                if (opts.onFirstMessageDone) {
                    if (this.options.debug) {
                        console.debug('calling onFirstMessageDone');
                    }
                    opts.onFirstMessageDone(replies[0]);
                }
            }
            return;
        }
        if (index !== undefined) {
            if (!replies[index]) {
                replies[index] = '';
            }
            replies[index] += token;
            if (index === 0) {
                opts.onProgress(token);
                // reply += token;
            }
        }
    }

    parseReplies(result, replies) {
        Array.from(result.choices).forEach((choice, index) => {
            replies[index] = this.isChatGptModel ? choice.message.content : choice.text;
        });
    }

    async callAPI(params, opts = {}) {
        // let reply = '';
        let result = null;
        const replies = {};
        const stream = typeof opts.onProgress === 'function' && this.modelOptions.stream;
        result = await this.getCompletion(
            params,
            this.getHeaders(),
            stream ? (progressMessage) => {
                this.onProgressWrapper(progressMessage, replies, opts);
            } : null,
            opts.abortController || new AbortController(),
        );
        if (!stream) {
            // if (this.options.debug) {
            //     console.debug(JSON.stringify(result));
            // }
            this.parseReplies(result, replies);
        }
        // if (this.options.debug) {
        //     console.debug('result:', JSON.stringify(result));
        //     console.debug('replies:', replies);
        // }

        // if (opts.onAllMessagesDone) {
        //     opts.onAllMessagesDone(result, replies);
        // }
        return {
            result,
            replies,
        };
    }

    async getCompletion(params, headers, onProgress, abortController, debug = false) {
        const modelOptions = {
            ...this.modelOptions,
            ...params,
        };
        const opts = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
            body: JSON.stringify(modelOptions),
            dispatcher: new Agent({
                bodyTimeout: 0,
                headersTimeout: 0,
            }),
        };

        if (this.options.debug) {
            console.debug('request body:', modelOptions);
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

    async addMessages(conversationId, messages, parentMessageId = null) {
        if (!conversationId) {
            conversationId = crypto.randomUUID();
        }

        const conversation = (await this.conversationsCache.get(conversationId)) || {
            messages: [],
            createdAt: Date.now(),
        };

        parentMessageId = parentMessageId || conversation.messages[conversation.messages.length - 1]?.id || crypto.randomUUID();

        // create new conversation messages
        const newConversationMessages = this.createConversationMessages(
            messages,
            parentMessageId,
        );
        conversation.messages = conversation.messages.concat(newConversationMessages);
        await this.conversationsCache.set(conversationId, conversation);
        return {
            conversationId,
            messageId: conversation.messages[conversation.messages.length - 1].id,
            messages: conversation.messages,
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

    createConversationMessage(message, parentMessageId) {
        const role = this.convertAlias('author', 'display', message.author);
        return {
            id: crypto.randomUUID(),
            parentMessageId,
            role,
            message: message.text,
            ...(message.type ? { type: message.type } : {}),
            ...(message.details ? { details: message.details } : {}),
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
}

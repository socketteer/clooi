import crypto from 'crypto';

import Keyv from 'keyv';
import { fetchEventSource } from '@waylaidwanderer/fetch-event-source';
import { Agent } from 'undici';
import * as conversions from './typeConversionUtil.js';
// import { isValidXML } from './typeConversionUtil.js';

const defaultParticipants = {
    user: {
        display: 'User',
        author: 'user',
        // transcript: 'user',
        // xml: 'user',
        defaultMessageType: 'message',
    },
    bot: {
        display: 'Assistant',
        author: 'assistant',
        // transcript: 'assistant',
        // xml: 'assistant',
        defaultMessageType: 'message',
    },
    system: {
        display: 'System',
        author: 'system',
        // transcript: 'system',
        // xml: 'system',
        defaultMessageType: 'message',
    },
};

export default class ChatClient {
    constructor(options, participants = {}) {
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

        this.setOptions(options);
        this.participants = defaultParticipants;
        this.setParticipants(participants);
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
    }

    setParticipants(participants) {
        this.participants = {
            ...this.participants,
            ...participants,
        };
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

    async sendMessage() {
        throw new Error('Not implemented');
    }

    async getCompletion(params, headers, onProgress, abortController, debug = false) {
        const modelOptions = {
            ...this.modelOptions,
            ...params,
            stream: true,

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
        const url = this.completionsUrl;

        // opts.headers['x-api-key'] = this.apiKey;
        // opts.headers['anthropic-version'] = '2023-06-01';
        // opts.headers['anthropic-beta'] = 'messages-2023-12-15';

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

    toBasicMessage(conversationMessage) {
        const author = this.convertAlias('display', 'author', conversationMessage.role);
        return {
            text: conversationMessage.message,
            author,
            type: conversationMessage.type || this.participants[author]?.defaultMessageType || 'message',
        };
    }

    toMessages(history) {
        switch (conversions.getDataType(history)) {
            case '[basicMessage]': return history;
            case 'transcript': return conversions.parseTranscript(history);
            case 'xml': return conversions.parseXml(history);
            case 'basicMessage': return [history];
            case 'conversationMessage': return [this.toBasicMessage(history)];
            case '[conversationMessage]': return history.map(message => this.toBasicMessage(message));
            case 'string': return [{ text: history, author: this.participants.user.author }];
            default:
                throw new Error('Invalid history data type'); // return null;
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
}

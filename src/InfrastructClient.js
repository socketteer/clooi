import crypto from 'crypto';
import { fetchEventSource } from '@waylaidwanderer/fetch-event-source';
import { Agent } from 'undici';

import ChatClient from './ChatClient.js';

import { getMessagesForConversation } from './conversation.js';

export default class InfrastructClient extends ChatClient {
    constructor(apiKey, options) {
        options.cache.namespace = options.cache.namespace || 'infrastruct';
        super(options, {
            bot: {
                display: 'Infrastruct',
                author: 'assistant',
                transcript: 'assistant',
                defaultMessageType: 'message',
            },
        });
        this.completionsUrl = 'https://api.openai.com/v1/completions';
        this.isChatGptModel = false;
        this.apiKey = apiKey;
        this.endToken = '';
        this.modelOptions = {
            // set some good defaults (check for undefined in some cases because they may be 0)
            model: 'gpt-4-base',
            temperature: 1,
            n: 1,
            stop: `\n\n[${this.participants.user.transcript}](#`,
            stream: true,
            max_tokens: 200,
        };
        this.setOptions(options);
    }

    setOptions(options) {
        super.setOptions(options);
        if (this.options.openaiApiKey) {
            this.apiKey = this.options.openaiApiKey;
        }
        const modelOptions = this.options.modelOptions || {};
        this.modelOptions = {
            ...this.modelOptions,
            ...modelOptions,
        };
    }

    async sendMessage(message, opts = {}) {
        if (opts.clientOptions && typeof opts.clientOptions === 'object') {
            this.setOptions(opts.clientOptions);
        }

        let {
            conversationId = null,
            parentMessageId,
            onProgress,
            systemMessage = null,
        } = opts;

        const {
            stopToken = null,
            // stopToken = `\n\n[${this.participants.user.transcript}](#${this.participants.user.defaultMessageType})`, //'`\n\n[',
        } = opts;


        if (typeof onProgress !== 'function') {
            onProgress = () => {};
        }

        if (conversationId === null) {
            conversationId = crypto.randomUUID();
        }

        const conversation = (await this.conversationsCache.get(conversationId)) || {
            messages: [],
            createdAt: Date.now(),
        };

        let previousCachedMessages = getMessagesForConversation(
            conversation.messages,
            parentMessageId,
        ).map(msg => this.toBasicMessage(msg));

        if (typeof systemMessage === 'string' && systemMessage.length) {
            systemMessage = {
                text: systemMessage,
                author: 'system',
                type: 'instructions',
            };
        } else if (!systemMessage) {
            systemMessage = null;
        }

        previousCachedMessages = [
            ...systemMessage ? [systemMessage] : [],
            ...previousCachedMessages,
        ];

        parentMessageId = parentMessageId || previousCachedMessages[conversation.messages.length - 1]?.id || crypto.randomUUID();
        let userMessage;
        let userConversationMessage;
        if (message) {
            userMessage = {
                author: this.participants.user.author,
                text: message,
            };
            userConversationMessage = this.createConversationMessage(
                userMessage,
                parentMessageId,
            );
            conversation.messages.push(userConversationMessage);
            previousCachedMessages.push(userMessage);

            await this.conversationsCache.set(conversationId, conversation);
        }

        let transcript = this.toTranscript(previousCachedMessages);

        transcript = `${transcript}\n\n[${this.participants.bot.transcript}](#${this.participants.bot.defaultMessageType})\n`;

        if (stopToken) {
            this.modelOptions.stop = stopToken;
        }


        let reply = '';
        let result = null;
        const replies = {};
        if (typeof opts.onProgress === 'function' && this.modelOptions.stream) {
            result = await this.getCompletion(
                transcript,
                (progressMessage) => {
                    if (progressMessage === '[DONE]') {
                        return;
                    }
                    const index = progressMessage.choices[0]?.index;
                    const token = this.isChatGptModel ? progressMessage.choices[0]?.delta.content : progressMessage.choices[0]?.text;
                    // console.log(progressMessage);
                    // first event's delta content is always undefined
                    if (!token) {
                        return;
                    }
                    if (this.options.debug) {
                        console.debug(token);
                    }
                    if (token === this.endToken) {
                        return;
                    }
                    if (index === 0) {
                        opts.onProgress(token);
                        reply += token;
                    }
                    if (index !== undefined) {
                        if (!replies[index]) {
                            replies[index] = '';
                        }
                        replies[index] += token;
                    }
                },
                opts.abortController || new AbortController(),
            );
        } else {
            result = await this.getCompletion(
                transcript,
                null,
                opts.abortController || new AbortController(),
            );
            if (this.options.debug) {
                console.debug(JSON.stringify(result));
            }
            if (this.isChatGptModel) {
                reply = result.choices[0].message.content;
            } else {
                reply = result.choices[0].text.replace(this.endToken, '');
            }
            Array.from(result.choices).forEach((choice, index) => {
                replies[index] = this.isChatGptModel ? choice.message.content : choice.text;
            });
        }

        // avoids some rendering issues when using the CLI app
        if (this.options.debug) {
            console.debug();
        }

        // console.debug(JSON.stringify(result));

        reply = reply.trim();

        parentMessageId = userConversationMessage ? userConversationMessage.id : parentMessageId;
        
        // create messages for each reply
        const newMessages = [];
        for (const [index, text] of Object.entries(replies)) {
            const replyMessage = {
                id: crypto.randomUUID(),
                parentMessageId,
                role: this.participants.bot.display,
                message: text,
            };
            newMessages.push(replyMessage);
        }

        conversation.messages.push(...newMessages);

        const botConversationMessage = newMessages[0];

        await this.conversationsCache.set(conversationId, conversation);

        return {
            conversationId,
            parentId: botConversationMessage.parentMessageId,
            messageId: botConversationMessage.id,
            messages: conversation.messages,
            transcript,
            response: reply,
            details: result,
            replies: Object.values(replies),
        };
    }

    async getCompletion(prompt, onProgress, abortController = null) {
        const debug = false;
        const modelOptions = {
            ...this.modelOptions,
            prompt,
        };
        const opts = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(modelOptions),
            dispatcher: new Agent({
                bodyTimeout: 0,
                headersTimeout: 0,
            }),
        };
        const url = this.completionsUrl;

        opts.headers.Authorization = `Bearer ${this.apiKey}`;

        if (modelOptions.stream) {
            // eslint-disable-next-line no-async-promise-executor
            return new Promise(async (resolve, reject) => {
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
                        },
                        onclose() {
                            if (debug) {
                                console.debug('Server closed the connection unexpectedly, returning...');
                            }
                            // workaround for private API not sending [DONE] event
                            if (!done) {
                                onProgress('[DONE]');
                                abortController.abort();
                                resolve();
                            }
                        },
                        onerror(err) {
                            if (debug) {
                                console.debug(err);
                            }
                            // rethrow to stop the operation
                            throw err;
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
                                abortController.abort();
                                resolve();
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
        // let data = await response.json();
        // console.log(await response.clone().json());
        return response.json();
    }
}

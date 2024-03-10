
import ChatClient from './ChatClient.js';

import { getMessagesForConversation } from './conversation.js';

export default class ClaudeClient extends ChatClient {
    constructor(apiKey, options) {
        options.cache.namespace = options.cache.namespace || 'claude';
        super(options, {
            bot: {
                display: 'Claude',
                author: 'assistant',
                transcript: 'assistant',
                defaultMessageType: 'message',
            },
        });
        this.apiKey = apiKey;
        this.completionsUrl = 'https://api.anthropic.com/v1/messages';
        this.modelOptions = {
            // set some good defaults (check for undefined in some cases because they may be 0)
            model: 'claude-3-opus-20240229',
            max_tokens: 1024,
            temperature: 1,
            stream: true,
        };


        // const anthropic = require('@anthropic-ai/sdk');

        // const client = new anthropic.Client({
        //     apiKey: this.apiKey,
        // });

        this.setOptions(options);
    }


    setOptions(options) {
        super.setOptions(options);
        if (this.options.openaiApiKey) {
            this.apiKey = this.options.anthropicApiKey;
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
        } = opts;

        const {
            systemMessage = null,
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

        const previousCachedMessages = getMessagesForConversation(
            conversation.messages,
            parentMessageId,
        ).map(msg => this.toBasicMessage(msg));

        parentMessageId = parentMessageId || previousCachedMessages[conversation.messages.length - 1]?.id || crypto.randomUUID();
        let userMessage;
        let userConversationMessage;

        if (message) {
            if (typeof message === 'string') {
                userMessage = {
                    role: 'user',
                    content: message,
                };
            } else {
                userMessage = message;
            }

            userConversationMessage = {
                id: crypto.randomUUID(),
                parentMessageId,
                role: 'User',
                message: userMessage.content,
            };

            conversation.messages.push(userConversationMessage);
            previousCachedMessages.push(userMessage);

            await this.conversationsCache.set(conversationId, conversation);
        }

        const params = {
            messages: previousCachedMessages,
            system: systemMessage,
        };
        const headers = {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'messages-2023-12-15',
        };

        let reply = '';
        let result = null;
        if (typeof opts.onProgress === 'function' && this.modelOptions.stream) {
            await this.getCompletion(
                params,
                headers,
                (progressMessage) => {
                    if (progressMessage === '[DONE]') {
                        return;
                    }
                    if (progressMessage.type === 'message_start') {
                        return;
                    }
                    if (progressMessage.type === 'message_end') {
                        return;
                    }
                    if (progressMessage.type === 'content_block_start') {
                        return;
                    }
                    if (progressMessage.type === 'content_block_delta') {
                        opts.onProgress(progressMessage.delta.text);
                        reply += progressMessage.delta.text;
                    } else {
                        console.debug(progressMessage);
                    }
                },
                opts.abortController || new AbortController(),
            );
        } else {
            result = await this.getCompletion(
                params,
                null,
                opts.abortController || new AbortController(),
            );
            if (this.options.debug) {
                console.debug(JSON.stringify(result));
            }
            reply = result.choices[0].message.content;
        }

        // console.log(reply);


        parentMessageId = userConversationMessage ? userConversationMessage.id : parentMessageId;

        const replyMessage = {
            id: crypto.randomUUID(),
            parentMessageId,
            role: this.participants.bot.display,
            message: reply,
        };

        conversation.messages.push(replyMessage);

        await this.conversationsCache.set(conversationId, conversation);

        return {
            conversationId,
            parentId: replyMessage.parentMessageId,
            messageId: replyMessage.id,
            // messages: conversation.messages,
            response: reply,
            details: result || null,
        };
    }

    toBasicMessage(conversationMessage) {
        const role = this.convertAlias('display', 'author', conversationMessage.role);
        return {
            content: conversationMessage.message,
            role,
        };
    }
}

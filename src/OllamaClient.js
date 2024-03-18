
import ChatClient from './ChatClient.js';

import crypto from 'crypto';

import { getMessagesForConversation } from './conversation.js';

export default class OllamaClient extends ChatClient {
    constructor(options) {
        options.cache.namespace = options.cache.namespace || 'ollama';
        super(options, {
            bot: {
                display: 'Ollama',
                author: 'assistant',
                transcript: 'assistant',
                defaultMessageType: 'message',
            },
        });
        this.completionsUrl = 'http://127.0.0.1:11434/api/chat';
        this.modelOptions = {
            // set some good defaults (check for undefined in some cases because they may be 0)
            model: 'OpenHermes-2.5:Q5_K_M',
            options: {
                //see PARAMS in ollama Modelfile docs
                num_ctx: 4096,
                temperature: 1,
                // template should be defined in the ollama Modelfile
            },
            // system param is not present in chat endpoint...
            stream: true,
        };
        this.setOptions(options);
    }

    setOptions(options) {
        super.setOptions(options);
        //api key
        const modelOptions = this.options.modelOptions || {};
        this.modelOptions = {
            ...this.modelOptions,
            ...modelOptions,
        };
    }

    async getCompletionStream(params, onProgress, abortController, debug = false) {
        const url = this.completionsUrl;
        const opts = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...params,
            ...this.modelOptions,
        }),
          signal: abortController.signal,
        };
      
        try {
          const response = await fetch(url, opts);
          const reader = response.body.getReader();
          let done = false;
          let reply = '';
      
          while (!done) {
            const { value, done: readerDone } = await reader.read();
            if (readerDone) {
              done = true;
            } else {
              const chunk = new TextDecoder().decode(value);
              // console.log('Received chunk:', chunk);
              const lines = chunk.split('\n');
      
              for (const line of lines) {
                if (line.trim() === '') {
                  continue;
                }

                // console.log('Processing line:', line);
      
                const data = JSON.parse(line);
                if (data.done) {
                  done = true;
                } else if (data.message) {
                  onProgress(data.message.content);
                  reply += data.message.content;
                }
              }
            }
          }
      
          return {
            message: {
              content: reply,
            },
          };
        } catch (error) {
          console.error('Error in getCompletionStream:', error);
          throw error;
        }
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

        const preparedMessages = this.addSystemMessage(previousCachedMessages, systemMessage);


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
            // previousCachedMessages.push(userMessage);
            preparedMessages.push(userMessage);

            await this.conversationsCache.set(conversationId, conversation);
        }

        const params = {
            // messages: previousCachedMessages,
            messages: preparedMessages,
            // system: systemMessage,
        };

        let reply = '';
        let result = null;
        if (typeof opts.onProgress === 'function' && this.modelOptions.stream) {
            result = await this.getCompletionStream(
            params,
            (progressMessage) => {
              opts.onProgress(progressMessage);
              reply += progressMessage;
            },
            opts.abortController || new AbortController(),
          );
        } else {
            result = await this.getCompletionStream(
                params,
                null,
                opts.abortController || new AbortController(),
            );
            if (this.options.debug) {
                // console.debug(JSON.stringify(result));
            }
            reply = result.message.content;
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

    toTranscriptMessage(message) {
        const name = this.convertAlias('author', 'transcript', message.role);
        const messageType = message.type || this.participants[message.author]?.defaultMessageType || 'message';
        return `[${name}](#${messageType})\n${message.content}`;
    }

    addSystemMessage(messages, systemMessage) {
      if (messages.length === 0 && systemMessage) {
          messages.unshift({
              role: 'system',
              content: systemMessage,
          });
      }
      return messages;
  }
}

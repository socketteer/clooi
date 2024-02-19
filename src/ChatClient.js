import Keyv from 'keyv';

const defaultParticipants = {
    user: {
        display: 'User',
        author: 'user',
        transcript: 'user',
        defaultMessageType: 'message',
    },
    bot: {
        display: 'Assistant',
        author: 'bot',
        transcript: 'assistant',
        defaultMessageType: 'message',
    },
    system: {
        display: 'System',
        author: 'system',
        transcript: 'system',
        defaultMessageType: 'additional_instructions',
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

    async addMessages(conversationId, messages, parentMessageId = null) {
        if (!conversationId) {
            conversationId = crypto.randomUUID();
        }

        const conversation = (await this.conversationsCache.get(conversationId)) || {
            messages: [],
            createdAt: Date.now(),
        };

        parentMessageId = conversation.messages[conversation.messages.length - 1]?.id || crypto.randomUUID();
        // const conversation = await this.conversationsCache.get(conversationId);
        // if messages is a string, parse it
        // if (typeof messages === 'string') {
        //     messages = this.parseHistoryString(messages);
        // }
        switch (this.getDataType(messages)) {
            case 'messageHistory':
                messages = this.parseHistoryString(messages);
                break;
            case 'string':
                messages = [{ text: messages, author: this.participants.user.author}];
                break;
            case '[basicMessage]':
                break;
            default:
                throw new Error('Invalid message data type');
        }
        // create new conversation messages
        const newConversationMessages = this.createConversationMessages(
            messages,
            parentMessageId,
        );
        conversation.messages = conversation.messages.concat(newConversationMessages);
        await this.conversationsCache.set(conversationId, conversation);
        return {
            jailbreakConversationId: conversationId,
            messageId: conversation.messages[conversation.messages.length - 1].id,
            messages: conversation.messages,
        };
    }

    toBasicMessage(conversationMessage) {
        const author = this.convertAlias('display', 'author', conversationMessage.role);
        return {
            text: conversationMessage.message,
            author,
            type: conversationMessage.type || this.participants[author].defaultMessageType || 'message',
        };
    }

    toTranscriptMessage(message) {
        const name = this.convertAlias('author', 'transcript', message.author);
        const messageType = message.type || this.participants[message.author].defaultMessageType || 'message';
        return `[${name}](#${messageType})\n${message.text}`;
    }

    toTranscript(messageHistory) {
        // if (!('author' in messageHistory[0])) {
        //     messageHistory = messageHistory.map(
        //         message => this.toBasicMessage(message),
        //     );
        // }
        switch (this.getDataType(messageHistory)) {
            case 'messageHistory':
                return messageHistory;
            case 'basicMessage':
                return this.toTranscriptMessage(messageHistory);
            case 'conversationMessage':
                return this.toTranscriptMessage(this.toBasicMessage(messageHistory));
            case '[basicMessage]':
                break;
            case '[conversationMessage]':
                messageHistory = messageHistory.map(
                    message => this.toBasicMessage(message),
                );
                break;
            case 'string':
                return messageHistory;
            default:
                return '';
        }
        return messageHistory?.map(msg => this.toTranscriptMessage(msg)).join('\n\n');
    }

    parseHistoryString(historyString) {
        // header format is '[${author}](#{messageType})'
        const headerRegex = /\[.+?\]\(#.+?\)/g;
        const authorRegex = /\[(.+?)]/;
        const messageTypeRegex = /\(#(.+?)\)/;
        let match;
        const messages = [];
        const headerStartIndices = [];
        const headers = [];
        while ((match = headerRegex.exec(historyString))) {
            headerStartIndices.push(match.index);
            headers.push(match[0]);
        }
        for (let i = 0; i < headerStartIndices.length; i++) {
            const start = headerStartIndices[i];
            const messageStart = start + headers[i].length;
            const messageEnd = headerStartIndices[i + 1] || historyString.length;
            const messageText = historyString
                .substring(messageStart, messageEnd)
                .trim();
            const authorString = authorRegex.exec(headers[i])[1];
            const messageTypeString = messageTypeRegex.exec(headers[i])[1];
            const author = this.convertAlias('transcript', 'author', authorString);

            messages.push({
                author,
                text: messageText,
                type: messageTypeString,
            });
        }

        return messages;
    }

    createConversationMessage(message, parentMessageId) {
        const role = this.convertAlias('author', 'display', message.author);
        return {
            id: crypto.randomUUID(),
            parentMessageId,
            role,
            message: message.text,
            ...(message.details ? { details: message.details } : {}),
        };
    }

    createConversationMessages(orderedMessages, rootMessageId) {
        const conversationMessages = [];
        let parentMessageId = rootMessageId;
        for (const message of orderedMessages) {
            const conversationMessage = this.createConversationMessage(
                message,
                parentMessageId,
            );
            conversationMessages.push(conversationMessage);
            parentMessageId = conversationMessage.id;
        }
        return conversationMessages;
    }

    getDataType(data) {
        if (data === null) {
            return 'null';
        }
        if (typeof data === 'string') {
            const parsedString = this.parseHistoryString(data);
            if (parsedString.length) {
                return 'messageHistory';
            }
            return 'string';
        } if (Array.isArray(data)) {
            if (data.length === 0) {
                return '[]';
            }
            return `[${this.getDataType(data[0])}]`;
        } if (typeof data === 'object') {
            if ('author' in data) {
                return 'basicMessage';
            }
            if ('message' in data) {
                return 'conversationMessage';
            }
            return 'unknown';
        }
        return 'unknown';
    }
}

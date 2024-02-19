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

    getHistoryString(messageHistory) {
        if (!('author' in messageHistory[0])) {
            messageHistory = messageHistory.map(
                message => this.toBasicMessage(message),
            );
        }
        return messageHistory?.map(msg => this.toTranscriptMessage(msg)).join('\n\n');
    }

    parseHistoryString(historyString) {
        // header format is '[${author}](#{messageType})'
        const headerRegex = /\[.+?\]\(#.+?\)/g;
        const authorRegex = /\[(.+?)]/;
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
            const author = this.convertAlias('transcript', 'author', authorString);

            messages.push({
                author,
                text: messageText,
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
}

import ChatClient from './ChatClient.js';
import { getMessagesForConversation, getChildren, getParent } from './conversation.js';

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
    'claude-3-5-sonnet-20240620': {
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
        let anthropicBeta;
        if ('steering' in this.options && this.options.steering) {
            anthropicBeta = 'steering-2024-06-04';
        } else if (this.options?.cacheOptions?.enabled || this.cache?.enabled) {
            anthropicBeta = 'prompt-caching-2024-07-31';
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
            replies[idx] = res.content[0].text;
        });
    }

    buildApiParams(userMessage = null, previousMessages = [], systemMessage = null) {
       const { messages: history, system } = super.buildApiParams(userMessage, previousMessages, systemMessage);
       const mergedMessageHistory = [];
       let lastMessage = null;
       const cacheEnabled = this.options?.cacheOptions?.enabled || this.cache?.enabled || false;
       const MAX_CACHE_BLOCKS = 4;
       
       // Check if we're at a point where conversation branches into multiple paths
       const currentBranch = getMessagesForConversation(previousMessages, userMessage?.parentMessageId);
       const isBranchingPoint = previousMessages.length > 0 && 
           getChildren(previousMessages, previousMessages[previousMessages.length - 1].id).length > 1;

       // Find last two points where conversation branched into multiple paths
       const branchPoints = [];
       let messageId = userMessage?.parentMessageId;
       while (messageId && branchPoints.length < 2) {
           if (getChildren(previousMessages, messageId).length > 1) {
               branchPoints.push(messageId);
           }
           messageId = getParent(previousMessages, messageId)?.id;
       }

       // Determine if current message should be a cache checkpoint
       const shouldCacheMessage = (message, index) => {
           if (!cacheEnabled) return false;

           if (branchPoints.includes(message.id)) return true;
           if (isBranchingPoint && index === mergedMessageHistory.length - 1) return true;

           const usedCacheBlocks = branchPoints.length + (isBranchingPoint ? 1 : 0);
           const remainingBlocks = MAX_CACHE_BLOCKS - usedCacheBlocks;
           if (remainingBlocks > 0) {
               return currentBranch.length >= 10 && currentBranch.length % 10 === 0;
           }

           return false;
       };

       for (const [index, message] of history.entries()) {
           if (lastMessage && lastMessage.role === message.role) {
               const lastContent = lastMessage.content[lastMessage.content.length - 1];
               lastContent.text += message.content;
           } else {
               const messageContent = {
                   type: 'text',
                   text: message.content,
                   ...(shouldCacheMessage(message, index) && { cache_control: { type: 'ephemeral' } })
               };

               const messageWithOptionalCache = {
                   role: message.role,
                   content: [messageContent]
               };

               lastMessage = messageWithOptionalCache;
               mergedMessageHistory.push(messageWithOptionalCache);
           }
       }

       // Add system message to cache if present
       const systemWithCache = system ? [{
           type: 'text',
           text: system,
           ...(cacheEnabled && { cache_control: { type: 'ephemeral' } })
       }] : undefined;

       return {
           messages: mergedMessageHistory,
           ...(systemWithCache ? { system: systemWithCache } : {})
       };
    }
}

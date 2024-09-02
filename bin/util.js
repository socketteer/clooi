import ChatGPTClient from '../src/ChatGPTClient.js';
import BingAIClient from '../src/BingAIClient.js';
import InfrastructClient from '../src/InfrastructClient.js';
import ClaudeClient from '../src/ClaudeClient.js';
import OllamaClient from '../src/OllamaClient.js';
import OpenRouterClient from '../src/OpenRouterClient.js';

const settings = {
    clientToUse: {
        type: 'select',
        options: [
            { 
                value: "bing",
                description: "Copilot 'API'",
            },
            {
                value: 'infrastruct',
                description: 'OpenAI completions API',
            },
            {
                value: 'chatgpt',
                description: 'OpenAI chat API',
            },
            {
                value: 'claude',
                description: 'Anthropic API',
            },
            // {
            //     value: 'ollama',
            // },
            {
                value: 'openrouter',
                description: 'OpenRouter API',
            }
        ],
        default: 'claude',
        description: 'API client to use',
    },
    namespace: {
        type: 'string',
        default: null,
        description: 'Namespace for cache. Defaults to name of API client.',
    },
    stream: {
        type: 'boolean',
        default: true,
        description: 'Stream responses from API.',
        advanced: true,
    },
    n: {
        type: 'int',
        default: 3,
        description: 'Number of responses to generate in parallel.',
    },
    systemMessage: {
        type: 'long string',
        default: '',
        description: 'System prompt which appears at beginning of conversation.',
    },
    temperature: {
        type: 'float',
        default: 1.0,
        description: 'Temperature for sampling responses.',
        validFor: ['chatgpt', 'claude', 'infrastruct'],
    },
    max_tokens: {
        type: 'int',
        default: 4096,
        description: 'Maximum tokens to generate at once.',
        validFor: ['chatgpt', 'claude', 'infrastruct'],
    },
    model: {
        type: 'string',
        default: 'claude-3-5-sonnet-20240620',
        description: 'Model to use for generation.',
        validFor: ['chatgpt', 'claude', 'infrastruct'],
    },
    apiKey: {
        type: 'string',
        description: 'API key',
        validFor: ['chatgpt', 'claude', 'infrastruct'],
    },
    completionsUrl: {
        type: 'string',
        description: 'API endpoint URL',
        validFor: ['chatgpt', 'claude', 'infrastruct'],
        advanced: true,
    },
    showSuggestions: {
        type: 'boolean',
        default: true,
        description: 'Show user suggestions after AI messages.',
        validFor: ['bing'],
    },
    showSearches: {
        type: 'boolean',
        default: false,
        description: 'Show details of searches performed by AI.',
        validFor: ['bing'],
        advanced: true,
    },
    toneStyle: {
        type: 'select',
        options: [
            { value: 'creative', description: 'Creative GPT-4, aka Sydney' },
            { value: 'precise', description: 'Precise' },
            { value: 'balanced', description: 'Balanced' },
            { value: 'fast', description: 'Fast' },
        ],
        default: 'creative',
        description: 'Which Copilot model to use',
        validFor: ['bing'],
    },
    city: {
        type: 'string',
        default: 'between words',
        description: "string to inject into the city field of the location string that appears in Copilot's prompt if no dynamic content is injected there",
        validFor: ['bing'],
        advanced: true,
    },
    country: {
        type: 'string',
        default: 'United States',
        description: "string to inject into the country field of the location string that appears in Copilot's prompt if no dynamic content is injected there",
        validFor: ['bing'],
        advanced: true,
    },
    messageText: {
        type: 'string',
        default: 'Continue the conversation in context. Assistant:',
        description: "default content of mandatory user message if nothing else is put there",
        validFor: ['bing'],
        advanced: true,
    },
    systemInjectSite: {
        type: 'select',
        options: [
            { value: 'location', description: 'user location string' },
            { value: 'context', description: 'web page context' },
        ],
        default: 'location',
        description: 'Where in the prompt to inject the system message',
        validFor: ['bing'],
        advanced: true,
    },
    historyInjectSite: {
        type: 'select',
        options: [
            { value: 'location', description: 'user location string' },
            { value: 'context', description: 'web page context' },
        ],
        default: 'location',
        description: 'Where in the prompt to inject the previous messages of the conversation',
        validFor: ['bing'],
        advanced: true,
    },
    messageInjectSite: {
        type: 'select',
        options: [
            { value: 'message', description: 'user message' },
            { value: 'context', description: 'web page context' },
            { value: 'location', description: 'user location string' },
        ],
        default: 'message',
        description: 'Where in the prompt to inject the new user message',
        validFor: ['bing'],
        advanced: true,
    },
    censorMessageInjection: {
        type: 'string',
        default: '⚠',
        description: "String to append to Copilot's messages if they get censored",
        validFor: ['bing'],
        advanced: true,
    },
    stopToken: {
        type: 'string',
        default: '\n\n[user](#message)',
        description: '',
        validFor: ['bing'],
        advanced: true,
    },
    context: {
        type: 'long string',
        default: null,
        description: 'String to inject into the web page context',
        validFor: ['bing'],
        advanced: true,
    },
}

export function getClientSettings(clientToUse, settings) {
    let clientOptions;
    switch (clientToUse) {
        case 'bing':
            clientOptions = {
                ...settings.bingAiClient,
                ...settings.cliOptions.bingOptions,
            };
            break;
        case 'infrastruct':
            clientOptions = {
                ...settings.infrastructClient,
                ...settings.cliOptions.infrastructOptions,
            };
            break;
        case 'claude':
            clientOptions = {
                ...settings.claudeClient,
                ...settings.cliOptions.claudeOptions,
            };
            break;
        case 'ollama':
            clientOptions = {
                ...settings.ollamaClient,
                ...settings.cliOptions.ollamaOptions,
            };
            break;
        case 'chatgpt':
            clientOptions = {
                ...settings.chatGptClient,
                ...settings.cliOptions.chatGptOptions,
            };
            break;
        case 'openrouter':
            clientOptions = {
                ...settings.openRouterClient,
                ...settings.cliOptions.openRouterOptions,
            };
            break;
        default:
            throw new Error('Invalid clientToUse setting.');
    }
    return clientOptions;

}

export function getClient(clientToUse, settings) {
    let clientOptions = {
        ... getClientSettings(clientToUse, settings),
        cache: settings.cacheOptions,
    };
    let client;
    switch (clientToUse) {
        case 'bing': client = new BingAIClient(clientOptions); break;
        case 'infrastruct': client = new InfrastructClient(clientOptions); break;
        case 'claude': client = new ClaudeClient(clientOptions); break;
        case 'ollama': client = new OllamaClient(clientOptions); break;
        case 'chatgpt': client = new ChatGPTClient(clientOptions); break;
        case 'openrouter': client = new OpenRouterClient(clientOptions); break;
        default: throw new Error('Invalid clientToUse setting.');
    }
    return client;
}
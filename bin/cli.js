#!/usr/bin/env node
import fs from 'fs';
import { pathToFileURL } from 'url';
import { KeyvFile } from 'keyv-file';
import boxen from 'boxen';
import ora from 'ora';
import clipboard from 'clipboardy';
import inquirer from 'inquirer';
import inquirerAutocompletePrompt from 'inquirer-autocomplete-prompt';
import ChatGPTClient from '../src/ChatGPTClient.js';
import BingAIClient from '../src/BingAIClient.js';
import {
    getMessagesForConversation,
    getChildren,
    getSiblings,
    getSiblingIndex,
} from '../src/conversation.js';

const arg = process.argv.find(_arg => _arg.startsWith('--settings'));
const path = arg?.split('=')[1] ?? './settings.js';

let settings;

let conversationData = {};
let responseData = {};
let clientToUse;
let client;

async function loadSettings() {
    // TODO dynamic import isn't updating the settings file
    if (fs.existsSync(path)) {
        // get the full path
        const fullPath = fs.realpathSync(path);
        settings = (await import(pathToFileURL(fullPath).toString())).default;
        // console.log('Loaded settings from', fullPath);
        // console.log(settings);
    } else {
        if (arg) {
            console.error('Error: the file specified by the --settings parameter does not exist.');
        } else {
            console.error('Error: the settings.js file does not exist.');
        }
        process.exit(1);
    }

    if (settings.storageFilePath && !settings.cacheOptions.store) {
        // make the directory and file if they don't exist
        const dir = settings.storageFilePath.split('/').slice(0, -1).join('/');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(settings.storageFilePath)) {
            fs.writeFileSync(settings.storageFilePath, '');
        }

        settings.cacheOptions.store = new KeyvFile({ filename: settings.storageFilePath });
    }

    // Disable the image generation in cli mode always.
    settings.bingAiClient.features = settings.bingAiClient.features || {};
    settings.bingAiClient.features.genImage = false;

    conversationData = settings.cliOptions?.conversationData || settings.conversationData || {};
    responseData = {};
    clientToUse = settings.cliOptions?.clientToUse || settings.clientToUse || 'bing';

    switch (clientToUse) {
        case 'bing':
            client = new BingAIClient({
                ...settings.bingAiClient,
                cache: settings.cacheOptions,
            });
            break;
        default:
            client = new ChatGPTClient(
                settings.openaiApiKey || settings.chatGptClient.openaiApiKey,
                settings.chatGptClient,
                settings.cacheOptions,
            );
            break;
    }
    if (clientToUse === 'bing') {
        console.log(tryBoxen('Welcome to the Bingleton Backrooms CLooI', {
            title: '😊', padding: 0.7, margin: 1, titleAlignment: 'center', borderStyle: 'arrow', borderColor: 'gray',
        }));
    } else {
        console.log(tryBoxen(`${getAILabel()} CLooI`, {
            padding: 0.7, margin: 1, borderStyle: 'double', dimBorder: true,
        }));
    }
    return conversation();
}

async function hasChildren() {
    if (!conversationData.parentMessageId) {
        return false;
    }
    const messages = await conversationMessages();
    return getChildren(messages, conversationData.parentMessageId).length > 0;
}

async function hasSiblings() {
    if (!conversationData.parentMessageId) {
        return false;
    }
    const messages = await conversationMessages();
    return getSiblings(messages, conversationData.parentMessageId).length > 1;
}

let availableCommands = [
    {
        name: '!editor - Open the editor (for multi-line messages)',
        value: '!editor',
    },
    {
        name: '!resume - Resume last conversation',
        value: '!resume',
        available: async () => {
            const lastConversation = await client.conversationsCache.get('lastConversation');
            return Boolean(lastConversation);
        },
    },
    {
        name: '!new - Start new conversation',
        value: '!new',
    },
    {
        name: '!gen - Generate a response',
        value: '!gen',
    },
    {
        name: '!retry - Regenerate the last response',
        value: '!retry',
        available: async () => Boolean(conversationData.parentMessageId),
    },
    {
        name: '!add - Add messages to the conversation',
        value: '!add',
    },
    {
        name: '!rewind - Rewind conversation to a previous message',
        value: '!rewind',
        available: async () => Boolean(conversationData.parentMessageId),
    },
    {
        name: '!child - Navigate to a child message',
        value: '!child',
        available: hasChildren,
    },
    {
        name: '!alt - Navigate to an alternate message',
        value: '!alt',
        available: hasSiblings,
    },
    {
        name: '!up - Navigate to the parent message',
        value: '!up',
        available: async () => Boolean(conversationData.parentMessageId),
    },
    {
        name: '!down - Navigate to the first child message',
        value: '!down',
        available: hasChildren,
    },
    {
        name: '!right - Navigate to the next sibling message',
        value: '!right',
        available: hasSiblings,
    },
    {
        name: '!left - Navigate to the previous sibling message',
        value: '!left',
        available: hasSiblings,
    },
    {
        name: '!copy - Copy data to clipboard',
        value: '!copy',
    },
    {
        name: '!print - Print data to console',
        value: '!print',
    },
    {
        name: '!history - Print conversation history',
        value: '!history',
        available: async () => Boolean(conversationData.parentMessageId),
    },
    {
        name: '!save - Save conversation state',
        value: '!save',
    },
    {
        name: '!load - Load conversation state',
        value: '!load',
    },
    {
        name: '!open - Load a saved conversation by id',
        value: '!open',
    },
    {
        name: '!reload - Reload default settings',
        value: '!reload',
    },
    {
        name: '!set - Set a conversation data property',
        value: '!set',
    },
    {
        name: '!delete-all - Delete all conversations',
        value: '!delete-all',
        available: async () => clientToUse === 'chatgpt',
    },
    {
        name: '!exit - Exit CLooI',
        value: '!exit',
    },
    {
        name: '!debug - Debug',
        value: '!debug',
    },
];

inquirer.registerPrompt('autocomplete', inquirerAutocompletePrompt);

await loadSettings();

// await conversation();

async function conversation() {
    console.log('Type "!" to access the command menu.');
    const prompt = inquirer.prompt([
        {
            type: 'autocomplete',
            name: 'message',
            message: 'Write a message:',
            searchText: '​',
            emptyText: '​',
            suggestOnly: true,
            source: () => Promise.resolve([]),
        },
    ]);
    // hiding the ugly autocomplete hint
    prompt.ui.activePrompt.firstRender = false;
    // The below is a hack to allow selecting items from the autocomplete menu while also being able to submit messages.
    // This basically simulates a hybrid between having `suggestOnly: false` and `suggestOnly: true`.
    await new Promise(resolve => setTimeout(resolve, 0));

    prompt.ui.activePrompt.opt.source = async (answers, input) => {
        if (!input) {
            return [];
        }
        prompt.ui.activePrompt.opt.suggestOnly = !input.startsWith('!') || input.split(' ').length > 1;

        availableCommands = await Promise.all(availableCommands.map(async command => ({
            ...command,
            isAvailable: command.available ? await command.available() : true,
        })));
        return availableCommands.filter(command => command.isAvailable && command.value.startsWith(input));
    };
    let { message } = await prompt;
    console.log(message);
    message = message.trim();
    if (!message) {
        return conversation();
    }
    const messages = await conversationMessages();

    if (message.startsWith('!')) {
        const args = message.split(' ');
        if (args.length > 1) {
            switch (args[0]) {
                case '!rewind':
                    return rewindTo(parseInt(args[1], 10));
                case '!load':
                    return loadSavedState(args[1]);
                case '!open':
                    return loadConversation(args[1]);
                case '!save':
                    return saveConversationState(args[1]);
                case '!child':
                    return selectChildMessage(parseInt(args[1], 10));
                case '!add':
                    return addMessages(args.slice(1).join(' '));
                case '!alt':
                    return selectSiblingMessage(parseInt(args[1], 10));
                case '!print':
                    return printOrCopyData('print', args[1]);
                case '!copy':
                    return printOrCopyData('copy', args[1]);
                case '!set':
                    return setConversationData(args[1], args.slice(2).join(' '));
                default:
                    return conversation();
            }
        }
        switch (message) {
            case '!editor':
                return useEditor();
            case '!resume':
                return loadConversationState();
            case '!new':
                return newConversation();
            case '!gen':
                return onMessage('');
            case '!retry':
                return retryResponse();
            case '!add':
                return addMessages();
            case '!rewind':
                return rewindPrompt();
            case '!child':
                return selectChildMessage();
            case '!alt':
                return selectSiblingMessage();
            case '!up':
                return rewindTo(-1);
            case '!down':
                return selectChildMessage(0);
            case '!right':
                return selectSiblingMessage(getSiblingIndex(messages, conversationData.parentMessageId) + 1);
            case '!left':
                return selectSiblingMessage(getSiblingIndex(messages, conversationData.parentMessageId) - 1);
            case '!copy':
                return printOrCopyData('copy');// return copyConversation();
            case '!print':
                return printOrCopyData('print');
            case '!history':
                return showHistory();
            case '!save':
                return saveConversationState();
            case '!load':
                return loadSavedState();
            case '!reload':
                return loadSettings();
            case '!set':
                return setConversationData();
            case '!delete-all':
                return deleteAllConversations();
            case '!exit':
                return true;
            case '!debug':
                return debug();
            default:
                return conversation();
        }
    }
    return onMessage(message);
}

async function onMessage(message) {
    // await printHistory();
    if (message) {
        console.log(userMessageBox(message));
    }
    const aiLabel = getAILabel();
    let reply = '';
    const spinnerPrefix = `${aiLabel} is typing...`;
    const spinner = ora(spinnerPrefix);
    spinner.prefixText = '\n   ';
    spinner.start();
    try {
        if (clientToUse === 'bing' && !conversationData.jailbreakConversationId) {
            // activate jailbreak mode for Bing
            conversationData.jailbreakConversationId = true;
        }
        const controller = new AbortController();
        // abort on ctrl+c
        process.on('SIGINT', () => {
            controller.abort();
            // process.exit(0);
        });

        const eventLog = [];
        const response = await client.sendMessage(message, {
            ...conversationData,
            abortController: controller,
            onProgress: (token, data) => {
                // reply += '#';
                reply += token;
                const output = aiMessageBox(reply.trim());
                spinner.text = `${spinnerPrefix}\n${output}`;
                eventLog.push(data);
                responseData = {
                    response: reply,
                    eventLog,
                };
            },
        });
        responseData = {
            response,
            eventLog,
        };
        let responseText;
        switch (clientToUse) {
            case 'bing':
                responseText = response.details.adaptiveCards?.[0]?.body?.[0]?.text?.trim() || response.response;
                break;
            default:
                responseText = response.response;
                break;
        }
        clipboard.write(responseText).then(() => {}).catch(() => {});
        spinner.stop();
        switch (clientToUse) {
            case 'bing':
                conversationData = {
                    ...conversationData,
                    parentMessageId: response.messageId,
                    jailbreakConversationId: response.jailbreakConversationId,
                };
                break;
            default:
                conversationData = {
                    ...conversationData,
                    conversationId: response.conversationId,
                    parentMessageId: response.messageId,
                };
                break;
        }
        await client.conversationsCache.set('lastConversation', conversationData);
        const boxes = await historyBoxes();
        let suggestions = '';
        if (clientToUse === 'bing' && settings.cliOptions?.showSuggestions) {
            const suggestedUserMessages = client.constructor.getUserSuggestions(response);
            if (suggestedUserMessages && suggestedUserMessages.length > 0) {
                suggestions = `\n${suggestionsBoxes(suggestedUserMessages)}`;
            }
        }
        console.log(`${boxes}${suggestions}`);
    } catch (error) {
        spinner.stop();
        logError(error?.json?.error?.message || error.body || error || 'Unknown error');
        // TODO add user message and partial AI message
    }
    return conversation();
}

async function retryResponse() {
    if (!conversationData.parentMessageId) {
        logWarning('No message to rewind to.');
        return conversation();
    }
    const currentMessage = await getCurrentMessage();
    if (!currentMessage) {
        logWarning('Current message not found.');
        return conversation();
    }
    conversationData.parentMessageId = currentMessage.parentMessageId;
    logSuccess(`Rewound conversation to message ${conversationData.parentMessageId}.`);
    const boxes = await historyBoxes();
    if (boxes) {
        console.log(boxes);
    }
    return onMessage('');
}

async function rewindTo(index) {
    const messageHistory = await getHistory();
    if (!messageHistory) {
        return conversation();
    }
    if (index < 0) {
        index -= 1;
    }
    const conversationMessage = messageHistory.slice(index)[0];
    if (!conversationMessage) {
        logWarning('Message not found.');
        return conversation();
    }
    return selectMessage(conversationMessage.id);
}

async function rewindPrompt() {
    const messageHistory = await getHistory();
    if (!messageHistory || messageHistory.length < 2) {
        return conversation();
    }
    const choices = messageHistory.map((conversationMessage, index) => ({
        name: `[${index}] ${conversationMessage.role === getAILabel() ? getAILabel() : 'User'}: ${conversationMessage.message.slice(0, 200) + (conversationMessage.message.length > 200 ? '...' : '')}`,
        value: index,
    }));
    const { index } = await inquirer.prompt([
        {
            type: 'list',
            name: 'index',
            message: 'Select a message to rewind to:',
            choices,
            default: choices.length - 1,
            loop: false,
        },
    ]);
    return rewindTo(index);
}

async function selectMessage(messageId) {
    conversationData.parentMessageId = messageId;
    logSuccess(`Selected message ${messageId}.`);
    return showHistory();
}

async function selectChildMessage(index = null) {
    // const { messages } = await client.conversationsCache.get(conversationId);
    const messages = await conversationMessages();
    const childMessages = getChildren(messages, conversationData.parentMessageId);
    if (childMessages.length === 0) {
        logWarning('No child messages.');
        return conversation();
    }
    if (childMessages.length === 1) {
        index = 0;
    }
    if (index === null) {
        const choices = childMessages.map((conversationMessage, idx) => ({
            name: `[${idx}] ${conversationMessage.role === getAILabel() ? getAILabel() : 'User'}: ${conversationMessage.message.slice(0, 200) + (conversationMessage.message.length > 200 ? '...' : '')}`,
            value: idx,
        }));
        const { index: idx } = await inquirer.prompt([
            {
                type: 'list',
                name: 'index',
                message: 'Select a child message:',
                choices,
                loop: true,
                // pageSize: 10,
            },
        ]);
        index = idx;
    }
    if (index < 0 || index >= childMessages.length) {
        logWarning('Invalid index.');
        return conversation();
    }
    return selectMessage(childMessages[index].id);
}

async function selectSiblingMessage(index = null) {
    const messages = await conversationMessages();
    // const siblingMessages = getC!hildren(messages, getParent(messages, conversationData.parentMessageId));
    const siblingMessages = getSiblings(messages, conversationData.parentMessageId);
    if (siblingMessages.length < 2) {
        logWarning('No sibling messages.');
        return conversation();
    }
    if (index === null) {
        const choices = siblingMessages.map((conversationMessage, idx) => ({
            name: `[${idx}] ${conversationMessage.role === getAILabel() ? getAILabel() : 'User'}: ${conversationMessage.message.slice(0, 200) + (conversationMessage.message.length > 200 ? '...' : '')}`,
            value: idx,
        }));
        const { index: idx } = await inquirer.prompt([
            {
                type: 'list',
                name: 'index',
                message: 'Select a sibling message:',
                choices,
                loop: true,
                default: getSiblingIndex(messages, conversationData.parentMessageId),
                // pageSize: 10,
            },
        ]);
        index = idx;
    }
    if (index < 0 || index >= siblingMessages.length) {
        logWarning('Invalid index.');
        return conversation();
    }
    return selectMessage(siblingMessages[index].id);
}

async function debug() {
    console.log(client.getDataType(await getHistory()));
    return conversation();
}

async function addMessages(newMessages = null) {
    if (!newMessages) {
        const { message } = await inquirer.prompt([
            {
                type: 'editor',
                name: 'message',
                message: 'Write a message:',
                waitUserInput: false,
            },
        ]);
        // console.log(message);
        newMessages = message.trim();
    }
    if (!newMessages) {
        return conversation();
    }
    const { jailbreakConversationId, messageId } = await client.addMessages(conversationData.jailbreakConversationId, newMessages);
    conversationData = {
        ...conversationData,
        jailbreakConversationId,
        parentMessageId: messageId,
    };
    return showHistory();
}

async function setConversationData(key = null, value = null) {
    if (!key) {
        const { conversationKey } = await inquirer.prompt([
            {
                type: 'list',
                name: 'conversationKey',
                message: 'Select a key:',
                choices: Object.keys(conversationData),
            },
        ]);
        key = conversationKey;
    }
    if (!key) {
        logWarning('No key.');
        return conversation();
    }
    if (!value) {
        const { conversationValue } = await inquirer.prompt([
            {
                type: 'editor',
                name: 'conversationValue',
                message: 'Enter a value:',
                waitUserInput: false,
            },
        ]);
        value = conversationValue;
    }
    if (!value) {
        logWarning('No value.');
        // return conversation();
    }
    conversationData[key] = value;
    logSuccess(`Set ${key} to ${value}.`);
    return showHistory();
}

async function useEditor() {
    let { message } = await inquirer.prompt([
        {
            type: 'editor',
            name: 'message',
            message: 'Write a message:',
            waitUserInput: false,
        },
    ]);
    message = message.trim();
    if (!message) {
        return conversation();
    }
    console.log(message);
    return onMessage(message);
}

async function saveConversationState(name = null) {
    if (!name) {
        const { conversationName } = await inquirer.prompt([
            {
                type: 'input',
                name: 'conversationName',
                message: 'Enter a name for the savepoint:',
            },
        ]);
        name = conversationName;
    }
    if (!name) {
        logWarning('No conversation name.');
        return conversation();
    }
    const savedConversations = await client.conversationsCache.get('savedConversations') || [];
    // console.log(savedConversations);
    if (savedConversations.includes(name)) {
        const { overwrite } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'overwrite',
                message: 'A savepoint with this name already exists. Do you want to overwrite it?',
                default: false,
            },
        ]);
        if (!overwrite) {
            return conversation();
        }
    } else {
        savedConversations.push(name);
        await client.conversationsCache.set('savedConversations', savedConversations);
    }
    await client.conversationsCache.set(name, conversationData);
    // await client.conversationsCache.set(name, conversationData);
    logSuccess(`Saved state as "${name}".`);
    return conversation();
}

async function loadConversationState(name = 'lastConversation') {
    conversationData = (await client.conversationsCache.get(name)) || {};

    const conversationId = getConversationId();

    if (conversationId) {
        logSuccess(`Resumed ${conversationId} at ${name}.`);
        return showHistory();
    }
    logWarning('Conversation not found.');
    return conversation();
}

async function loadSavedState(name = null) {
    const savedConversations = await client.conversationsCache.get('savedConversations') || [];
    if (savedConversations.length === 0) {
        logWarning('No saved conversations.');
        return conversation();
    }
    if (!name) {
        const { conversationName } = await inquirer.prompt([
            {
                type: 'list',
                name: 'conversationName',
                message: 'Select a conversation to load:',
                choices: savedConversations,
            },
        ]);
        name = conversationName;
    }
    if (!name) {
        logWarning('No conversation name.');
        return conversation();
    }
    return loadConversationState(name);
}

async function loadConversation(conversationId) {
    // const savedConversations = await client.conversationsCache.get('savedConversations') || [];
    // if (savedConversations.includes(conversationId)) {
    //     return loadSavedState(conversationId);
    // }

    const { messages } = await client.conversationsCache.get(conversationId);
    if (!messages) {
        logWarning('Conversation not found.');
        return conversation();
    }
    if (clientToUse === 'bing') {
        conversationData.jailbreakConversationId = conversationId;
    } else {
        conversationData.conversationId = conversationId;
    }
    const lastMessageId = messages[messages.length - 1].id;
    conversationData.parentMessageId = lastMessageId;
    logSuccess(`Resumed conversation ${conversationId}.`);
    return showHistory();
}

async function newConversation() {
    conversationData = settings.cliOptions?.conversationData || settings.conversationData || {};
    logSuccess('Started new conversation.');
    return conversation();
}

async function deleteAllConversations() {
    if (clientToUse !== 'chatgpt') {
        logWarning('Deleting all conversations is only supported for ChatGPT client.');
        return conversation();
    }
    await client.conversationsCache.clear();
    logSuccess('Deleted all conversations.');
    return conversation();
}

async function getConversationHistoryString() {
    const messageHistory = await getHistory();
    if (!messageHistory) {
        return null;
    }
    return client.toTranscript(messageHistory);
}

async function printOrCopyData(action, type = null) {
    if (action !== 'print' && action !== 'copy') {
        logWarning('Invalid action.');
        return conversation();
    }
    if (type === null) {
        const { dataType } = await inquirer.prompt([
            {
                type: 'list',
                name: 'dataType',
                message: 'Select a data type:',
                choices: [
                    'response',
                    'responseText',
                    'eventLog',
                    'conversationData',
                    'history',
                    'message',
                    'messages',
                    'messageHistory',
                ],
            },
        ]);
        type = dataType;
    }
    if (type === null) {
        logWarning('No data type.');
        return conversation();
    }
    let data;
    let currentMessage;
    switch (type) {
        case 'response':
            data = responseData.response;
            break;
        case 'responseText':
            data = responseData.response?.response || responseData.response;
            break;
        case 'eventLog':
            data = responseData.eventLog;
            break;
        case 'conversationData':
            data = conversationData;
            break;
        case 'history':
            data = await getConversationHistoryString();
            break;
        case 'message':
            currentMessage = await getCurrentMessage();
            if (!currentMessage) {
                logWarning('Current message not found.');
                return conversation();
            }
            data = currentMessage;
            break;
        case 'messages':
            data = await conversationMessages();
            break;
        case 'messageHistory':
            data = await getHistory();
            break;
        default:
            logWarning('Invalid data type.');
            return conversation();
    }

    if (action === 'print') {
        if (typeof data === 'string') {
            console.log(data);
        } else {
            console.log(JSON.stringify(data, null, 2));
        }
    }
    if (action === 'copy') {
        try {
            if (typeof data === 'string') {
                await clipboard.write(data);
            } else {
                await clipboard.write(JSON.stringify(data, null, 2));
            }
            logSuccess(`Copied ${type} to clipboard.`);
        } catch (error) {
            logError(error?.message || error);
        }
    }
    return conversation();
}

function logError(message) {
    console.log(tryBoxen(message, {
        title: 'Error', padding: 0.7, margin: 1, borderColor: 'red',
    }));
}

function logSuccess(message) {
    console.log(tryBoxen(message, {
        title: 'Success', padding: 0.7, margin: 1, borderColor: 'green',
    }));
}

function logWarning(message) {
    console.log(tryBoxen(message, {
        title: 'Warning', padding: 0.7, margin: 1, borderColor: 'yellow',
    }));
}

/**
 * Boxen can throw an error if the input is malformed, so this function wraps it in a try/catch.
 * @param {string} input
 * @param {*} options
 */
function tryBoxen(input, options) {
    try {
        return boxen(input, options);
    } catch {
        return input;
    }
}

function aiMessageBox(message, title = null) {
    return tryBoxen(`${message}`, {
        title: title || getAILabel(), padding: 0.7, margin: {top: 1, bottom: 0, left: 1, right: 1}, dimBorder: true,
    });
}

function userMessageBox(message, title = null) {
    return tryBoxen(`${message}`, {
        title: title || 'User', padding: 0.7, margin: {top: 1, bottom: 0, left: 2, right: 1}, float: 'right', borderColor: 'blue',
    });
}

function conversationMessageBox(conversationMessage, messages, index = null) {
    const children = getChildren(messages, conversationMessage.id);
    const siblings = getSiblings(messages, conversationMessage.id);
    const siblingIndex = getSiblingIndex(messages, conversationMessage.id);
    const aiMessage = Boolean(conversationMessage.role === getAILabel());
    const indexString = index !== null ? `[${index}] ` : '';
    const childrenString = children.length > 0 ? ` ── !child ` + children.map((child, idx) => `[${idx}]`).join(' ') : '';
    const siblingsString = siblings.length > 1 ? ` ── !alt ` + siblings.map((sibling, idx) => { 
        return idx === siblingIndex ? `[${idx}]` : `${idx}`;
    }).join(' ') : '';
    return tryBoxen(conversationMessage.message, {
        title: `${indexString}${conversationMessage.role}${siblingsString}${childrenString}`,
        padding: 0.7,
        margin: {
            top: 1,
            bottom: 0,
            left: aiMessage ? 1 : 2,
            right: aiMessage ? 1 : 1,
        },
        dimBorder: true,
        borderColor: aiMessage ? 'white' : 'blue',
        float: aiMessage ? 'left' : 'right',
    });
}

function suggestionBox(suggestion) {
    return tryBoxen(suggestion, {
        title: 'Suggestion',
        padding: 0.7,
        margin: {
            top: 0,
            bottom: 0,
            left: 1,
            right: 1,
        },
        titleAlignment: 'right',
        float: 'right',
        dimBorder: true,
        borderColor: 'blue',
    });
}

function suggestionsBoxes(suggestions) {
    return suggestions.map(suggestion => suggestionBox(suggestion)).join('\n');
}

async function historyBoxes() {
    const messageHistory = await getHistory();
    const messages = await conversationMessages();
    return messageHistory?.map((conversationMessage, index) => conversationMessageBox(conversationMessage, messages, index)).join('\n');
}

async function showHistory() {
    const boxes = await historyBoxes();
    if (boxes) {
        console.log(boxes);
    }
    return conversation();
}

function getAILabel() {
    switch (clientToUse) {
        case 'bing':
            return 'Bing';
        default:
            return settings.chatGptClient?.chatGptLabel || 'ChatGPT';
    }
}

function getConversationId() {
    const convId = clientToUse === 'bing' ? conversationData.jailbreakConversationId : conversationData.conversationId;
    if (!convId) {
        logWarning('No conversation id.');
        return null;
    }
    return convId;
}

async function getCurrentMessage() {
    if (!conversationData?.parentMessageId) {
        // logWarning('No message id.');
        return [];
    }
    const messages = await getHistory();
    return messages.find(message => message.id === conversationData.parentMessageId);
}

async function conversationMessages() {
    if (!conversationData?.parentMessageId) {
        // logWarning('No message id.');
        return [];
    }
    const { messages } = await client.conversationsCache.get(getConversationId());
    return messages;
}

async function getHistory() {
    const messages = await conversationMessages();
    if (!conversationData.parentMessageId) {
        logWarning('No parent message id.');
        return [];
    }

    const messageHistory = getMessagesForConversation(messages, conversationData.parentMessageId);

    return messageHistory;
}

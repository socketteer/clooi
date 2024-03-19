#!/usr/bin/env node
import fs from 'fs';
import { pathToFileURL } from 'url';
import { KeyvFile } from 'keyv-file';
import boxen from 'boxen';
import ora from 'ora';
import clipboard from 'clipboardy';
import inquirer from 'inquirer';
import inquirerAutocompletePrompt from 'inquirer-autocomplete-prompt';
import crypto from 'crypto';
import ChatGPTClient from '../src/ChatGPTClient.js';
import BingAIClient from '../src/BingAIClient.js';
import InfrastructClient from '../src/InfrastructClient.js';
import ClaudeClient from '../src/ClaudeClient.js';
import OllamaClient from '../src/OllamaClient.js';
import {
    getMessagesForConversation,
    getChildren,
    getSiblings,
    getSiblingIndex,
    getParent,
} from '../src/conversation.js';

const arg = process.argv.find(_arg => _arg.startsWith('--settings'));
const path = arg?.split('=')[1] ?? './settings.js';

let settings;

let conversationData = {};
let responseData = {};
let clientToUse;
let client;
let clientOptions;

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
    // console.log(settings)

    switch (clientToUse) {
        case 'bing':
            clientOptions = {
                ...settings.bingAiClient,
                ...settings.cliOptions.bingOptions,
            };
            client = new BingAIClient({
                ...clientOptions,
                cache: settings.cacheOptions,
            });
            break;
        case 'infrastruct':
            clientOptions = {
                ...settings.infrastructClient,
                ...settings.cliOptions.infrastructOptions,
            };
            client = new InfrastructClient(
                settings.openaiApiKey || settings.infrastructClient.openaiApiKey,
                {
                    ...clientOptions,
                    cache: settings.cacheOptions,
                },
            );
            break;
        case 'claude':
            clientOptions = {
                ...settings.claudeClient,
                ...settings.cliOptions.claudeOptions,
            };
            client = new ClaudeClient(
                settings.anthropicApiKey || settings.claudeClient.anthropicApiKey,
                {
                    ...clientOptions,
                    cache: settings.cacheOptions,
                },
            );
            break;
        case 'ollama':
            clientOptions = {
                ...settings.ollamaClient,
                ...settings.cliOptions.ollamaOptions,
            };
            client = new OllamaClient(
                {
                    ...clientOptions,
                    cache: settings.cacheOptions,
                },
            );
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
        console.log(tryBoxen(`Welcome to the ${getAILabel()} CLooI`, {
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
        name: '!help - Show command documentation',
        value: '!help',
        usage: '!help [command] | <command> --help',
        description: 'Show command documentation.\n\t[command]: If provided, show the documentation for that command, otherwise shows documentation for all commands.',
        command: async args => showCommandDocumentation(args[1]),
    },
    {
        name: '!mu - Regenerate last response',
        value: '!mu',
        usage: '!mu',
        description: 'Regenerate the last response. Equivalent to running !rw -1 and then !gen.',
        available: async () => Boolean(conversationData.parentMessageId),
        command: async () => retryResponse(),
    },
    {
        name: '!gen - Generate response',
        value: '!gen',
        usage: '!gen',
        description: 'Generate a response without sending an additional user message',
        command: async () => generateMessage(),
    },
    {
        name: '!save - Save conversation state',
        value: '!save',
        usage: '!save [name]',
        description: 'Save a named pointer to the current conversation state\n\t[name]: If a name is provided, it will save the state with that name, otherwise a prompt will appear.',
        command: async args => saveConversationState(args[1]),
    },
    {
        name: '!load - Load conversation state',
        value: '!load',
        usage: '!load [name]',
        description: 'Load a saved conversation state.\n\t[name]: If a name is provided, it will load the state with that name, otherwise a prompt will appear showing saved states.',
        command: async args => loadSavedState(args[1]),
    },

    {
        name: '!new - Start new conversation',
        value: '!new',
        usage: '!new',
        description: 'Start a new conversation.',
        command: async () => newConversation(),
    },
    {
        name: '!rw - Rewind to a previous message',
        value: '!rw',
        usage: '!rw [index]',
        description: 'Rewind to a previous message.\n\t[index]: If positive, rewind to message with that index. If negative, go that many steps backwards from the current index. If not provided, a prompt will appear to choose where in conversation history to rewind to.',
        available: async () => Boolean(conversationData.parentMessageId),
        command: async args => rewind(args[1] ? parseInt(args[1], 10) : null),
    },
    {
        name: '!fw - Go forward to a child message',
        value: '!fw',
        usage: '!fw [index]',
        description: 'Go forward to a child message.\n\t[index]: If positive, go to the child message with that index. If 0, go to the first child message. If not provided, a prompt will appear to choose which child message to go to.',
        available: hasChildren,
        command: async args => selectChildMessage(args[1] ? parseInt(args[1], 10) : null),
    },
    {
        name: '!alt - Go to a sibling message',
        value: '!alt',
        usage: '!alt [index]',
        description: 'Go to a sibling message.\n\t[index]: Index of sibling message. If not provided a prompt will appear to choose which sibling message to go to.',
        available: hasSiblings,
        command: async args => selectSiblingMessage(args[1] ? parseInt(args[1], 10) : null),
    },
    {
        name: '!w (up) - Navigate to the parent message',
        value: '!w',
        usage: '!w',
        description: 'Navigate to the parent message. Equivalent to running !rw -1.',
        available: async () => Boolean(conversationData.parentMessageId),
        command: async () => rewindTo(-1),
    },
    // {
    //     name: '!s (down) - Navigate to the first child message',
    //     value: '!s',
    //     available: hasChildren,
    // },
    {
        name: '!> - Go right / to the next sibling',
        value: '!>',
        usage: '!>',
        description: 'Go right / to the next sibling.',
        available: hasSiblings,
        command: async () => {
            const messages = await conversationMessages();
            return selectSiblingMessage(getSiblingIndex(messages, conversationData.parentMessageId) + 1);
        },
    },
    {
        name: '!< - Go left / to the previous sibling',
        value: '!<',
        usage: '!<',
        description: 'Go left / to the previous sibling.',
        available: hasSiblings,
        command: async () => {
            const messages = await conversationMessages();
            return selectSiblingMessage(getSiblingIndex(messages, conversationData.parentMessageId) - 1);
        },
    },
    {
        name: '!cp - Copy data to clipboard',
        value: '!cp',
        usage: '!cp [type]',
        description: 'Copy data to clipboard.\n\t[type]: If provided, copy the data of that type. If not provided, a prompt will appear to choose which data to copy.',
        command: async args => printOrCopyData('copy', args[1]),
    },
    {
        name: '!pr - Print data to console',
        value: '!pr',
        usage: '!pr [type]',
        description: 'Print data to console.\n\t[type]: If provided, print the data of that type. If not provided, a prompt will appear to choose which data to print.',
        command: async args => printOrCopyData('print', args[1]),
    },
    {
        name: '!ml - Open the editor (for multi-line messages)',
        value: '!ml',
        usage: '!ml',
        description: 'Open the editor (for multi-line messages). When changes are saved and the editor is closed, the message will be sent.',
        command: async () => useEditor(),
    },
    {
        name: '!edit - Edit and fork the current message',
        value: '!edit',
        usage: '!edit',
        description: 'Opens the text of the current message in the editor. If you make changes and save, a copy of the message (with the same author and type) will be created as a sibling message.',
        available: async () => Boolean(conversationData.parentMessageId),
        command: async () => editMessage(conversationData.parentMessageId),
    },
    {
        name: '!concat - Concatenate message(s) to the conversation',
        value: '!concat',
        usage: '!concat [message]',
        description: 'Concatenate message(s) to the conversation.\n\t[message]: If provided, concatenate the message as a user message. If not provided, the editor will open, and you write either a single message or multiple messages in the standard transcript format.',
        command: async args => addMessages(args[1]),
    },
    {
        name: '!merge - Merge the last message up into the parent message',
        value: '!merge',
        usage: '!merge',
        description: 'Creates a new sibling of the parent message with the last message\'s text appended to the parent message\'s text, and which inherits other properties of the parent like author.',
        available: async () => Boolean(conversationData.parentMessageId),
        command: async () => mergeUp(),
    },
    {
        name: '!history - Show conversation history',
        value: '!history',
        usage: '!history',
        description: 'Display conversation history in formatted boxes. If you want to copy the raw conversation history transcript, use !cp history or !pr history instead.',
        available: async () => Boolean(conversationData.parentMessageId),
        command: async () => showHistory(),
    },
    {
        name: '!exit - Exit CLooI',
        value: '!exit',
        usage: '!exit',
        description: 'Exit CLooI.',
        command: async () => true,
    },
    {
        name: '!resume - Resume last conversation',
        value: '!resume',
        usage: '!resume',
        description: 'Resume the last conversation.',
        available: async () => {
            const lastConversation = await client.conversationsCache.get('lastConversation');
            return Boolean(lastConversation);
        },
        command: async () => loadConversationState(),
    },
    {
        name: '!export - Export conversation tree to JSON',
        value: '!export',
        usage: '!export [filename]',
        description: 'Export conversation tree to JSON.\n\t[filename]: If provided, export the conversation tree to a file with that name, otherwise a prompt will appear to choose a filename.',
        available: async () => Boolean(getConversationId()),
        command: async args => exportConversation(args[1]),
    },
    // {
    //     name: '!import - Import conversation tree from JSON',
    //     value: '!import',
    // },
    {
        name: '!open - Load a saved conversation by id',
        value: '!open',
        usage: '!open <id>',
        description: 'Load a saved conversation by id.\n\t<id>: The id of the conversation to load.',
        command: async args => loadConversation(args[1]),
    },
    // {
    //     name: '!set - Set a conversationData property',
    //     value: '!set',
    // },
    // {
    //     name: '!reload - Reload default settings',
    //     value: '!reload',
    // },
    {
        name: '!debug - Debug',
        value: '!debug',
        usage: '!debug',
        description: 'Run debug command.',
        command: async () => debug(),
    },
    // {
    //     name: '!delete-all - Delete all conversations',
    //     value: '!delete-all',
    //     available: async () => clientToUse === 'chatgpt',
    // },
    // {
    //     name: '!rw -1 - Rewind one step',
    //     value: '!rw -1',
    //     available: async () => Boolean(conversationData.parentMessageId),
    // },
    // {
    //     name: '!fw 0 - Go to first child',
    //     value: '!fw 0',
    //     available: hasChildren,
    // },
];

inquirer.registerPrompt('autocomplete', inquirerAutocompletePrompt);

await loadSettings();

// await conversation();

function printDocString(commandObj) {
    console.log(`\n${commandObj.usage}: ${commandObj.description}`);
}

async function showCommandDocumentation(command) {
    if (command) {
        const commandObj = availableCommands.find(c => (c.value === command) || (c.value === `!${command}`));
        if (!commandObj) {
            console.log('Command not found.');
            return conversation();
        }
        printDocString(commandObj);
    } else {
        // console.log('Commands:\n');
        for (const commandObj of availableCommands) {
            // console.log(`\n${commandObj.usage}\n`);
            printDocString(commandObj);
        }
    }
    return conversation();
}

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
    // const messages = await conversationMessages();

    if (message.startsWith('!')) {
        const args = message.split(' ');
        const command = availableCommands.find(c => c.value === args[0]);
        if (command) {
            if (args[1] === '--help') {
                return showCommandDocumentation(args[0]);
            }
            return command.command(args);
        }
        logWarning('Command not found.');
        return conversation();
    }
    return generateMessage(message);
}

async function generateMessage(message = null) {
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
            ...clientOptions.messageOptions,
            abortController: controller,
            onProgress: (diff, data) => {
                reply += diff;
                const output = aiMessageBox(reply.trim());
                spinner.text = `${spinnerPrefix}\n${output}`;
                if (data) {
                    eventLog.push(data);
                }
                responseData = {
                    textSoFar: reply,
                    eventLog,
                };
            },
        });
        // responseData = {
        //     response,
        //     eventLog,
        // };
        responseData.response = response;
        // let responseText;
        switch (clientToUse) {
            case 'bing':
                responseData.responseText = response.details.adaptiveCards?.[0]?.body?.[0]?.text?.trim() || response.response;
                break;
            default:
                responseData.responseText = response.response;
                break;
        }
        // clipboard.write(responseText).then(() => {}).catch(() => {});
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
    return generateMessage('');
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

async function rewind(idx) {
    const messageHistory = await getHistory();
    if (!messageHistory || messageHistory.length < 2) {
        return conversation();
    }
    if (!idx) {
        const choices = messageHistory.map((conversationMessage, index) => ({
            name: `[${index}] ${conversationMessage.role}: ${conversationMessage.message.slice(0, 200) + (conversationMessage.message.length > 200 ? '...' : '')}`,
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
        idx = index;
    }
    return rewindTo(idx);
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
                pageSize: Math.min(childMessages.length * 2, 30),
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
                pageSize: Math.min(siblingMessages.length * 2, 30),
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
    const currentConversationId = getConversationId();
    const savedConversations = await client.conversationsCache.get('savedConversations') || [];
    console.log(savedConversations);
    const savedStates = [];
    for (const name of savedConversations) {
        conversationData = (await client.conversationsCache.get(name)) || {};
        if (conversationData && getConversationId(conversationData) === currentConversationId) {
            savedStates.push({ name, conversationData });
        }
    }
    console.log(savedStates);
    // console.log(client.getDataType(await getHistory()));
    // const currentMessage = await getCurrentMessage();
    // console.log(Object.keys(BingAIClient.getSearchResults(currentMessage)));
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
    const convId = getConversationId();
    const { conversationId, messageId } = await client.addMessages(convId, newMessages, conversationData.parentMessageId);
    conversationData = {
        ...conversationData,
        ...(clientToUse === 'bing' ? { jailbreakConversationId: conversationId } : { conversationId }),
        parentMessageId: messageId,
    };
    return showHistory();
}


    

async function setOptions(key = null, value = null) {
    // todo save old value see if changed
    if (!key) {
        const { optionKey } = await inquirer.prompt([
            {
                type: 'list',
                name: 'optionKey',
                message: 'Select a key:',
                choices: Object.keys(clientOptions),
            },
        ]);
        key = optionKey;
    }
    if (!key) {
        logWarning('No key.');
        return conversation();
    }
    if (!value) {
        const { optionValue } = await inquirer.prompt([
            {
                type: 'editor',
                name: 'optionValue',
                message: 'Enter a value:',
                default: clientOptions[key],
                waitUserInput: true,
            },
        ]);
        value = optionValue;
    }
    if (!value) {
        logWarning('No value.');
        // return conversation();
    }
    clientOptions[key] = value;
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
    return generateMessage(message);
}

async function editMessage(messageId) {
    const currentMessage = await getCurrentMessage();
    if (!currentMessage) {
        logWarning('Current message not found.');
        return conversation();
    }
    const initialMessage = currentMessage.message;
    console.log(initialMessage);
    let { message } = await inquirer.prompt([
        {
            type: 'editor',
            name: 'message',
            message: 'Edit the message:',
            default: initialMessage,
            waitUserInput: true,
        },
    ]);
    message = message.trim();
    if (!message) {
        logWarning('Message empty.');
        return conversation();
    }
    if (message === initialMessage) {
        logWarning('Message unchanged.');
        return conversation();
    }
    const editedMessage = {
        ...currentMessage,
        message,
        id: crypto.randomUUID(),
    };
    const convoTree = await client.conversationsCache.get(getConversationId());
    convoTree.messages.push(editedMessage);
    await client.conversationsCache.set(getConversationId(), convoTree);

    logSuccess(`Cloned and edited message ${messageId}.`);

    return selectMessage(editedMessage.id);
}

async function mergeUp() {
    const messages = await conversationMessages();
    const currentMessage = await getCurrentMessage();
    const parentMessage = getParent(messages, currentMessage.id);
    if (!parentMessage) {
        logWarning('No parent message.');
        return conversation();
    }
    const newMessage = {
        ...parentMessage,
        message: `${parentMessage.message}${currentMessage.message}`,
        id: crypto.randomUUID(),
    };
    const convoTree = await client.conversationsCache.get(getConversationId());
    convoTree.messages.push(newMessage);
    await client.conversationsCache.set(getConversationId(), convoTree);
    logSuccess(`Merged message ${currentMessage.id} into parent message ${parentMessage.id} and created new message ${newMessage.id}.`);
    return selectMessage(newMessage.id);
}

async function saveConversationState(name = null, data = conversationData) {
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
    await client.conversationsCache.set(name, data);
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

async function getSavedStatesForConversation(conversationId = null) {
    if (!conversationId) {
        conversationId = getConversationId();
    }
    // const currentConversationId = getConversationId();
    const savedConversations = await client.conversationsCache.get('savedConversations') || [];
    // console.log(savedConversations);
    const savedStates = [];
    for (const name of savedConversations) {
        conversationData = (await client.conversationsCache.get(name)) || {};
        if (conversationData && getConversationId(conversationData) === conversationId) {
            savedStates.push({ name, conversationData });
        }
    }
    // savedConversations.forEach(async (name) => {
    //     const data = client.conversationsCache.get(name);
    //     if (data && getConversationId(data) === conversationId) {
    //         savedStates.push({ name, data });
    //     }
    // });
    return savedStates;
}

async function exportConversation(conversationId = null) {
    if (!conversationId) {
        conversationId = getConversationId();
    }
    if (!conversationId) {
        logWarning('No conversation id.');
        return conversation();
    }
    const conversationDict = await client.conversationsCache.get(conversationId);
    if (!conversationDict) {
        logWarning('Conversation not found.');
        return conversation();
    }
    conversationDict.id = conversationId;
    // const savedStates = await getSavedStatesForConversation(conversationId);
    // conversationDict.savedStates = savedStates;

    // prompt for filename
    const { name } = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'Enter a filename:',
            default: `${conversationId}`,
        },
    ]);

    const filename = `${name}.json`;
    const filePath = `./${filename}`;
    fs.writeFileSync(filePath, JSON.stringify(conversationDict, null, 2));
    logSuccess(`Exported conversation to ${filename}.`);
    return conversation();
}

async function importConversation(filename = null) {
    if (!filename) {
        const { name } = await inquirer.prompt([
            {
                type: 'input',
                name: 'name',
                message: 'Enter a filename:',
            },
        ]);
        filename = name;
    }
    if (!filename) {
        logWarning('No filename.');
        return conversation();
    }
    const filePath = `./${filename}`;
    if (!fs.existsSync(filePath)) {
        logWarning('File not found.');
        return conversation();
    }
    const conversationDict = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!conversationDict) {
        logWarning('Invalid file.');
        return conversation();
    }
    const conversationId = conversationDict.id;
    if (!conversationId) {
        logWarning('Conversation id not found.');
        return conversation();
    }
    await client.conversationsCache.set(conversationId, conversationDict);
    logSuccess(`Imported conversation from ${filename}.`);
    // for (const { name, data } of conversationDict.savedStates) {
    //     await saveConversationState(name, data);
    // }
    // conversationDict.savedStates.forEach(async ({ name, data }) => {
    //     await saveConversationState(name, data);
    // });

    return conversation();
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
                    {
                        name: '. (current message text)',
                        value: '.',
                    },
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
        case '.':
            currentMessage = await getCurrentMessage();
            if (!currentMessage) {
                logWarning('Current message not found.');
                return conversation();
            }
            data = currentMessage.message;
            break;
        case 'response':
            data = responseData;
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
        title: 'Error', padding: 0.7, margin: 1, borderColor: 'red', float: 'center',
    }));
}

function logSuccess(message) {
    console.log(tryBoxen(message, {
        title: 'Success', padding: 0.7, margin: 1, borderColor: 'green', float: 'center',
    }));
}

function logWarning(message) {
    console.log(tryBoxen(message, {
        title: 'Warning', padding: 0.7, margin: 1, borderColor: 'yellow', float: 'center',
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
        title: title || getAILabel(),
        padding: 0.7,
        margin: {
            top: 1, bottom: 0, left: 1, right: 1,
        },
        dimBorder: true,
    });
}

function userMessageBox(message, title = null) {
    return tryBoxen(`${message}`, {
        title: title || 'User',
        padding: 0.7,
        margin: {
            top: 1, bottom: 0, left: 2, right: 1,
        },
        float: 'right',
        borderColor: 'blue',
    });
}

function conversationMessageBox(conversationMessage, messages, index = null) {
    const children = getChildren(messages, conversationMessage.id);
    const siblings = getSiblings(messages, conversationMessage.id);
    const siblingIndex = getSiblingIndex(messages, conversationMessage.id);
    const aiMessage = Boolean(conversationMessage.role === getAILabel());
    const indexString = index !== null ? `[${index}] ` : '';
    const childrenString = children.length > 0 ? ` ── !fw ${children.map((child, idx) => `${idx}`).join(' ')}` : '';
    const siblingsString = siblings.length > 1 ? ` ── !alt ${siblings.map((sibling, idx) => (idx === siblingIndex ? `[${idx}]` : `${idx}`)).join(' ')}` : '';
    return tryBoxen(`${conversationMessage.message}`, {
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
        case 'infrastruct':
            return 'Infrastruct'; // settings.infrastructClient?.participants?.ai?.display || 'Infrastruct';
        case 'claude':
            return 'Claude'; // settings.claudeClient?.participants?.ai?.display || 'Claude';
        case 'ollama':
            return 'Ollama'; // settings.ollamaClient?.participants?.ai?.display || 'Ollama';
        default:
            return settings.chatGptClient?.chatGptLabel || 'ChatGPT';
    }
}

function getConversationId(data = conversationData) {
    const convId = (clientToUse === 'bing') ? data.jailbreakConversationId : data.conversationId;
    if (!convId) {
        // logWarning('No conversation id.');
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

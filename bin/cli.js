#!/usr/bin/env node
import fs from 'fs';
import { pathToFileURL } from 'url';
import { KeyvFile } from 'keyv-file';
import { spawn } from 'child_process';
import boxen from 'boxen';
import chalk from 'chalk';
import { writeFile, readFile } from 'fs/promises';
import { existsSync, realpathSync } from 'fs';
import { unlink } from 'fs/promises';


import chokidar from 'chokidar';

import ora from 'ora';
import clipboard from 'clipboardy';
import inquirer from 'inquirer';
import inquirerAutocompletePrompt from 'inquirer-autocomplete-prompt';
import crypto from 'crypto';
import { getClient, getClientSettings } from './util.js';
import { getCid, savedStatesByConversation, getSavedIds } from '../src/cacheUtil.js';
import {
    getMessagesForConversation,
    getChildren,
    getSiblings,
    getSiblingIndex,
    getParent,
} from '../src/conversation.js';

const arg = process.argv.find(_arg => _arg.startsWith('--settings'));
const pathToSettings = arg?.split('=')[1] ?? './settings.js';

let settings;
let watcher;


let conversationData = {};
let responseData = {};
let clientToUse;
let client;
let clientOptions;
let navigationHistory = [];
let localConversation = {};
let steeringFeatures = {};


async function initializeSettingsWatcher(path) {
    await updateSettings(path);

    watcher = chokidar.watch(path);
    watcher.on('change', () => updateSettings(path));

    return watcher;
}

async function stopSettingsWatcher() {
    if (watcher) {
        await watcher.close();
        // console.log('Settings watcher stopped');
    }
}

async function updateSettings(path) {


    if (existsSync(path)) {
        const fullPath = realpathSync(path);
        const modulePath = pathToFileURL(fullPath).toString();
        
        try {
            // Read the file contents
            const fileContent = await readFile(fullPath, 'utf8');
            
            // Create a temporary file with a unique name
            const tempPath = `${fullPath}.${Date.now()}.tmp.js`;
            await writeFile(tempPath, fileContent);
            
            // Import the temporary file
            const module = await import(pathToFileURL(tempPath).toString());
            settings = module.default;
            
            // Delete the temporary file
            await unlink(tempPath);
            
            // console.log('Settings reloaded');
        } catch (error) {
            console.error('Error loading settings:', error);
        }
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

    // // Disable the image generation in cli mode always.
    // settings.bingAiClient.features = settings.bingAiClient.features || {};
    // settings.bingAiClient.features.genImage = false;

    
    clientToUse = settings.cliOptions?.clientToUse || settings.clientToUse || 'bing';
    // console.log(settings)

    clientOptions = getClientSettings(clientToUse, settings);
    client = getClient(clientToUse, settings);

}



async function loadSettings() {
    
    await initializeSettingsWatcher(pathToSettings);

    conversationData = settings.cliOptions?.conversationData || settings.conversationData || {};

    responseData = {};
    
    if (clientToUse === 'bing') {
        console.log(tryBoxen('Welcome to the Bingleton Backrooms CLooI', {
            title: '😊', padding: 0.7, margin: 1, titleAlignment: 'center', borderStyle: 'arrow', borderColor: 'gray',
        }));
    } else if (clientToUse === 'claude') {
        const claudeAscii = fs.readFileSync('./contexts/claudeLoomAscii.txt', 'utf8');
        // console.log(claudeAscii);
        console.log(tryBoxen(claudeAscii, {
            padding: 0, margin: 1, borderStyle: 'none', float: 'center',
        }));
    } else {
        console.log(tryBoxen(`${getAILabel()} CLooI`, {
            padding: 0.7, margin: 1, borderStyle: 'double', dimBorder: true,
        }));
    }
    const { systemMessage } = clientOptions.messageOptions;
    if (systemMessage) {
        console.log(systemMessageBox(systemMessage));
    }
    return conversation();
}

async function hasChildren() {
    if (!conversationData.parentMessageId) {
        return false;
    }
    return getChildren(localConversation.messages, conversationData.parentMessageId).length > 0;
}

async function hasSiblings() {
    if (!conversationData.parentMessageId) {
        return false;
    }
    return getSiblings(localConversation.messages, conversationData.parentMessageId).length > 1;
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
        usage: '!rw [index] [branch_index]',
        description: 'Rewind to a previous message.\n\t[index]: If positive, rewind to message with that index. If negative, go that many steps backwards from the current index. If not provided, a prompt will appear to choose where in conversation history to rewind to.\n\t[branch]: If provided, select an alternate sibling at the provided index.',
        available: async () => Boolean(conversationData.parentMessageId),
        command: async args => rewind(args[1] ? parseInt(args[1], 10) : null, args[2] ? parseInt(args[2], 10) : null),
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
    {
        name: '!> - Go right / to the next sibling',
        value: '!>',
        usage: '!>',
        description: 'Go right / to the next sibling.',
        available: hasSiblings,
        command: async () => {
            // const messages = await conversationMessages();
            return selectSiblingMessage(getSiblingIndex(localConversation.messages, conversationData.parentMessageId) + 1);
        },
    },
    {
        name: '!< - Go left / to the previous sibling',
        value: '!<',
        usage: '!<',
        description: 'Go left / to the previous sibling.',
        available: hasSiblings,
        command: async () => {
            // const messages = await conversationMessages();
            return selectSiblingMessage(getSiblingIndex(localConversation.messages, conversationData.parentMessageId) - 1);
        },
    },
    {
        name: '!cp - Copy data to clipboard',
        value: '!cp',
        usage: '!cp [type] [branch_index] [type]',
        description: 'Copy data to clipboard.\n\t[type]: If arguments aren\'t provided, defaults to copying current index/branch and plaintext of the message. If "?" is one of the arguments, opens dropdown for types of data to copy.',
        command: async args => printOrCopyData('copy', args.slice(1)),
    },
    {
        name: '!pr - Print data to console',
        value: '!pr',
        usage: '!pr [index] [branch_index] [type]',
        description: 'Print data to console.\n\t[type]: !pr . prints current node text. If arguments aren\'t provided, opens dropdown for types of data to print.',
        command: async args => printOrCopyData('print', args.slice(1)),
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
        command: async args => editMessage(conversationData.parentMessageId, args.slice(1)),
    },
    {
        name: '!concat - Concatenate message(s) to the conversation',
        value: '!concat',
        usage: '!concat [message]',
        description: 'Concatenate message(s) to the conversation.\n\t[message]: If provided, concatenate the message as a user message. If not provided, the editor will open, and you write either a string for a single user message or any number of consecutive messages (with sender specified in headers) in the standard transcript format.',
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
        command: async () => { showHistory(); return conversation(); },
    },
    {
        name: '!exit - Exit CLooI',
        value: '!exit',
        usage: '!exit',
        description: 'Exit CLooI.',
        command: async () => { await stopSettingsWatcher(); process.exit(); }
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

    {
        name: '!open - Load a saved conversation by id',
        value: '!open',
        usage: '!open <id>',
        description: 'Load a saved conversation by id.\n\t<id>: The id of the conversation to load.',
        command: async args => loadConversation(args[1]),
    },
    {
        name: '!debug - Debug',
        value: '!debug',
        usage: '!debug',
        description: 'Run debug command.',
        command: async args => debug(args.slice(1)),
    },
    {
        name: '!steer - change steering feature',
        value: '!steer',
        usage: '!steer <id> <amount>',
        description: '',
        command: async args => {
            if (args.length == 1) {
                steeringFeatures = {};
                console.log("Reset steering features");
            } else if (args[1] == 'cat') {
                console.log("Steering features", steeringFeatures);
            } else {
                let amount = 10
                if (args[2] != null) {
                    amount = args[2];
                }
                steeringFeatures["feat_34M_20240604_" + args[1]] = Number(amount);
            }
            return conversation();
        },
    },
];

inquirer.registerPrompt('autocomplete', inquirerAutocompletePrompt);

await loadSettings();

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

    await pullFromCache();

    let userSuggestions = [];
    if (conversationData.parentMessageId) {
        const targetMessage = getMessageByIndex();
        userSuggestions = client.constructor.getUserSuggestions(targetMessage?.details?.message) || [];
    }

    prompt.ui.activePrompt.opt.source = async (answers, input) => {
        if (!input) {
            return [];
        }
        prompt.ui.activePrompt.opt.suggestOnly = (!input.startsWith('!') || input.split(' ').length > 1) && !(input.startsWith('?'));

        availableCommands = await Promise.all(availableCommands.map(async command => ({
            ...command,
            isAvailable: command.available ? await command.available() : true,
        })));

        const userSuggestionCommands = userSuggestions.map(suggestion => ({
            name: `?${suggestion}`,
            value: suggestion,
        }));

        return [
            ...availableCommands.filter(command => command.isAvailable && command.value.startsWith(input)),
            ...userSuggestionCommands.filter(command => command.name.toLowerCase().startsWith(input.toLowerCase())),
        ];

        // return availableCommands.filter(command => command.isAvailable && command.value.startsWith(input));
    };
    let { message } = await prompt;
    message = message.trim();
    if (!message) {
        return conversation();
    }

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
    await concatMessages(message);
    showHistory();
    return generateMessage();
}

async function generateMessage() {
    const previewIdx = 0;
    const streamedMessages = {};
    const status = {};
    const eventLog = [];

    const context = await client.yieldGenContext(
        null,
        {
            ...clientOptions.modelOptions,
            ...(Object.keys(steeringFeatures) != 0 ? {
                steering: {
                    feature_levels: steeringFeatures
                }
            } : {}),
        },
        {
            ...conversationData,
            ...clientOptions.messageOptions,
        },
    );

    const {
        apiParams,
        conversationId,
        completionParentId: parentMessageId,
        conversation: _conversation,
    } = context;

    localConversation = _conversation;

    // console.log('apiParams', apiParams);
    // console.log('modelOptions', clientOptions.modelOptions);
    // console.log('messageOptions', clientOptions.messageOptions);

    conversationData = {
        ...conversationData,
        parentMessageId,
        conversationId,
    };

    const spinnerPrefix = `${getAILabel()} is typing...`;
    const spinner = ora(spinnerPrefix);
    spinner.prefixText = '\n   ';
    spinner.start();
    try {
        const controller = new AbortController();
        // abort on ctrl+c
        process.on('SIGINT', () => {
            controller.abort();
        });

        const { results, replies } = await client.callAPI(
            apiParams,
            {
                ...clientOptions.messageOptions,
                abortController: controller,
                onProgress: (diff, idx, data) => {
                    if (diff) {
                        if (!streamedMessages[idx]) {
                            streamedMessages[idx] = '';
                            status[idx] = 'streaming';
                        }
                        streamedMessages[idx] += diff;
                        if (idx === previewIdx) {
                            const output = aiMessageBox(replaceWhitespace(streamedMessages[idx].trim()));
                            spinner.text = `${spinnerPrefix}\n${output}`;
                        }
                    }
                    if (data) {
                        eventLog.push(data);
                    }
                    responseData = {
                        replies: streamedMessages,
                        eventLog,
                    };
                },
                onFinished: async (idx, data = {}, stopReason = null) => {
                    // console.log('onFinished', idx, stopReason);
                    if (status[idx] === 'finished') {
                        // console.log('already finished');
                        return null;
                    }
                    status[idx] = 'finished';
                    let empty = false;
                    if (!streamedMessages[idx]) {
                        streamedMessages[idx] = '';
                        empty = true;
                    }
                    const simpleMessage = client.buildMessage(streamedMessages[idx].trim(), client.names.bot.author);
                    const conversationMessage = client.createConversationMessage(simpleMessage, parentMessageId, {
                        ...(data ? { details: data } : {}),
                        ...(stopReason ? { stopReason } : {}),
                    });
                    localConversation.messages.push(conversationMessage);
                    if (idx === previewIdx) {
                        // await pullFromCache();
                        await client.conversationsCache.set(conversationId, localConversation);
                        // localConversation = _conversation;
                        // await pullFromCache();

                        spinner.stop();
                        if (empty) {
                            return conversation();
                        }
                        return selectMessage(conversationMessage.id, conversationId);
                    }
                    return null;
                },
            },
        );

        responseData.response = results;

        if (!streamedMessages[previewIdx]) {
            // console.log('not streaming');
            spinner.stop();
            const newConversationMessages = [];
            let previewMessage;
            for (const [key, text] of Object.entries(replies)) {
                const simpleMessage = client.buildMessage(text.trim(), client.names.bot.author);
                const conversationMessage = client.createConversationMessage(simpleMessage, parentMessageId);
                if (parseInt(key, 10) === previewIdx) {
                    previewMessage = conversationMessage;
                }
            }
            localConversation.messages.push(...newConversationMessages);
            await client.conversationsCache.set(conversationId, localConversation);
            // await pullFromCache();

            return selectMessage(previewMessage.id, conversationId);
        }

        // await pullFromCache();
        await client.conversationsCache.set(conversationId, localConversation);
        // localConversation = _conversation;
        // await pullFromCache();

        // showHistory();
        return null;
    } catch (error) {
        spinner.stop();
        console.log(error);
        if (streamedMessages && Object.keys(streamedMessages).length > 0) {
            // console.log(streamedMessages);
            const newConversationMessages = [];
            let previewMessage;
            for (const [key, text] of Object.entries(streamedMessages)) {
                if (status[key] === 'streaming' && text.trim()) {
                    const simpleMessage = client.buildMessage(text.trim(), client.names.bot.author);
                    const conversationMessage = client.createConversationMessage(simpleMessage, parentMessageId, {
                        stopReason: error,
                    });
                    if (parseInt(key, 10) === previewIdx) {
                        previewMessage = conversationMessage;
                    }
                    newConversationMessages.push(conversationMessage);
                }
            }
            if (newConversationMessages.length > 0) {
                localConversation.messages.push(...newConversationMessages);
                // await pullFromCache();
                await client.conversationsCache.set(conversationId, localConversation);
                // localConversation = localConversation;

                if (previewMessage) {
                    return selectMessage(previewMessage.id, conversationId);
                }
            }

            return null;
        }
        // throw error;
    }
    return conversation();
}

function retryResponse() {
    if (!conversationData.parentMessageId) {
        logWarning('No message to rewind to.');
        return conversation();
    }
    const currentMessage = getCurrentMessage();
    if (!currentMessage) {
        logWarning('Current message not found.');
        return conversation();
    }
    conversationData.parentMessageId = currentMessage.parentMessageId;
    // logSuccess(`Rewound conversation to message ${conversationData.parentMessageId}.`);
    const boxes = historyBoxes();
    if (boxes) {
        console.log(boxes);
    }
    return generateMessage();
}

function getMessageByIndex(pathIndex = null, branchIndex = null) {
    const messageHistory = getHistory();
    if (!messageHistory) {
        return null;
    }
    let anchorMessage = null;
    if (pathIndex === null || pathIndex === '.') {
        anchorMessage = getCurrentMessage();
    } else {
        if (pathIndex < 0) {
            pathIndex -= 1; // relative index
        }
        [anchorMessage] = messageHistory.slice(pathIndex);
    }
    if (!anchorMessage) {
        // logWarning('Message not found.');
        return null;
    }
    if (branchIndex === null) {
        return anchorMessage;
    }
    // const messages = await conversationMessages();
    const siblingMessages = getSiblings(localConversation.messages, anchorMessage.id);
    const anchorSiblingIndex = getSiblingIndex(localConversation.messages, anchorMessage.id);
    if (branchIndex < 0) {
        branchIndex = anchorSiblingIndex + branchIndex;
    }
    if (branchIndex < 0) {
        branchIndex = siblingMessages.length + branchIndex;
    } else if (branchIndex >= siblingMessages.length) {
        // logWarning('Invalid index.');
        return null;
    }
    return siblingMessages[branchIndex];
}

function rewindTo(index, branchIndex = null) {
    const conversationMessage = getMessageByIndex(index, branchIndex);
    if (!conversationMessage) {
        logWarning('Message not found.');
        return conversation();
    }
    return selectMessage(conversationMessage.id);
}

async function rewind(idx, branchIndex = null) {
    const messageHistory = getHistory();
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
                default: choices.length - 2,
                loop: false,
            },
        ]);
        idx = index;
    }
    return rewindTo(idx, branchIndex);
}

async function setConversationData(data) {
    conversationData = {
        ...conversationData,
        ...data,
    };
    navigationHistory.push(conversationData);
    await client.conversationsCache.set('lastConversation', conversationData);
    await pullFromCache();
}

async function selectMessage(messageId, conversationId = getConversationId()) {
    await setConversationData({
        conversationId,
        parentMessageId: messageId,
    });
    // logSuccess(`Selected message ${messageId}.`);
    showHistory();
    return conversation();
}

async function selectChildMessage(index = null) {
    // const messages = await conversationMessages();
    const childMessages = getChildren(localConversation.messages, conversationData.parentMessageId);
    if (childMessages.length === 0) {
        logWarning('No child messages.');
        return conversation();
    }
    if (childMessages.length === 1) {
        index = 0;
    }
    if (index === null) {
        const choices = childMessages.map((conversationMessage, idx) => ({
            name: `[${idx}] ${conversationMessage.role}: ${conversationMessage.message.slice(0, 200) + (conversationMessage.message.length > 200 ? '...' : '')}`,
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
    // const messages = await conversationMessages();
    const siblingMessages = getSiblings(localConversation.messages, conversationData.parentMessageId);
    if (siblingMessages.length < 2) {
        logWarning('No sibling messages.');
        return conversation();
    }
    if (index === null) {
        const choices = siblingMessages.map((conversationMessage, idx) => ({
            name: `[${idx}] ${conversationMessage.role}: ${conversationMessage.message.slice(0, 200) + (conversationMessage.message.length > 200 ? '...' : '')}`,
            value: idx,
        }));
        const { index: idx } = await inquirer.prompt([
            {
                type: 'list',
                name: 'index',
                message: 'Select a sibling message:',
                choices,
                loop: true,
                default: getSiblingIndex(localConversation.messages, conversationData.parentMessageId) + 1,
                pageSize: Math.min(siblingMessages.length * 2, 30),
            },
        ]);
        index = idx;
    }
    const siblingMessage = getMessageByIndex('.', index % siblingMessages.length);
    if (!siblingMessage) {
        logWarning('Invalid index.');
        return conversation();
    }
    return selectMessage(siblingMessage.id);
}

async function debug(args) {

    console.log(clientOptions);

    // return loadByTree();
    
    // console.log(conversationId);
    // const targetMessage = await getMessageByIndex(args[0], args[1]);
    // console.log(targetMessage.message);

    // return conversation();
}

async function addMessage(message, conversationId = getConversationId()) {
    const convo = await client.conversationsCache.get(conversationId);
    convo.messages.push(message);
    await client.conversationsCache.set(conversationId, convo);
    await pullFromCache();
}

async function concatMessages(newMessages) {
    const convId = getConversationId();
    const { conversationId, messageId } = await client.addMessages(convId, newMessages, conversationData.parentMessageId, true);
    await pullFromCache();
    await setConversationData({
        conversationId,
        parentMessageId: messageId,
    });
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
        newMessages = message.trim();
    }
    if (!newMessages) {
        return conversation();
    }
    await concatMessages(newMessages);
    showHistory();
    return conversation();
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
    // console.log(message);
    await concatMessages(message);
    showHistory();
    return generateMessage();

    // return generateMessage(message);
}

async function editMessage(messageId, args = null) {
    const [pathIndex, branchIndex] = args;
    // const currentMessage = await getCurrentMessage();
    const targetMessage = getMessageByIndex(pathIndex, branchIndex);
    if (!targetMessage) {
        logWarning('Message not found.');
        return conversation();
    }
    const initialMessage = targetMessage.message;
    // console.log(initialMessage);
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
        ...targetMessage,
        message,
        id: crypto.randomUUID(),
    };
    await addMessage(editedMessage);

    logSuccess(`Cloned and edited message ${messageId}.`);

    return selectMessage(editedMessage.id);
}

async function mergeUp() {
    // const messages = await conversationMessages();
    const currentMessage = getCurrentMessage();
    const parentMessage = getParent(localConversation.messages, currentMessage.id);
    if (!parentMessage) {
        logWarning('No parent message.');
        return conversation();
    }
    const newMessage = {
        ...parentMessage,
        message: `${parentMessage.message}${currentMessage.message}`,
        id: crypto.randomUUID(),
    };
    await addMessage(newMessage);
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
    const data = (await client.conversationsCache.get(name)) || {};

    const conversationId = getConversationId(data);

    if (conversationId) {
        await setConversationData({
            ...data,
            conversationId,
        });
        logSuccess(`Resumed ${conversationId} at ${name}.`);
        showHistory();
        return conversation();
    }
    logWarning('Conversation not found.');
    return conversation();
}

async function loadByTree() {
    const conversationsWithSavedStates = await savedStatesByConversation(client.conversationsCache);
    const { conversationId } = await inquirer.prompt([
        {
            type: 'list',
            name: 'conversationId',
            message: 'Select a tree:',
            choices: Object.entries(conversationsWithSavedStates).map(([conversationId, conversationInfo]) => (
                {
                name: `${conversationInfo?.name} (${conversationInfo?.states?.length} saved states)`, 
                value: conversationId,
                }
            )),
            pageSize: Math.min(conversationsWithSavedStates.length * 2, 15),
        },
    ]);
    if (!conversationId) {
        logWarning('No conversation id.');
        return conversation();
    }

    const savedStatesInTree = conversationsWithSavedStates[conversationId].states.map(state => state.name)

    let name;
    const { conversationName } = await inquirer.prompt([
        {
            type: 'list',
            name: 'conversationName',
            message: 'Select a conversation to load:',
            choices: savedStatesInTree,
            pageSize: Math.min(savedStatesInTree.length * 2, 20),
        },
    ]);
    name = conversationName;
    if (!name) {
        logWarning('No conversation name.');
        return conversation();
    }
    return loadConversationState(name);
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
                pageSize: Math.min(savedConversations.length * 2, 20),
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
    // const { messages } = await client.conversationsCache.get(conversationId);
    if (!localConversation.messages) {
        logWarning('Conversation not found.');
        return conversation();
    }
    // conversationData.conversationId = conversationId;
    const lastMessageId = localConversation.messages[messages.length - 1].id;
    // conversationData.parentMessageId = lastMessageId;
    await setConversationData({
        conversationId,
        parentMessageId: lastMessageId,
    });

    logSuccess(`Resumed conversation ${conversationId}.`);
    showHistory();
    return conversation();
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

async function newConversation() {
    conversationData = settings.cliOptions?.conversationData || settings.conversationData || {};
    localConversation.messages = [];
    logSuccess('Started new conversation.');
    return conversation();
}

function getConversationHistoryString() {
    const messageHistory = getHistory();
    if (!messageHistory) {
        return null;
    }
    return client.toTranscript(messageHistory);
}

function isNumeric(value) {
    return /^-?\d+$/.test(value);
}

async function printOrCopyData(action, args = null) {
    if (action !== 'print' && action !== 'copy') {
        logWarning('Invalid action.');
        return conversation();
    }
    let type = null;
    // get first arg that isn't a number and isn't '.'
    if (!args) {
        args = [];
    }
    type = args.find(a => !isNumeric(a));
    // remove type from args
    args = args.filter(a => a !== type);

    if (type === '?' || !type) {
        const { dataType } = await inquirer.prompt([
            {
                type: 'list',
                name: 'dataType',
                message: 'Select a data type:',
                choices: [
                    'text',
                    'response',
                    'responseText',
                    'settings',
                    'transcript',
                    'message',
                    'messages',
                    'messageHistory',
                    'eventLog',
                    'conversationData',
                ],
            },
        ]);
        type = dataType;
    } else if (type === '.') {
        type = 'text';
    }
    const [index, branchIndex] = args;

    const targetMessage = getMessageByIndex(index, branchIndex);
    if (!targetMessage) {
        logWarning('Current message not found.');
        return conversation();
    }
    // if (type === null) {
    //     logWarning('No data type.');
    //     return conversation();
    // }
    let data;
    // let currentMessage;
    switch (type) {
        case 'text':
            data = targetMessage.message;
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
        case 'transcript':
            data = getConversationHistoryString();
            break;
        case 'message':
            data = targetMessage;
            break;
        case 'messages':
            data = localConversation.messages;
            break;
        case 'messageHistory':
            data = getHistory();
            break;
        case 'settings':
            // console.log(`client: ${clientToUse}`);
            // console.log(`\nsettings:\n${JSON.stringify(clientOptions, null, 2)}`);
            data = {
                clientToUse,
                clientOptions,
            };
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
            const dataString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

            if (process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland') {
                const wlCopy = spawn('wl-copy', { stdio: 'pipe' });
                wlCopy.stdin.write(dataString);
                wlCopy.stdin.end();
                wlCopy.on('close', (code) => {
                    if (code === 0) {
                        logSuccess(`Copied ${type} to clipboard.`);
                    } else {
                        logError(`Failed to copy ${type}. Exit code: ${code}`);
                    }
                });
            } else {
                await clipboard.write(dataString);
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
        title: title || client.names.user.display || 'User',
        padding: 0.7,
        margin: {
            top: 1, bottom: 0, left: 2, right: 1,
        },
        float: 'right',
        borderColor: 'blue',
    });
}

function systemMessageBox(message, title = null) {
    return tryBoxen(`${message}`, {
        title: title || 'System',
        padding: 0.7,
        margin: {
            top: 1, bottom: 0, left: 1, right: 2,
        },
        float: 'center',
        borderColor: 'white',
        dimBorder: true,
    });
}

function conversationStart() {
    console.log(tryBoxen(`Start of conversation ${getConversationId()}`, {
        padding: 0.7,
        margin: 2,
        fullscreen: (width, height) => [width - 1, 1],
        borderColor: 'blue',
        borderStyle: 'doubleSingle',
        float: 'center',
        dimBorder: true,
    }));
}

function replaceWhitespace(str) {
    // replaces all space characters with ⠀ to prevent trimming
    return str.replace(/\n /g, '\n⠀');
}

function navButton(node, idx, mainMessageId) { //, savedIds = []) {
    // const navigationHistoryIds = navigationHistory.map(data => data.parentMessageId);
    let buttonString = idx;
    if (node.unvisited) {
        buttonString = buttonString + '*';
    }

    buttonString = node.id === mainMessageId ? `[${buttonString}]` : `${buttonString}`;
    return buttonString;
    // return navigationHistoryIds.includes(node.id) ? chalk.blueBright(`${buttonString}`) : `${buttonString}`
    // return savedIds.includes(node.id) ? chalk.yellow(`${buttonString}`) : navigationHistoryIds.includes(node.id) ? chalk.blueBright(`${buttonString}`) : `${buttonString}`
}

function conversationMessageBox(conversationMessage, index = null) {
    if(conversationMessage.unvisited) {
        // mark as visited
        conversationMessage.unvisited = false;
    }
    const children = getChildren(localConversation.messages, conversationMessage.id);
    const siblings = getSiblings(localConversation.messages, conversationMessage.id);
    // const siblingIndex = getSiblingIndex(messages, conversationMessage.id);
    const aiMessage = Boolean(conversationMessage.role === getAILabel());
    const userMessage = Boolean(conversationMessage.role === client.names.user.display);
    const indexString = index !== null ? `[${index}] ` : '';
    // const savedIds = await getSavedIds(client.conversationsCache);
    const childrenString = children.length > 0 ? ` ── !fw [${children.map((child, idx) => `${idx}`).join(' ')}]` : '';
    const siblingsString = siblings.length > 1 ? ` ── !alt ${siblings.map((sibling, idx) => navButton(sibling, idx, conversationMessage.id)).join(' ')}` : '';
    const messageText = replaceWhitespace(conversationMessage.message);
    return tryBoxen(messageText, {
        title: `${indexString}${conversationMessage.role}${siblingsString}${childrenString}`,
        padding: 0.7,
        margin: {
            top: 1,
            bottom: 0,
            left: userMessage ? 1 : 1,
            right: aiMessage ? 1 : 1,
        },
        dimBorder: true,
        borderColor: aiMessage ? 'white' : (userMessage ? 'blue' : 'green'),
        float: aiMessage ? 'left' : (userMessage ? 'right' : 'center'),
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

function historyBoxes() {
    const messageHistory = getHistory();
    // const messages = await conversationMessages();
    return messageHistory?.map((conversationMessage, index) => conversationMessageBox(conversationMessage, index)).join('\n');
}

function showHistory() {
    const boxes = historyBoxes();
    if (boxes) {
        conversationStart();
        const { systemMessage } = clientOptions.messageOptions;
        if (systemMessage) {
            console.log(systemMessageBox(systemMessage));
        }
        let suggestions = '';
        if (clientToUse === 'bing' && settings.cliOptions?.showSuggestions) {
            const targetMessage = getMessageByIndex();
            const suggestedUserMessages = client.constructor.getUserSuggestions(targetMessage.details?.message);
            if (suggestedUserMessages && suggestedUserMessages.length > 0) {
                suggestions = `\n${suggestionsBoxes(suggestedUserMessages)}`;
            }
        }
        console.log(`${boxes}${suggestions}`);
    }
    pushToCache();
    // return conversation();
}

function getAILabel() {
    return client.names.bot.display || 'Assistant';
}

function getConversationId(data = conversationData) {
    return getCid(data);
}

function getCurrentMessage() {
    if (!conversationData?.parentMessageId) {
        // logWarning('No message id.');
        return [];
    }
    const messages = getHistory();
    return messages.find(message => message.id === conversationData.parentMessageId);
}

async function getCachedConversation() {
    if (!conversationData?.parentMessageId) {
        // logWarning('No message id.');
        return [];
    }
    const _conversation = await client.conversationsCache.get(getConversationId());
    return _conversation;
}

async function pullFromCache() {
    localConversation = await getCachedConversation();
}

async function pushToCache() {
    if (!localConversation || !getConversationId()) {
        return;
    }
    await client.conversationsCache.set(getConversationId(), localConversation);
}


function getHistory() {
    // const messages = await conversationMessages();
    if (!conversationData.parentMessageId) {
        // logWarning('No parent message id.');
        return [];
    }

    const messageHistory = getMessagesForConversation(localConversation.messages, conversationData.parentMessageId);

    return messageHistory;
}

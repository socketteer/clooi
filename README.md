# Bingleton API and CLooI

## Prerequisites
- Node.js >= 16.0.0
- npm


## Install instructions

1. Clone this repository: `git clone https://github.com/socketteer/bingleton-api`
2. Install dependencies with `npm install`

## Bing API

### sendMessage
- `message`: The user message to send to the API. String.
- `opts`: A dictionary of options to configure the API request:
    - `parentMessageId`: The id of the parent message in the conversation. If not provided, the message will be treated as the first message in the conversation.
    - `jailbreakConversationId`: The id of the conversation in the cache. Set to true to start a new conversation.
    - `toneStyle`: Determines the model and changes MSFT's backend settings. 
        - `'creative'`: Prometheus
        - `'precise'`: Deucalion
        - `'balanced'`: Deucalion
        - `'fast'`: probably ChatGPT-3.5
    - `injectionMethod`: Determines how new user messages are injected into the conversation. 
        - `'message'`: Inject new user messages as new messages in the conversation.
        - `'context'`: Inject new user messages the last message in the injected context and set user message to `userMessageInjection` value.
    - `userMessageInjection`: The message to inject into the user message when `injectionMethod` is set to `'context'` or when no user message is provided.
    - `systemMessage`: Text of the system message to append to Bing's instructions under the heading `[system](#additional_instructions)`.
    - `context`: Text of the context to inject into the conversation (acts like web page context)
    - `censoredMessageInjection`: String to append to messages that get cut off by Bing's filter in the conversation history.
- `appendMessages`: optional array of messages or string in standard format to append to the conversation history. Messages will be appended in the order they are provided, and before the user message.

## CLooI instructions

The CLI (Command Loom Interface) app allows you to interact with the API using a command line interface and save and load (branching) conversation histories. 

### Running the CLI app

```bash
npm run cli
```

### Commands

Running the app will prompt you to enter a message. 

You can also enter commands (prepended with `!`). Entering `!` will show the list of currently available commands. 

The following commands may be available:

- `!editor`: Open the editor (for multi-line messages)
- `!resume`: Resume last conversation
- `!new`: Start new conversation
- `!gen`: Generate a response (without sending a user message)
- `!retry`: Regenerate the last response
- `!rewind [INDEX]`: Rewind conversation to a previous message. 
    - `[INDEX]`: index of the message to rewind to (if positive), or the number of messages to rewind (if negative). If not provided, shows a prompt to select a message to rewind to.
- `!child [INDEX]`: Navigate to a child message. 
    - `[INDEX]`: index of the child message to navigate to. (default: 0)
- `!alt [INDEX]`: Navigate to an alternate message. 
    - `[INDEX]`: index of the alternate (sibling) message to navigate to. If not provided, shows a prompt to select an alternate message.
- `!up`: Navigate to the parent message
- `!down`: Navigate to the first child message
- `!right`: Navigate to the next sibling message
- `!left`: Navigate to the previous sibling message
- `!copy [TYPE]`: Copy data to clipboard. 
    - `[TYPE]`: type of data to copy. If not provided, shows a prompt to select the type of data to copy.
- `!print [TYPE]`: Print data to console.
    - `[TYPE]`: type of data to print. If not provided, shows a prompt to select the type of data to print.
- `!history`: Show conversation history in console
- `!save [NAME]`: Save conversation state. 
    - `[NAME]`: name to save the conversation state with. If not provided, shows a prompt to enter a name.
- `!load [NAME]`: Load conversation state.
    - `[NAME]`: name of the conversation state to load. If not provided, shows a prompt to select a conversation state to load.
- `!open ID`: Load a saved conversation by id.
    - `ID`: id of the conversation state to load.
- `!reload`: Reload settings
- `!delete-all`: Delete all conversations
- `!exit`: Exit CLoomI
- `!debug`: Run debug command


### Options

### cliOptions

- `clientToUse`: The API client to use. 
    - `'bing'`: Use the Bing API client
    - `'chatgpt'`: Use the chatGPT API client (Not yet tested)
    - `'infrastruct'`: Use the Infrastruct API client (Not yet implemented)
- `showSuggestions`: Whether to show user suggestions after Bing messages.
- `conversationData`: Dictionary of options to configure API request (for Bing API)

#### Changing default options

The default options for the CLI app are stored in `settings.js`, under `cliOptions`. You can change the default options by modifying this file. These options will load by default when you run the CLI app or when you run the `!reload` command.

The default system prompt and context are stored in `bingContext/systemPrompt.txt` and `bingContext/context.txt` respectively. You can change these files to change the default system prompt and context, or set different strings or point to different files in `settings.js`.


# Problems

- reloading settings doesn't update settings
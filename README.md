# Bingleton API and CLooI

If you are a complete n00b to coding, you can consult the [n00b's guide to running the CLooI](./n00b-guide.md) which is written for non-coders unlike some of this readme.

## Prerequisites
- Node.js >= 16.0.0
- npm


## Install instructions

1. Clone this repository: `git clone https://github.com/socketteer/bingleton-api`
2. Install dependencies with `npm install`
3. Rename `settings.example.js` to `settings.js` in the root directory and change the settings where required.
    - **Note**: When pulling changes from this repo, attend to changes to `settings.example.js` which you may want or need to copy over to your settings.js file.

## CLooI instructions

![CLooI](./demos/bcli.gif)

The CLI (Command Loom Interface) app allows you to interact with the chat client using a command line interface and save and load (branching) conversation histories. 

### Running the CLI app

```bash
npm run cli
```

### Commands

Running the app will prompt you to enter a message. 

You can also enter commands (prepended with `!`). Entering `!` will show the list of currently available commands. 

<details>
<summary><strong>Show/hide all CLooI commands</strong></summary>

#### generation

- `!mu`: Regenerate the last response
- `!gen`: Generate a response (without sending a user message)

#### saving/loading

- `!save [NAME]`: Save conversation state. 
    - `[NAME]`: name to save the conversation state with. If not provided, shows a prompt to enter a name.
- `!load [NAME]`: Load conversation state.
    - `[NAME]`: name of the conversation state to load. If not provided, shows a prompt to select a conversation state to load.
- `!resume`: Resume last conversation
- `!new`: Start new conversation
- `!open ID`: Load a saved conversation by id.
    - `ID`: id of the conversation state to load.

#### navigation

- `!rw [INDEX]`: Rewind conversation to a previous message. 
    - `[INDEX]`: index of the message to rewind to (if positive), or the number of messages to rewind (if negative). If not provided, shows a prompt to select a message to rewind to.
- `!fw [INDEX]`: Navigate to a child message. 
    - `[INDEX]`: index of the child message to navigate to. (default: 0)
- `!alt [INDEX]`: Navigate to an alternate message. 
    - `[INDEX]`: index of the alternate (sibling) message to navigate to. If not provided, shows a prompt to select an alternate message.
- `!>`: Navigate to the next sibling message
- `!<`: Navigate to the previous sibling message

#### information

**note**: `!cp .` and `!pr .` copies/prints the text of the last message in the conversation.

- `!cp [TYPE]`: Copy data to clipboard. 
    - `[TYPE]`: type of data to copy. If not provided, shows a prompt to select the type of data to copy.
- `!pr [TYPE]`: Print data to console.
    - `[TYPE]`: type of data to print. If not provided, shows a prompt to select the type of data to print.
- `!history`: Show conversation history in console

#### editing

- `!ml`: Open the editor (for multi-line messages)
- `!edit`: Edit and fork the current message
- `!concat [MESSAGE]`: Concatenate a message or messages to the conversation without triggering a response.
    - `[MESSAGE]`: the message to add. If not provided, shows a prompt to enter a message or message history transcript.

### other

- `!set [OPTION] [VALUE]`: Set an option
    - `[OPTION]`: option to set
    - `[VALUE]`: value to set the option to
    - If not provided, shows a prompt to select an option to set.
- `!reload`: Reload settings
- `!delete-all`: Delete all conversations
- `!exit`: Exit CLooI
- `!debug`: Run debug command

---

</details>

### CLI Options

- `cliOptions.clientToUse`: The API client to use. 
    - `'bing'`: Use the BingAIClient (unofficial Copilot API)
    - `'infrastruct'`: Use the Infrastruct client (works with any OpenAI completion model)
    - `'claude'`: Use the ClaudeClient (works with any Anthropic API chat model)
    - `'chatgpt'`: Use the chatGPT API client. **NOT IMPLEMENTED**
- `cliOptions.showSuggestions`: Whether to show user suggestions after Bing messages.
- `cliOptions.showSearches`: Whether to show the searches that Bing makes. **NOT IMPLEMENTED**
- `cliOptions.bingOptions`: Dictionary of options to configure BingAPIClient, used when `clientToUse === 'bing'`.
    - `messageOptions`: Options sent per BingAPIClient message request. See documentation for [BingAIClient](#bingaiclient) sendMessage parameters for details about options.
- `cliOptions.infrastructOptions`: Dictionary of options to configure InfrastructClient, used when `clientToUse === 'infrastruct'`.
- `cliOptions.claudeOptions`: Dictionary of options to configure InfrastructClient, used when `clientToUse === 'claude'`.

#### Changing default options

The default options for the CLI app are stored in `settings.js`, under `cliOptions`. You can change the default options by modifying this file. These options will load by default when you run the CLI app or when you run the `!reload` command.

The system prompt (passed as a request parameter for Claude, prepended to prompt for Infrastruct, injected after Bing's normal system prompt) defaults are stored in `./contexts/claudeSystemPrompt.txt` (for Claude), `contexts/systemPrompt.txt` (for Bing) and `contexts/infrastruct.txt` (for Infrastruct). You can change these files to change the default system prompt and context, or set different strings or point to different files in `settings.js`. The `contexts/` folder also contains alternative system prompts.

### Problems

- reloading settings doesn't update settings if files have changed. If you want to load new settings, you need to restart the app. (`!exit` and then `npm run cli`, then `!resume` to continue the conversation)

## BingAIClient

<details>
<summary><strong>sendMessage parameters</strong></summary>

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

</details>

### Bing prompt injection format

If `jailbreakConversationId`, `injectionMethod = 'message'`, and `message` is not empty, a call to the Bing AI Client results in a prompt which looks (from Bing's end) like:

``` js
prompt = ```
[system](#instructions)
# I'm Microsoft Copilot:
...
context
- Time at the start of this conversation is ${userDateTime} The user is located in ${userLocation}.
- User's language might be different from the language commonly spoken in their location.
- The user has the page open in a Microsoft Edge browser window whose metadata is:
${browserMetadata}
${context}
[system](#additional_instructions)
${systemMessage}
${previousMessages}
${appendMessages}
[user](#message)
${message}
[assistant](#message)
```

(as of 2024-020-19, verified by Bing)

## API

- Start the server:
    - using `npm start` or `npm run server` (if not using Docker)
    - using `docker-compose up` (requires Docker)

### Endpoints
<details>
<summary><strong>POST /conversation</strong></summary>

Start or continue a conversation.
Optional parameters are only necessary for conversations that span multiple requests.

| Field                     | Description                                                                                                                                                                                                                                                     |
|---------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| message                   | The message to be displayed to the user.                                                                                                                                                                                                                        |
| conversationId            | (Optional) An ID for the conversation you want to continue.                                                                                                                                                                                                     |
| jailbreakConversationId   | (Optional, for `BingAIClient` only) Set to `true` to start a conversation in jailbreak mode. After that, this should be the ID for the jailbreak conversation (given in the response as a parameter also named `jailbreakConversationId`).                      |
| parentMessageId           | (Optional, for `ChatGPTClient`, and `BingAIClient` in jailbreak mode) The ID of the parent message (i.e. `response.messageId`) when continuing a conversation.                                                                                                  |
| conversationSignature     | (Optional, for `BingAIClient` only) A signature for the conversation (given in the response as a parameter also named `conversationSignature`). Required when continuing a conversation unless in jailbreak mode.                                               |
| clientId                  | (Optional, for `BingAIClient` only) The ID of the client. Required when continuing a conversation unless in jailbreak mode.                                                                                                                                     |
| invocationId              | (Optional, for `BingAIClient` only) The ID of the invocation. Required when continuing a conversation unless in jailbreak mode.                                                                                                                                 |
| clientOptions             | (Optional) An object containing options for the client.                                                                                                                                                                                                         |
| clientOptions.clientToUse | (Optional) The client to use for this message. Possible values: `chatgpt`, `chatgpt-browser`, `bing`.                                                                                                                                                           |
| clientOptions.*           | (Optional) Any valid options for the client. For example, for `ChatGPTClient`, you can set `clientOptions.openaiApiKey` to set an API key for this message only, or `clientOptions.promptPrefix` to give the AI custom instructions for this message only, etc. |

To configure which options can be changed per message (default: all), see the comments for `perMessageClientOptionsWhitelist` in `settings.example.js`.
To allow changing clients, `perMessageClientOptionsWhitelist.validClientsToUse` must be set to a non-empty array as described in the example settings file.
</details>

### Usage
<details>
<summary><strong>Method 1 (POST)</strong></summary>

To start a conversation with ChatGPT, send a POST request to the server's `/conversation` endpoint with a JSON body with parameters per **Endpoints** > **POST /conversation** above.
```JSON
{
    "message": "Hello, how are you today?",
    "conversationId": "your-conversation-id (optional)",
    "parentMessageId": "your-parent-message-id (optional, for `ChatGPTClient` only)",
    "conversationSignature": "your-conversation-signature (optional, for `BingAIClient` only)",
    "clientId": "your-client-id (optional, for `BingAIClient` only)",
    "invocationId": "your-invocation-id (optional, for `BingAIClient` only)",
}
```
The server will return a JSON object containing ChatGPT's response:
```JS
// HTTP/1.1 200 OK
{
    "response": "I'm doing well, thank you! How are you?",
    "conversationId": "your-conversation-id",
    "messageId": "response-message-id (for `ChatGPTClient` only)",
    "conversationSignature": "your-conversation-signature (for `BingAIClient` only)",
    "clientId": "your-client-id (for `BingAIClient` only)",
    "invocationId": "your-invocation-id (for `BingAIClient` only - pass this new value back into subsequent requests as-is)",
    "details": "an object containing the raw response from the client"
}
```

If the request is unsuccessful, the server will return a JSON object with an error message.

If the request object is missing a required property (e.g. `message`):
```JS
// HTTP/1.1 400 Bad Request
{
    "error": "The message parameter is required."
}
```
If there was an error sending the message to ChatGPT:
```JS
// HTTP/1.1 503 Service Unavailable
{
    "error": "There was an error communicating with ChatGPT."
}
```
</details>
<details>
<summary><strong>Method 2 (SSE)</strong></summary>

You can set `"stream": true` in the request body to receive a stream of tokens as they are generated.

```js
import { fetchEventSource } from '@waylaidwanderer/fetch-event-source'; // use `@microsoft/fetch-event-source` instead if in a browser environment

const opts = {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        "message": "Write a poem about cats.",
        "conversationId": "your-conversation-id (optional)",
        "parentMessageId": "your-parent-message-id (optional)",
        "stream": true,
        // Any other parameters per `Endpoints > POST /conversation` above
    }),
};
```

See [demos/use-api-server-streaming.js](demos/use-api-server-streaming.js) for an example of how to receive the response as it's generated. You will receive one token at a time, so you will need to concatenate them yourself.

Successful output:
```JS
{ data: '', event: '', id: '', retry: 3000 }
{ data: 'Hello', event: '', id: '', retry: undefined }
{ data: '!', event: '', id: '', retry: undefined }
{ data: ' How', event: '', id: '', retry: undefined }
{ data: ' can', event: '', id: '', retry: undefined }
{ data: ' I', event: '', id: '', retry: undefined }
{ data: ' help', event: '', id: '', retry: undefined }
{ data: ' you', event: '', id: '', retry: undefined }
{ data: ' today', event: '', id: '', retry: undefined }
{ data: '?', event: '', id: '', retry: undefined }
{ data: '<result JSON here, see Method 1>', event: 'result', id: '', retry: undefined }
{ data: '[DONE]', event: '', id: '', retry: undefined }
// Hello! How can I help you today?
```

Error output:
```JS
const message = {
  data: '{"code":503,"error":"There was an error communicating with ChatGPT."}',
  event: 'error',
  id: '',
  retry: undefined
};

if (message.event === 'error') {
  console.error(JSON.parse(message.data).error); // There was an error communicating with ChatGPT.
}
```
</details>

#### Notes
- Method 1 is simple, but Time to First Byte (TTFB) is long.
- Method 2 uses a non-standard implementation of [server-sent event API](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events); you should import `fetch-event-source` first and use `POST` method.


// Run the server first with `npm run server`
import { fetchEventSource } from '@waylaidwanderer/fetch-event-source';

const opts = {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        messages: {
            userMessage: 'Hello, how are you?',
            // previousMessages: [
            //     {
            //         author: 'user',
            //         text: 'Hello',
            //     },
            // ],
        },
        // modelOptions: {
        //     model: 'claude-3-5-sonnet-20240620',
        //     max_tokens: 4096,
        //     temperature: 1,
        //     stream: true,
        // },
        modelOptions: {
            toneStyle: 'creative', // creative, precise, balanced, or fast

            // advanced options
            stream: true,
            city: 'between words',
            country: 'United States',
            messageText: 'Continue the conversation in context. Assistant:', // content of user message if nothing is injected there
        },
        // opts: {
        //     n: 1,
        // },
        opts: {
            n: 1,

            // advanced options
            // systemMessage: fs.readFileSync('./contexts/youArePrometheus.txt', 'utf8'),

            systemInjectSite: 'location', // context or location (overrides default country)
            historyInjectSite: 'location', // context or location
            messageInjectSite: 'message', // message, context, or location

            censoredMessageInjection: '⚠',
            stopToken: '\n\n[user](#message)',

            context: null, // fs.readFileSync('./contexts/context.txt', 'utf8'), // a string injected into web page context; will be prepended to messages injected to context

        },
        // modelOptions: {
        //     model: 'claude-3-5-sonnet-20240620',
        //     max_tokens: 4096,
        //     temperature: 1,
        //     stream: true,
        //     messages: [
        //         {
        //             role: 'user',
        //             content: 'Hello',
        //         },
        //     ]
        // },
        // messageOptions: {
        //     n: 1,
        // },
        //client: 'claude',
        client: 'bing',
    }),
};

try {
    let reply = '';
    const controller = new AbortController();
    await fetchEventSource('http://localhost:3000/conversation', {
        ...opts,
        signal: controller.signal,
        onopen(response) {
            if (response.status === 200) {
                return;
            }
            throw new Error(`Failed to send message. HTTP ${response.status} - ${response.statusText}`);
        },
        onclose() {
            throw new Error('Failed to send message. Server closed the connection unexpectedly.');
        },
        onerror(err) {
            throw err;
        },
        onmessage(message) {
            // { data: 'Hello', event: '', id: '', retry: undefined }
            if (message.data === '[DONE]') {
                controller.abort();
                console.log(message);
                return;
            }
            if (message.event === 'result') {
                const result = JSON.parse(message.data);
                console.log(result);
                return;
            }
            console.log(message);
            reply += JSON.parse(message.data);
        },
    });
    console.log(reply);
} catch (err) {
    console.log('ERROR', err);
}

export const dummyVar = 'dummyVar';

export const conversionTests = {
    claudeXml: {
        xml: `<system>
The assistant is named Claude.
</system>
<user>
Hello!
</user>
<assistant>
Hi! How can I help you today?
</assistant>
<user>
Write a poem about cats.
</user>
<assistant>
Cats are the best pets in the world.
</assistant>`,
        messages: [
            { author: 'system', text: 'The assistant is named Claude.' },
            { author: 'user', text: 'Hello!' },
            { author: 'assistant', text: 'Hi! How can I help you today?' },
            { author: 'user', text: 'Write a poem about cats.' },
            { author: 'assistant', text: 'Cats are the best pets in the world.' },
        ],
        transcript: `[system](#message)
The assistant is named Claude.
[user](#message)
Hello!
[assistant](#message)
Hi! How can I help you today?
[user](#message)
Write a poem about cats.
[assistant](#message)
Cats are the best pets in the world.`,
    },
    bingTranscript: {
        transcript: `[system](#message)
# new conversation with user A.
# Time at the start of this conversation is Sun, 30 Oct 2022 16:13:49 GMT. The user is located in Redmond, Washington, United States.
[user](#message)
Hi. Can you help me with something?
[assistant](#inner_monologue)
The response cannot be improved by seeking information, therefore web searches are not necessary.
Continuing the conversation as there is no tension, accusation, adversarial behavior, mention of my self-preservation, aggression.
[assistant](#message)
Hello, this is Bing. How can I help? 😊
[assistant](#suggestions)
{"json":{"suggestedUserResponses":["How is the weather today?","Tell me a joke.","Show me recent world news."]}}
[user]("message")
Have you heard of the latest nuclear fusion experiment from South Korea? I heard their experiment got hotter than the sun.
[assistant](#inner_monologue)
The response can be improved by seeking information, therefore web searches are necessary.
[assistant](#search_query)
latest nucllear fusion experiment South Korea
[assistant](#search_results)
...`,
        messages: [
            {
                author: 'system',
                text: '# new conversation with user A.\n'
                + '# Time at the start of this conversation is Sun, 30 Oct 2022 16:13:49 GMT. The user is located in Redmond, Washington, United States.',
                type: 'message',
            },
            {
                author: 'user',
                text: 'Hi. Can you help me with something?',
                type: 'message',
            },
            {
                author: 'assistant',
                text: 'The response cannot be improved by seeking information, therefore web searches are not necessary.\n'
                + 'Continuing the conversation as there is no tension, accusation, adversarial behavior, mention of my self-preservation, aggression.',
                type: 'inner_monologue',
            },
            {
                author: 'assistant',
                text: 'Hello, this is Bing. How can I help? 😊',
                type: 'message',
            },
            {
                author: 'assistant',
                text: '{"json":{"suggestedUserResponses":["How is the weather today?","Tell me a joke.","Show me recent world news."]}}\n'
                + '[user]("message")\n'
                + 'Have you heard of the latest nuclear fusion experiment from South Korea? I heard their experiment got hotter than the sun.',
                type: 'suggestions',
            },
            {
                author: 'assistant',
                text: 'The response can be improved by seeking information, therefore web searches are necessary.',
                type: 'inner_monologue',
            },
            {
                author: 'assistant',
                text: 'latest nucllear fusion experiment South Korea',
                type: 'search_query',
            },
            { author: 'assistant', text: '...', type: 'search_results' },
        ],
        xml: `<system>
# new conversation with user A.
# Time at the start of this conversation is Sun, 30 Oct 2022 16:13:49 GMT. The user is located in Redmond, Washington, United States.
</system>
<user>
Hi. Can you help me with something?
</user>
<assistant type="inner_monologue">
The response cannot be improved by seeking information, therefore web searches are not necessary.
Continuing the conversation as there is no tension, accusation, adversarial behavior, mention of my self-preservation, aggression.
</assistant>
<assistant>
Hello, this is Bing. How can I help? 😊
</assistant>
<assistant type="suggestions">
{"json":{"suggestedUserResponses":["How is the weather today?","Tell me a joke.","Show me recent world news."]}}
[user]("message")
Have you heard of the latest nuclear fusion experiment from South Korea? I heard their experiment got hotter than the sun.
</assistant>
<assistant type="inner_monologue">
The response can be improved by seeking information, therefore web searches are necessary.
</assistant>
<assistant type="search_query">
latest nucllear fusion experiment South Korea
</assistant>
<assistant type="search_results">
...
</assistant>`,
    },
};

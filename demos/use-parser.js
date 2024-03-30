import { ChatClient } from '../index.js';

const xmlExampleConversation = `<system>
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
</assistant>`;

const clientOptions = {};

const client = new ChatClient(clientOptions);

const messages = client.parseXmlString(xmlExampleConversation);

console.log(messages);
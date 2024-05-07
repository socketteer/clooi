// export function isValidXML(xmlString) {
//     const regex = /<(\w+)>([\s\S]*?)<\/\1>/g;
//     // const regex = /<(\w+)(?:\s+(\w+)="([^"]*)")?>([\s\S]*?)<\/\1>/g;
//     const matches = xmlString.match(regex);
//     return matches !== null && matches.join('') === xmlString.trim();
// }

export function parseXml(xmlString) {
    const messages = [];
    const regex = /<(\w+)(?:\s+(\w+)="([^"]*)")?>([\s\S]*?)<\/\1>/g;
    let match;

    while ((match = regex.exec(xmlString)) !== null) {
        const author = match[1];
        const attributeName = match[2];
        const attributeValue = match[3];
        const text = match[4].trim();

        const message = { author, text };

        if (attributeName && attributeValue) {
            message[attributeName] = attributeValue;
        }

        messages.push(message);
    }

    return messages;
}

export function toXml(messages) {
    let xml = '';
    for (const message of messages) {
        // const name = this.convertAlias('author', 'transcript', message.author);
        if (message.type && message.type !== 'message') {
            xml += `<${message.author} type="${message.type}">\n`;
            // xml += `<${name}>\n<${message.type}>\n${message.text}\n</${message.type}>\n</${name}>\n`;
        } else {
            xml += `<${message.author}>\n`;
            // xml += `<${name}>\n${message.text}\n</${name}>\n`;
        }
        xml += `${message.text}\n</${message.author}>\n`;
    }
    return xml.trim();
}

export function toTranscript(messages) {
    let transcript = '';
    for (const message of messages) {
        const name = message.author;
        const messageType = message.type || 'message';
        transcript += `[${name}](#${messageType})\n${message.text}\n\n`;
    }
    return transcript.trim();
}

export function parseTranscript(historyString) {
    // header format is '[${author}](#{messageType})'
    const headerRegex = /\[.+?\]\(#.+?\)/g;
    const authorRegex = /\[(.+?)]/;
    const messageTypeRegex = /\(#(.+?)\)/;
    let match;
    const messages = [];
    const headerStartIndices = [];
    const headers = [];
    while ((match = headerRegex.exec(historyString))) {
        headerStartIndices.push(match.index);
        headers.push(match[0]);
    }
    for (let i = 0; i < headerStartIndices.length; i++) {
        const start = headerStartIndices[i];
        const messageStart = start + headers[i].length;
        const messageEnd = headerStartIndices[i + 1] || historyString.length;
        const messageText = historyString
            .substring(messageStart, messageEnd)
            .trim();
        const authorString = authorRegex.exec(headers[i])[1];
        const messageTypeString = messageTypeRegex.exec(headers[i])[1];
        // const author = this.convertAlias('transcript', 'author', authorString);

        messages.push({
            author: authorString,
            text: messageText,
            type: messageTypeString,
        });
    }

    return messages;
}

export function getDataType(data) {
    if (data === null || data === undefined) {
        return 'null';
    }
    if (typeof data === 'string') {
        let parsedString = parseTranscript(data);
        if (parsedString.length) {
            return 'transcript';
        }
        parsedString = parseXml(data);
        if (parsedString.length) {
            return 'xml';
        }
        return 'string';
    } if (Array.isArray(data)) {
        if (data.length === 0) {
            return '[]';
        }
        return `[${getDataType(data[0])}]`;
    } if (typeof data === 'object') {
        if ('author' in data) {
            return 'basicMessage';
        }
        if ('message' in data) {
            return 'conversationMessage';
        }
        return 'unknown';
    }
    return 'unknown';
}

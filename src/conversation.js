/**
 * Iterate through messages, building an array based on the parentMessageId.
 * Each message has an id and a parentMessageId. The parentMessageId is the id of the message that this message is a reply to.
 * @param messages
 * @param messageId
 * @returns {*[]} An array containing the messages in the order they should be displayed, starting with the root message.
 */
export function getMessagesForConversation(messages, messageId) {
    const messageHistory = [];
    let currentMessageId = messageId;
    while (currentMessageId) {
        // eslint-disable-next-line no-loop-func
        const message = getMessageById(messages, currentMessageId);
        if (!message) {
            break;
        }
        messageHistory.unshift(message);
        currentMessageId = message.parentMessageId;
    }

    return messageHistory;
}

export function getMessageById(messages, messageId) {
    return messages.find(m => m.id === messageId);
}

export function getChildren(messages, messageId) {
    return messages.filter(m => m.parentMessageId === messageId);
}

export function getSiblings(messages, messageId) {
    const message = messages.find(m => m.id === messageId);
    if (!message) {
        return [];
    }
    return getChildren(messages, message.parentMessageId);
}

export function getSiblingIndex(messages, messageId) {
    return getSiblings(messages, messageId).findIndex(m => m.id === messageId);
}

export function getParent(messages, messageId) {
    const message = messages.find(m => m.id === messageId);
    if (!message) {
        return null;
    }
    return messages.find(m => m.id === message.parentMessageId);
}

export function getCid(data) {
    const convId = data.conversationId || data.jailbreakConversationId;
    if (!convId) {
        return null;
    }
    return convId;
}


export async function getSavedStatesForConversation(conversationsCache, conversationId) {
    const savedConversations = await conversationsCache.get('savedConversations') || [];
    const savedStates = [];
    for (const name of savedConversations) {
        const conversationData = conversationsCache.get(name) || {};
        if (conversationData && getCid(conversationData) === conversationId) {
            savedStates.push({ name, conversationData });
        }
    }
    return savedStates;
}

export async function savedStatesByConversation(conversationsCache) {
    const savedConversations = await conversationsCache.get('savedConversations') || [];
    const savedStatesByConversation = {};
    for (const stateName of savedConversations) {
        const conversationData = await conversationsCache.get(stateName) || {};
        const conversationId = getCid(conversationData);
        if (!conversationId) {
            continue
        }
        if (!savedStatesByConversation[conversationId]) {
            const conversation = await conversationsCache.get(conversationId) || {};
            // const createdAtDate = new Date(conversation.createdAt);
            // const conversationName = conversation.name || createdAtDate.toLocaleString();
            const firstMessage = conversation.messages[0];
            const conversationName = conversation.name || firstMessage.message?.substring(0, 50);

            savedStatesByConversation[conversationId] = {
                name: conversationName,
                states: [],
            };
        }
        savedStatesByConversation[conversationId].states.push({ name: stateName, conversationData });
    }
    return savedStatesByConversation;
}

export async function getSavedIds(conversationsCache) {
    const savedNames = await conversationsCache.get('savedConversations') || [];
    const savedIds = [];
    for (const name of savedNames) {
        const conversationData = await conversationsCache.get(name) || {};
        const conversationId = getCid(conversationData);
        if (conversationId) {
            savedIds.push(conversationId);
        }
    }
    return savedIds;
}
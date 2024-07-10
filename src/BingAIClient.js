import './fetch-polyfill.js';
import crypto from 'crypto';
import WebSocket from 'ws';
// import Keyv from 'keyv';
import { Agent, ProxyAgent } from 'undici';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { BingImageCreator } from '@timefox/bic-sydney';
import ChatClient from './ChatClient.js';
import { requestOptions, newConversationHeaders, bingCookie } from './bingConfig.js';
/**
 * https://stackoverflow.com/a/58326357
 * @param {number} size
 */
const genRanHex = size => [...Array(size)]
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join('');

const BING_PARTICIPANTS = {
    bot: {
        display: 'Bing',
        author: 'assistant',
        defaultMessageType: 'message',
    },
    system: {
        display: 'System',
        author: 'system',
        defaultMessageType: 'additional_instructions',
    },
};

const BING_DEFAULT_MODEL_OPTIONS = {
    toneStyle: 'creative', // creative, precise, balanced, or fast
    stream: true,

    city: 'Redmond, Washington',
    country: 'United States',
    messageText: 'Continue the conversation in context. Assistant:', // content of user message if nothing is injected there
};

export default class BingAIClient extends ChatClient {
    constructor(options) {
        options.cache.namespace = options.cache.namespace || 'bing';
        super(options);
        this.modelOptions = BING_DEFAULT_MODEL_OPTIONS;
        this.participants = BING_PARTICIPANTS;
        this.stopToken = '\n\n[user](#message)';
        this.setOptions(options);
    }

    setOptions(options) {
        // don't allow overriding cache options for consistency with other clients
        // delete options.cache;
        super.setOptions(options);
        this.options = {
            ...options,
            host: options.host || 'https://www.bing.com',
            xForwardedFor: this.constructor.getValidIPv4(
                options.xForwardedFor,
            ),
            features: {
                genImage: true,
                // genImage: false,
                // genImage: options?.features?.genImage || false,
            },
        };
        if (this.options.features.genImage) {
            this.bic = new BingImageCreator(this.options);
        }
    }

    static getValidIPv4(ip) {
        const match = !ip
            || ip.match(
                /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/([0-9]|[1-2][0-9]|3[0-2]))?$/,
            );
        if (match) {
            if (match[5]) {
                const mask = parseInt(match[5], 10);
                let [a, b, c, d] = ip.split('.').map(x => parseInt(x, 10));
                // eslint-disable-next-line no-bitwise
                const max = (1 << (32 - mask)) - 1;
                const rand = Math.floor(Math.random() * max);
                d += rand;
                c += Math.floor(d / 256);
                d %= 256;
                b += Math.floor(c / 256);
                c %= 256;
                a += Math.floor(b / 256);
                b %= 256;
                return `${a}.${b}.${c}.${d}`;
            }
            return ip;
        }
        return undefined;
    }

    async createNewConversation() {
        this.headers = {
            ...newConversationHeaders,
            'sec-ms-gec': genRanHex(64).toUpperCase(),
            'x-ms-client-request-id': crypto.randomUUID(),
            cookie: this.options.cookies || bingCookie,
            // Workaround for request being blocked due to geolocation
            // 'x-forwarded-for': '1.1.1.1', // 1.1.1.1 seems to no longer work.
            ...(this.options.xForwardedFor
                ? { 'x-forwarded-for': this.options.xForwardedFor }
                : {}),
        };
        // filter undefined values
        this.headers = Object.fromEntries(
            Object.entries(this.headers).filter(
                ([, value]) => value !== undefined,
            ),
        );

        const fetchOptions = {
            headers: this.headers,
        };
        if (this.options.proxy) {
            fetchOptions.dispatcher = new ProxyAgent(this.options.proxy);
        } else {
            fetchOptions.dispatcher = new Agent({
                connect: { timeout: 20_000 },
            });
        }
        const response = await fetch(
            // `${this.options.host}/turing/conversation/create?bundleVersion=1.864.15`,
            `${this.options.host}/turing/conversation/create?bundleVersion=1.1626.5`,
            fetchOptions,
        );
        const body = await response.text();
        try {
            const res = JSON.parse(body);
            res.encryptedConversationSignature = response.headers.get(
                'x-sydney-encryptedconversationsignature',
            ) ?? null;
            if (
                !res.encryptedConversationSignature
                || !res.conversationId
                || !res.clientId
            ) {
                const resultValue = res.result?.value;
                if (resultValue) {
                    const e = new Error(
                        res.result.message,
                    ); // default e.name is 'Error'
                    e.name = resultValue; // such as "UnauthorizedRequest"
                    throw e;
                }
                throw new Error(
                    `Unexpected response:\n${JSON.stringify(
                        res,
                        null,
                        2,
                    )}`,
                );
            }
            return res;
        } catch (err) {
            throw new Error(
                `/turing/conversation/create: failed to parse response body.\n${body}`,
            );
        }
    }

    async createWebSocketConnection(encryptedConversationSignature) {
        return new Promise((resolve, reject) => {
            let agent;
            if (this.options.proxy) {
                agent = new HttpsProxyAgent(this.options.proxy);
            }

            const ws = new WebSocket(
                `wss://sydney.bing.com/sydney/ChatHub?sec_access_token=${encodeURIComponent(
                    encryptedConversationSignature,
                )}`,
                { agent, headers: this.headers },
            );

            ws.on('error', err => reject(err));

            ws.on('open', () => {
                if (this.debug) {
                    console.debug('performing handshake');
                }
                ws.send('{"protocol":"json","version":1}');
            });

            ws.on('close', () => {
                if (this.debug) {
                    console.debug('disconnected');
                }
            });

            ws.on('message', (data) => {
                const objects = data.toString().split('');
                const messages = objects
                    .map((object) => {
                        try {
                            return JSON.parse(object);
                        } catch (error) {
                            return object;
                        }
                    })
                    .filter(message => message);
                if (messages.length === 0) {
                    return;
                }
                if (
                    typeof messages[0] === 'object'
                    && Object.keys(messages[0]).length === 0
                ) {
                    if (this.debug) {
                        console.debug('handshake established');
                    }
                    // ping
                    ws.bingPingInterval = setInterval(() => {
                        ws.send('{"type":6}');
                        // same message is sent back on/after 2nd time as a pong
                    }, 15 * 1000);
                    resolve(ws);
                    return;
                }
                if (this.debug) {
                    console.debug(JSON.stringify(messages));
                    console.debug();
                }
            });
        });
    }

    static cleanupWebSocketConnection(ws) {
        clearInterval(ws.bingPingInterval);
        ws.close();
        ws.removeAllListeners();
    }

    static bingRequest(options) {
        const {
            messageText = 'Continue the conversation in context. Assistant:',
            toneStyle = 'creative',
            city = 'Redmond, Washington',
            country = 'United States',
            contextDescription = null,
            sourceName = null,
            sourceUrl = null,
            conversationId,
            clientId,
            encryptedConversationSignature,
            invocationId = 0,
            saveMem = false,
        } = options;

        let tone;
        switch (toneStyle.toLowerCase()) {
            case 'creative': tone = 'CreativeClassic'; break;
            case 'precise': tone = 'h3precise'; break;
            case 'fast': tone = 'galileo'; break;
            case 'balanced': tone = 'harmonyv3'; break;
            default: tone = toneStyle;
        }

        return {
            arguments: [
                {
                    ...requestOptions(saveMem, this.genImage),
                    isStartOfSession: invocationId === 0,
                    traceId: genRanHex(32),
                    message: {
                        author: 'user',
                        text: messageText,
                        messageType: 'Chat',
                        locationInfo: {
                            // State: 'California',
                            City: city,
                            Country: country,
                            CountryConfidence: 9,
                            CityConfidence: 9,
                        },
                    },
                    tone,
                    extraExtensionParameters: {
                        'gpt-creator-persona': { personaId: 'copilot' },
                    },
                    spokenTextMode: 'None',
                    encryptedConversationSignature,
                    conversationId,
                    participant: {
                        id: clientId,
                    },
                    ...((contextDescription || sourceName || sourceUrl) ? {
                        previousMessages: [{
                            author: 'user',
                            description: contextDescription || '',
                            contextType: 'WebPage',
                            messageType: 'Context',
                            messageId: 'discover-web--page-ping-mriduna-----',
                            ...sourceName ? { sourceName } : {},
                            ...sourceUrl ? { sourceUrl } : {},
                        }],
                    } : {}),
                },
            ],
            invocationId: invocationId.toString(),
            target: 'chat',
            type: 4,
        };
    }

    buildApiParams(userMessage, previousMessages = [], systemMessage = null, opts = {}) {
        const {
            context = null,
            systemInjectSite = 'location', // message, context, or location
            historyInjectSite = 'location', // context or location
            messageInjectSite = 'message', // context or location
        } = opts;

        // console.log('systemMessage', systemMessage);
        // console.log('previousMessages', previousMessages);
        // console.log('userMessage', userMessage);

        if (!userMessage && (messageInjectSite !== historyInjectSite) && previousMessages?.slice(-1)[0]?.author === 'user') {
            userMessage = previousMessages.pop();
        }

        const locationInjection = [
            ...(systemMessage && systemInjectSite === 'location') ? [systemMessage] : [],
            ...(previousMessages && historyInjectSite === 'location') ? previousMessages : [],
            ...(userMessage && messageInjectSite === 'location') ? [userMessage] : [],
        ];

        const contextInjection = [
            ...(systemMessage && systemInjectSite === 'context') ? [systemMessage] : [],
            ...(previousMessages && historyInjectSite === 'context') ? previousMessages : [],
            ...(userMessage && messageInjectSite === 'context') ? [userMessage] : [],
        ];

        const messageText = messageInjectSite === 'message' ? userMessage?.text : null;

        const country = locationInjection ? this.toTranscript(locationInjection) : null;

        let contextDescription = contextInjection ? this.toTranscript(contextInjection) : '';
        if (context) {
            contextDescription = `${context}\n\n${contextDescription}`;
        }

        // let history = [
        //     ...systemMessage ? [systemMessage] : [],
        //     ...previousMessages,
        //     ...userMessage ? [userMessage] : [],
        // ];

        // let contextInjectionString;
        // let messageText = userMessageInjection;

        // // prepare messages for prompt injection
        // if (injectionMethod === 'message' && history.slice(-1)[0]?.author === 'user') {
        //     history = history.slice(0, -1);
        //     messageText = previousMessages.slice(-1)[0].text;
        // }

        // contextInjectionString = this.toTranscript(history);
        // if (context) {
        //     contextInjectionString = `${context}\n\n${contextInjectionString}`;
        // }

        return {
            ...country ? { country } : {},
            ...messageText ? { messageText } : {},
            ...contextDescription ? { contextDescription } : {},
        };
    }

    onProgressIndexical(message, replies, idx, opts) {
        let {
            diff = null,
        } = message;
        const {
            details = null,
            finishReason = null,
        } = message;

        const {
            stopToken = this.stopToken,
            onProgress,
            onFinished,
            censoredMessageInjection = '⚠',
        } = opts;

        if (diff) {
            if (!replies[idx]) {
                replies[idx] = '';
            }

            if (diff === '⚠') {
                diff = censoredMessageInjection;
            }

            replies[idx] += diff;
            if (replies[idx].trim().endsWith(stopToken)) {
                // remove stop token from updated text
                replies[idx] = replies[idx]
                    .replace(stopToken, '')
                    .trim();
                onFinished(idx, details, 'stop token');

                return;
            }
        }
        onProgress(diff, idx, details);
        if (finishReason) {
            onFinished(idx, details, finishReason);
        }
    }

    onProgressWrapper(message, replies, opts) {
        return this.onProgressIndexical(message, replies, 0, opts);
    }

    async getCompletion(opts, onProgress, abortController) {
        const { encryptedConversationSignature, conversationId, clientId } = await this.createNewConversation();

        const obj = this.constructor.bingRequest({
            conversationId,
            clientId,
            encryptedConversationSignature,
            ...opts,
        });

        if (this.debug) {
            console.debug(JSON.stringify(obj, null, 2));
        }

        const ws = await this.createWebSocketConnection(
            encryptedConversationSignature,
        );

        abortController = new AbortController();

        ws.on('error', (error) => {
            console.error('ws error:', error);
            abortController.abort();
        });

        const messagePromise = new Promise((resolve, reject) => {
            let replySoFar = '';
            const internalSearchResults = [];
            const internalSearchQueries = [];

            const messageTimeout = setTimeout(() => {
                this.constructor.cleanupWebSocketConnection(ws);
                reject(
                    new Error(
                        'Timed out waiting for response. Try enabling debug mode to see more information.',
                    ),
                );
            }, 500 * 1000);

            // abort the request if the abort controller is aborted
            abortController.signal.addEventListener('abort', () => {
                clearTimeout(messageTimeout);
                this.constructor.cleanupWebSocketConnection(ws);
                reject(new Error('Request aborted'));
            });

            let bicIframe;
            ws.on('message', async (data) => {
                const objects = data.toString().split('');
                const events = objects
                    .map((object) => {
                        try {
                            return JSON.parse(object);
                        } catch (error) {
                            return object;
                        }
                    })
                    .filter(eventMessage => eventMessage);
                if (events.length === 0) {
                    return;
                }
                const event = events[0];
                switch (event.type) {
                    case 1: {
                        const messages = event?.arguments?.[0]?.messages;
                        if (!messages?.length || messages[0].author !== 'bot') {
                            return;
                        }
                        if (messages[0].contentOrigin === 'Apology') {
                            console.debug('Apology event');
                            // console.debug(messages[0]);
                            // resolve({
                            //     message: messages[0],
                            //     conversationExpiryTime: event?.arguments?.[0]?.conversationExpiryTime,
                            //     searchResults: internalSearchResults,
                            // });
                            // reject(new Error(messages[0].text));
                            return;
                        }
                        if (messages[0]?.contentType === 'IMAGE') {
                            // You will never get a message of this type without 'gencontentv3' being on.
                            console.debug('Image creation event');
                            console.debug(messages[0]);

                            // bicIframe = this.bic
                            //     .genImageIframeSsr(
                            //         messages[0].text,
                            //         messages[0].messageId,
                            //         progress => (progress?.contentIframe
                            //             ? onProgress(progress?.contentIframe, messages[0]) //console.debug(progress?.contentIframe, messages[0])
                            //             : null),
                            //     )
                            //     .catch((error) => {
                            //         console.error(error);
                            //         onProgress(error.message);
                            //         bicIframe.isError = true;
                            //         return error.message;
                            //     });
                            return;
                        }

                        let difference = '';
                        let updatedText = replySoFar;

                        // console.log('normal event!');

                        switch (messages[0].messageType) {
                            case 'InternalSearchResult':
                                internalSearchResults.push(messages[0]);
                                break;
                            case 'InternalLoaderMessage':
                                break;
                            case 'InternalSearchQuery':
                                internalSearchQueries.push(messages[0]);
                                difference = `${messages[0].text}\n`;
                                break;
                            case 'RenderCardRequest':
                                return;
                            default:
                                if (!messages[0].text || messages[0].text === replySoFar) return;
                                // check for same prefix
                                if (messages[0].text.startsWith(replySoFar) && messages[0].offense === 'Unknown') {
                                    if (messages[0].text.length < replySoFar.length) {
                                        console.debug('Text is shorter than replySoFar');
                                    }
                                    // get the difference between the current text and the previous text
                                    difference = messages[0].text.substring(replySoFar.length);
                                } else {
                                    // difference = `\n${messages[0].text}`;
                                }
                                updatedText = messages[0].text; // should overwrite search traces
                        }
                        onProgress({
                            diff: difference,
                            details: messages[0],
                        });
                        replySoFar = updatedText;
                        return;
                    }
                    case 2: {
                        clearTimeout(messageTimeout);
                        this.constructor.cleanupWebSocketConnection(ws);
                        if (event.item?.result?.value === 'InvalidSession') {
                            reject(
                                new Error(
                                    `${event.item.result.value}: ${event.item.result.message}`,
                                ),
                            );
                            return;
                        }
                        const messages = event.item?.messages || [];
                        let eventMessage = messages.length
                            ? messages[messages.length - 1]
                            : null;
                        if (event.item?.result?.error) {
                            if (this.debug) {
                                console.debug(
                                    event.item.result.value,
                                    event.item.result.message,
                                );
                                console.debug(event.item.result.error);
                                console.debug(event.item.result.exception);
                            }
                            if (replySoFar && eventMessage) {
                                eventMessage.adaptiveCards[0].body[0].text = replySoFar;
                                // eventMessage.text = replySoFar;
                                onProgress({
                                    details: {
                                        message: eventMessage,
                                    },
                                    finishReason: 'case 2 / error',
                                });
                                resolve({
                                    replySoFar,
                                    message: eventMessage,
                                    conversationExpiryTime:
                                        event?.item?.conversationExpiryTime,
                                    searchResults: internalSearchResults,
                                });
                                return;
                            }
                            reject(
                                new Error(
                                    `${event.item.result.value}: ${event.item.result.message}`,
                                ),
                            );
                            return;
                        }
                        if (!eventMessage) {
                            reject(new Error('No message was generated.'));
                            return;
                        }
                        if (eventMessage?.author !== 'bot') {
                            reject(new Error('Unexpected message author.'));
                            return;
                        }
                        // The moderation filter triggered, so just return the text we have so far
                        if (event.item.messages[0].topicChangerText
                            || event.item.messages[0].offense === 'OffenseTrigger'
                            || (event.item.messages.length > 1 && event.item.messages[1].contentOrigin === 'Apology')) {
                            onProgress({
                                diff: '⚠',
                                details: eventMessage,
                            });
                            // if (eventMessage?.adaptiveCards) {
                            //     eventMessage.adaptiveCards[0].body[0].text = replySoFar;
                            // }
                            // eventMessage.text = replySoFar;
                            // delete useless suggestions from moderation filter
                            // delete eventMessage.suggestedResponses;
                        }
                        if (bicIframe) {
                            console.debug('bicIframe');
                            // the last messages will be a image creation event if bicIframe is present.
                            let i = messages.length - 1;
                            while (
                                eventMessage?.contentType === 'IMAGE' && i > 0
                            ) {
                                eventMessage = messages[(i -= 1)];
                            }

                            // wait for bicIframe to be completed.
                            // since we added a catch, we do not need to wrap this with a try catch block.
                            const imgIframe = await bicIframe;
                            if (!imgIframe?.isError) {
                                console.debug('bicIframe completed');
                                // eventMessage.adaptiveCards[0].body[0].text += imgIframe;
                            } else {
                                console.debug('bicIframe error');
                                // eventMessage.text += `<br>${imgIframe}`;
                                // eventMessage.adaptiveCards[0].body[0].text = eventMessage.text;
                            }
                        }
                        onProgress({
                            details: {
                                message: eventMessage,
                            },
                            finishReason: 'case 2 / success',
                        });
                        resolve({
                            replySoFar,
                            message: eventMessage,
                            conversationExpiryTime:
                                event?.item?.conversationExpiryTime,
                            searchResults: internalSearchResults,
                        });
                        // eslint-disable-next-line no-useless-return
                        return;
                    }
                    case 7: {
                        // [{"type":7,"error":"Connection closed with an error.","allowReconnect":true}]
                        clearTimeout(messageTimeout);
                        this.constructor.cleanupWebSocketConnection(ws);
                        reject(
                            new Error(event.error || 'Connection closed with an error.'),
                        );
                        // eslint-disable-next-line no-useless-return
                        return;
                    }
                    default:
                        if (event?.error) {
                            clearTimeout(messageTimeout);
                            this.constructor.cleanupWebSocketConnection(ws);
                            reject(
                                new Error(`Event Type('${event.type}'): ${event.error}`),
                            );
                        }
                        // eslint-disable-next-line no-useless-return
                        return;
                }
            });
        });

        const messageJson = JSON.stringify(obj);
        if (this.debug) {
            console.debug(messageJson);
            console.debug('\n\n\n\n');
        }
        ws.send(`${messageJson}`);

        const {
            replySoFar: text,
            message,
            conversationExpiryTime,
            searchResults,
        } = await messagePromise;

        const returnData = {
            text,
            message,
            msftConversationId: conversationId,
            encryptedConversationSignature,
            clientId,
            conversationExpiryTime,
            searchResults,
            opts,
        };

        return returnData;
    }

    static getUserSuggestions(message) {
        return message?.suggestedResponses?.map(
            suggestion => suggestion.text,
        );
    }

    static getSearchResults(message) {
        const searchResults = message?.sourceAttributions;
        if (!searchResults) {
            return null;
        }
        // create a dictionary indexed by searchQuery and containing the search results associated with that query
        const searchResultsDictionary = {};
        searchResults?.forEach((searchResult) => {
            // if result doesn't have searchQuery, put it in "Other" category
            const searchQuery = searchResult.searchQuery || 'Other';
            if (!searchResultsDictionary[searchQuery]) {
                searchResultsDictionary[searchQuery] = [];
            }
            searchResultsDictionary[searchQuery].push({
                title: searchResult.providerDisplayName,
                url: searchResult.seeMoreUrl,
            });
        });
        return searchResultsDictionary;
    }
}

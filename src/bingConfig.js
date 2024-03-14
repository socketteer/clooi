import * as fs from 'fs';

export const bingCookie = fs.readFileSync('./src/bingCookie.txt', 'utf8');

export const requestOptions = (saveMem = false) => ({
    source: 'cib-ccp',
    optionsSets: [
        'nlu_direct_response_filter',
        'deepleo',
        'disable_emoji_spoken_text',
        'responsible_ai_policy_235',
        'enablemm',
        'dv3sugg',
        // 'autosave',
        'iyxapbing',
        'iycapbing',
        'h3imaginative',
        'jb204cftr085',
        'hourthrot',
        'gndlogcf',
        'vidtoppb',
        'eredirecturl',
        'clgalileo',
        'gencontentv3',
        'enable_user_consent',
        'fluxmemcst',
        ...saveMem ? ['autosave'] : [],
    ],
    allowedMessageTypes: [
        'ActionRequest',
        'Chat',
        'ConfirmationCard',
        'Context',
        'InternalSearchQuery',
        'InternalSearchResult',
        'Disengaged',
        'InternalLoaderMessage',
        'Progress',
        'RenderCardRequest',
        'RenderContentRequest',
        'AdsQuery',
        'SemanticSerp',
        'GenerateContentQuery',
        'SearchQuery',
        'GeneratedCode',
        'InternalTasksMessage',
    ],
    sliceIds: [
        'bgstreamcf',
        'rwt2',
        'scmcbasecf',
        'cmcpupsalltf',
        'thdnsrch',
        'sunoupsellcf',
        '0215wcrwip',
        '301jb204cf',
        '0312hrthrot',
        'bingfc',
        '0225unsticky1',
        'dissagrds0',
        '308videopb',
        '3022tphpv',
    ],
    verbosity: 'verbose',
    scenario: 'SERP',
    plugins: [
        { id: 'c310c353-b9f0-4d76-ab0d-1dd5e979cf68', category: 1 },
    ],
    // traceId: '65f2fecfc6404aa6858538f506e89505',
    // requestId: '12806909-a89f-ba2c-9827-66a95810f348',

    conversationHistoryOptionsSets: saveMem ? [
        'autosave',
        'savemem',
        'uprofupd',
        'uprofgen',
    ] : [
        'savemem',
        'uprofupd',
        'uprofgen',
    ],
    gptId: 'copilot', // wtf does this do?
});

// const obj = {
//     arguments: [
//         {
//             source: 'cib',
//             optionsSets: [
//                 'nlu_direct_response_filter',
//                 'deepleo',
//                 'disable_emoji_spoken_text',
//                 'responsible_ai_policy_235',
//                 'enablemm',
//                 toneOption,
//                 'dtappid',
//                 'cricinfo',
//                 'cricinfov2',
//                 'dv3sugg',
//                 'nojbfedge',
//                 ...(toneStyle === 'creative' && this.options.features.genImage
//                     ? ['gencontentv3']
//                     : []),
//             ],
//             sliceIds: ['222dtappid', '225cricinfo', '224locals0'],
//             traceId: genRanHex(32),
//             isStartOfSession: invocationId === 0,
//             message: {
//                 author: 'user',
//                 text: userMessageInjection,
//                 // messageType: jailbreakConversationId ? 'SearchQuery' : 'Chat',
//                 // I'm still not sure why waylaidwanderer's original code sets messageType to 'SearchQuery'
//                 // It doesn't seem to make a difference in my tests
//                 messageType: 'Chat',
//             },
//             tone: toneOption,
//             encryptedConversationSignature,
//             participant: {
//                 id: clientId,
//             },
//             conversationId,
//             previousMessages: [],
//         },
//     ],
//     invocationId: invocationId.toString(),
//     target: 'chat',
//     type: 4, // streaming?
// };

// message: {
//     locale: 'en-US',
//     market: 'en-US',
//     region: 'US',
//     location: 'lat:47.639557;long:-122.128159;re=1000m;',
//     locationHints: [
//         {
//             SourceType: 1,
//             RegionType: 2,
//             Center: {
//                 Latitude: 37.75870132446289,
//                 Longitude: -122.4811019897461,
//             },
//             Radius: 24902,
//             Name: 'San Francisco, California',
//             Accuracy: 24902,
//             FDConfidence: 0.8999999761581421,
//             CountryName: 'United States',
//             CountryConfidence: 9,
//             Admin1Name: 'California',
//             PopulatedPlaceName: 'San Francisco',
//             PopulatedPlaceConfidence: 9,
//             PostCodeName: '94122',
//             UtcOffset: -8,
//             Dma: 807,
//         },
//     ],
//     userIpAddress: '135.180.64.190',
//     timestamp: '2024-03-14T06:42:40-07:00',

//     inputMethod: 'Keyboard',
// }

// conversationId: '51D|BingProd|DB9A31B51D10AFD82FBB6344ACFE6A3F881D1A8CFD4C67EB99D6AFF783B4751E',
// export const clientId = '844425080613716';

// requestId: '12806909-a89f-ba2c-9827-66a95810f348',
// messageId: '12806909-a89f-ba2c-9827-66a95810f348',

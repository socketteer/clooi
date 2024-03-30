import assert from 'assert';

import * as conversions from '../src/typeConversionUtil.js';
import { conversionTests } from './testData.js';

// const clientOptions = {};

// const client = new ChatClient(clientOptions);

try {
    for (const [key, value] of Object.entries(conversionTests)) {
        const { xml, messages, transcript } = value;
        assert.strictEqual(conversions.getDataType(xml), 'xml', `getDataType test failed for ${key}`);
        assert.strictEqual(conversions.getDataType(messages), '[basicMessage]', `getDataType test failed for ${key}`);
        assert.strictEqual(conversions.getDataType(messages[0]), 'basicMessage', `getDataType test failed for ${key}`);
        assert.strictEqual(conversions.getDataType(transcript), 'transcript', `getDataType test failed for ${key}`);
        // console.log(messages)
        const actualMessagesFromXml = conversions.parseXml(xml);
        // assert.deepStrictEqual(actualMessagesFromXml, messages, `parseXmlString test failed for ${key}.\nExpected: ${JSON.stringify(messages)}\nActual: ${JSON.stringify(actualMessagesFromXml)}`);

        const actualXmlFromMessages = conversions.toXml(messages);
        assert.strictEqual(xml, actualXmlFromMessages, `toXmlTranscript test failed for ${key}`);

        const actualXmlFromActualMessages = conversions.toXml(actualMessagesFromXml);
        assert.strictEqual(xml, actualXmlFromActualMessages, `toXmlTranscript test failed for ${key}`);

        const actualMessagesFromTranscript = conversions.parseTranscript(transcript);
        // assert.deepStrictEqual(actualMessagesFromTranscript, messages, `parseHistoryString test failed for ${key}.\nExpected: ${JSON.stringify(messages)}\nActual: ${JSON.stringify(actualMessagesFromTranscript)}`);

        const actualTranscriptFromMessages = conversions.toTranscript(messages);
        assert.strictEqual(transcript, actualTranscriptFromMessages, `toTranscript test failed for ${key}`);

        const actualTranscriptFromActualMessages = conversions.toTranscript(actualMessagesFromTranscript);
        assert.strictEqual(transcript, actualTranscriptFromActualMessages, `toTranscript test failed for ${key}`);
    }

    console.log('All tests passed!');
} catch (error) {
    console.error('Test failed:', error);
}


// // Run the test
// try {
//     // assert.strictEqual(isValidXML(xmlExampleConversation), true);

//     const actualMessages = parseXmlString(xmlExampleConversation);
//     assert.deepStrictEqual(actualMessages, expectedMessages);

//     const xmlExampleConversation2 = client.toXmlTranscript(actualMessages);
//     // console.log(xmlExampleConversation2);
//     assert.strictEqual(xmlExampleConversation, xmlExampleConversation2);

//     const actualMessages2 = client.parseHistoryString(exampleTranscriptString);
//     // console.log(actualMessages2);
//     assert.deepStrictEqual(actualMessages2, exampleTranscriptMessages);

//     const xmlExampleConversation3 = client.toXmlTranscript(exampleTranscriptMessages);

//     // assert.strictEqual(isValidXML(xmlExampleConversation3), true);

//     console.log(xmlExampleConversation3);
//     const actualMessages3 = parseXmlString(xmlExampleConversation3);
//     console.log(actualMessages3);

//     console.log('Test passed!');
// } catch (error) {
//     console.error('Test failed:', error);
// }

import { getBrokerInfo } from './supraContract';
import Log from './Log';

let web3 = null;

export function setWeb3(w) { web3 = w; };

export function strToData(message) {
    const data = message;
    const bytes = []; // char codes
    for (var i = 0; i < data.length; ++i) {
        bytes.push(data.charCodeAt(i));
    }
    return '0x'+bytes.map(c => c.toString(16)).join('');
}

export function dataToStr(message) {
    message = message.slice(2); //remove '0x'
    const bytes = [];
    for (var i = 0; i < message.length; i+=2) {
        bytes.push(String.fromCharCode(parseInt(message.slice(i,i+2), 16)));
    }
    return bytes.join('');
}

export function hashData(dataHex) {
    return web3.utils.soliditySha3(dataHex);
}

export function hashMessage({timestamp, topic, data, hashedData, prev_hash}) {
    if(hashedData === undefined) {
        if(data === undefined)
            throw `when calling hashMessage, either data or hashedData should be given`;

        hashedData = hashData(data)
    }

    const [_, topic_id] = parseTopic(topic);

    return web3.utils.soliditySha3(
        toBytes(timestamp, 8) + 
        toBytes(topic_id, 4).slice(2) + 
        hashedData.slice(2) + 
        prev_hash.slice(2));
}

export function toBytes(n, nb_bytes) {
    return '0x'+(new web3.utils.BN(n)).toString(16,nb_bytes*2)
}

export function parseTopic(topic) {
    return topic.split(':').map(i => parseInt(i));
}

export async function signMessage(msg, account) 
{
    const hashedMessage = hashMessage(msg);

    return signHash(hashedMessage, account);
}

export async function signHash(hashedMessage, account) {

    // sign hashed message
    const signature = await web3.eth.sign(hashedMessage, account); 

    // split signature
    const r = signature.slice(0, 66);
    const s = "0x" + signature.slice(66, 130);
    const v = parseInt(signature.slice(130, 132), 16);

    return { r, s, v };
}


export async function verifyAck(msg) {

    const signer = await web3.eth.accounts.recover(
        msg.hashedMessage,
        '0x'+msg.v.toString(16),
        msg.r,
        msg.s
    );

    const broker = await getBrokerInfo(msg.broker_id);
    
    if((signer !== broker.account))
    {
        Log('Wrong ack sender', {
            broker_id: msg.broker_id,
            broker,
            signer
        });
    }

    return (signer === broker.account);
}

export async function verifyMessage(msg) {

    const hashedMessage = hashMessage(msg);

    const signer = await web3.eth.accounts.recover(
        hashedMessage,
        '0x'+msg.v.toString(16),
        msg.r,
        msg.s
    );

    const [broker_id, _] = parseTopic(msg.topic);
    const broker = await getBrokerInfo(broker_id);
    
    if((signer !== broker.account))
    {
        Log('Wrong sender',{
            topic: msg.topic,
            broker,
            signer
        });
    }

    return (signer === broker.account);
}

import { hashData, hashMessage, toBytes, signHash, signMessage, parseTopic } from './utils.js';

let supra = null;
let brokers = [];

export function setSupra(_supra) {
    supra = _supra;
}

export async function getBalance(account) {
    return await supra.methods
        .getBalance(account)
        .call();
}

export async function getBrokers() {
    brokers = await supra.methods.getBrokers().call();
    brokers = brokers.map((b, i) => {
        return {
            ...b,
            id: i
        };
    })
    return brokers;
}

export async function getBrokerInfo(broker_id) {

    if(!brokers[broker_id]) {
        brokers = await getBrokers(); 
        if(!brokers[broker_id])  
        {
            throw 'unknown broker id';
        }
    }
    return brokers[broker_id];
}

export async function sendMessageOnChain(msg, account) {

    const [_, topic_id] = parseTopic(msg.topic);

    console.log('sending message on chain', {
        msg
    })

    const gas = await supra.methods
        .sendMessage(topic_id, msg.data, msg.timestamp, msg.prev_hash)
        .estimateGas({from: account});

    return supra.methods
        .sendMessage(topic_id, msg.data, msg.timestamp, msg.prev_hash)
        .send({gas, from: account});
}

export async function registerBroker(ipAddr, port, account) {
    try {
        const gas = await supra.methods
            .registerBroker(ipAddr, port)
            .estimateGas({ from: account, value:1000 });
            
        await supra.methods
            .registerBroker(ipAddr, port)
            .send({ gas, from: account, value:1000 });
        return true;
    } catch(e) {
        console.log('unable to register broker', e);
    }
    return false;
}

export function contractEvents() {
    return supra.events;
}
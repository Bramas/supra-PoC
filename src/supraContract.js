
import { hashData, hashMessage, toBytes, signHash, signMessage, parseTopic } from './utils.js';
import Log from './Log';

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


let transactionLock = false;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) };
async function waitFor(f) {
    while(!f()) await sleep(1000);
    return f();
};

async function acquireTransactionLock(cb) {
    await waitFor(() => !transactionLock);
    transactionLock = true;
    const ret = await cb();
    transactionLock = false;
    return ret;
}

function getReceipt(sentPromise) {
    return new Promise((acc, rej) => {
        sentPromise
            .on('receipt', function(receipt) {
                acc(receipt);
            })
            .on('error', function(error, receipt) {
                rej(err);
            })
    })
}

export async function sendMessageOnChain(msg, account) {
    return await acquireTransactionLock(async () => {
        Log('sending message on chain '+ msg.timestamp);
        const [_, topic_id] = parseTopic(msg.topic);

        const gas = await supra.methods
            .sendMessage(topic_id, msg.data, msg.timestamp, msg.prev_hash)
            .estimateGas({from: account});

        const receipt = await getReceipt(supra.methods
            .sendMessage(topic_id, msg.data, msg.timestamp, msg.prev_hash)
            .send({gas, from: account}));
        Log('sent message on chain '+msg.timestamp+'id=', receipt.events.NewMessage.returnValues.message_id);

        return receipt.events.NewMessage.returnValues.message_id;
    })
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
        Log('unable to register broker', e);
    }
    return false;
}

export function contractEvents() {
    return supra.events;
}
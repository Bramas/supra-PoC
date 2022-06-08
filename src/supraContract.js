
import { hashData, hashMessage, toBytes, signHash, signMessage, parseTopic, hashOpeningSub } from './utils.js';
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
        Log('sending message on chain');
        const [_, topic_id] = parseTopic(msg.topic);

        const gas = await supra.methods
            .sendMessage(topic_id, msg.data, msg.timestamp, msg.prev_hash)
            .estimateGas({from: account});

        const receipt = await getReceipt(supra.methods
            .sendMessage(topic_id, msg.data, msg.timestamp, msg.prev_hash)
            .send({gas, from: account}));
        Log('sent message on chain id=', receipt.events.NewMessage.returnValues.message_id);

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


/*	function accuse(
		uint defendant_id,
	 	uint32 topic, 
		bytes32 prev_hash, 
		bytes32 data_hash,
		uint64 timestamp, 
		uint8 sig_v,
		bytes32[2] memory sig_rs,
		//bytes32 sig_s,

		uint64 open_timestamp,
		bytes32 open_prev_hash,
		uint8   open_sig_v,
		bytes32[2] memory open_sig_rs
		//bytes32 open_sig_s
		
		) public payable

*/
export async function accuse(msg, openingSub, account) {
    return await acquireTransactionLock(async () => {
        Log('sending accuse on chain', {prev_hash: msg.prev_hash});

        const [broker_id, topic_id] = parseTopic(msg.topic);

        const gas = await supra.methods
            .accuse(
                broker_id,
                topic_id, 
                msg.prev_hash, 
                hashData(msg.data), 
                msg.timestamp,

                msg.v,
                [msg.r, msg.s],

               openingSub.timestamp,
               openingSub.prev_hash,
               openingSub.v,
               [openingSub.r, openingSub.s]               
            )
            .estimateGas({from: account, value: 10});

        const receipt = await getReceipt(supra.methods
            .accuse(
                broker_id,
                topic_id, 
                msg.prev_hash, 
                hashData(msg.data), 
                msg.timestamp,

                msg.v,
                [msg.r, msg.s],

                openingSub.timestamp,
                openingSub.prev_hash,
                openingSub.v,
                [openingSub.r, openingSub.s]                
            )
            .send({gas, from: account, value: 10}));
        Log('sent accuse on chain, id=', receipt.events.NewAccusation.returnValues.accusation_id);

        return receipt.events.NewAccusation.returnValues.accusation_id;
    })
}


// defendOnChain(uint32 accusation_id, uint32 message_id)
export async function defendOnChain(accusation_id, message_id, account) {
    return await acquireTransactionLock(async () => {
        Log('defending on chain', {accusation_id, message_id});

        const gas = await supra.methods
            .defendOnChain(accusation_id, message_id)
            .estimateGas({from: account});

        const receipt = await getReceipt(supra.methods
            .defendOnChain(accusation_id, message_id)
            .send({gas, from: account}));

        Log('successfuly defended on chain, id = ', receipt.events.AccusationFailed.returnValues.accusation_id);

        return receipt.events.AccusationFailed.returnValues.accusation_id;
    })
}

/* 
	function defendOffChain(
		uint32 accusation_id, 

		// the message
		uint32 topic, 
		uint64 timestamp,
		bytes32 dataHash,
		bytes32 prevHash,
		
		// the signature of its hash by the accuser (i.e. the ack of the message)
		uint8 _v, 
		bytes32 _r, 
		bytes32 _s)
    */
export async function defendOffChain(accusation_id, msg, msg_ack, account) {
    return await acquireTransactionLock(async () => {
        Log('defending off chain', {accusation_id});

        const [_, topic_id] = parseTopic(msg.topic);

        const gas = await supra.methods
            .defendOffChain(
                accusation_id, 

                topic_id,
                msg.timestamp,
                hashData(msg.data),
                msg.prev_hash,

                msg_ack.v,
                msg_ack.r,
                msg_ack.s
            )
            .estimateGas({from: account});

        const receipt = await getReceipt(supra.methods
            .defendOffChain(
                accusation_id, 

                topic_id,
                msg.timestamp,
                hashData(msg.data),
                msg.prev_hash,

                msg_ack.v,
                msg_ack.r,
                msg_ack.s)
            .send({gas, from: account}));

        Log('successfuly defended off chain, id = ', receipt.events.AccusationFailed.returnValues.accusation_id);

        return receipt.events.AccusationFailed.returnValues.accusation_id;
    })
}



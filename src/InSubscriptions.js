import fs from 'fs';
import { 
    verifyMessage, 
    signMessage,
    hashMessage, 
    parseTopic,
    toBytes,
    signHash,
} from './utils.js';
import { contractEvents, getBrokerInfo } from './supraContract'

class InSubscriptions {

    constructor(id, account, server, onMessage) {
        this.server = server;
        this.id = id;
        this.account = account;
        this.onMessage = onMessage;
        this.openSub = {};
        this.closedSub = {};
        
        this.filenameOpenSub = `store/${this.account.slice(0,7)}_openSub_in.json`;
        this.filenameClosedSub = `store/${this.account.slice(0,7)}_closedSub_in.json`;

        if(fs.existsSync(this.filenameOpenSub))
        {
            this.openSub = JSON.parse(fs.readFileSync(this.filenameOpenSub));
            for(const broker_id in this.openSub) {
                for(const topic_id in this.openSub[broker_id]) {
                    this.listenOnChainMessages(broker_id, topic_id);
                }
            }

        }
        if(fs.existsSync(this.filenameClosedSub))
        {
            this.closedSub = JSON.parse(fs.readFileSync(this.filenameClosedSub));
        }
    }

    save() {
        fs.writeFileSync(this.filenameClosedSub, JSON.stringify(this.closedSub));
        fs.writeFileSync(this.filenameOpenSub, JSON.stringify(this.openSub));
    }

    async receivedOffChain(msg) {
        const {topic} = msg;

        //TODO: check that the received msg is ok and send an ack
        
        if(! await verifyMessage(msg)){
            console.log('received wrong message', msg);
            return;
        }
        this._onMessage(msg);
    }

    _onMessage(msg) {

        const [broker_id, topic_id] = parseTopic(msg.topic);
        if(this.openSub[broker_id] === undefined) {
            console.log('received message on an unknown subscription', broker_id+':'+topic_id);
            console.log(this.openSub)
            return;
        }
        if(this.openSub[broker_id][topic_id] === undefined) {
            console.log('received message on an unknown subscription', broker_id+':'+topic_id);
            console.log(this.openSub)
            return;
        }

        const hashedMsg = hashMessage(msg);
        if(this.openSub[broker_id][topic_id].messages[hashedMsg] !== undefined){
            console.log('message is known so just ignore it', hashedMsg);
            return;
        }
        
        console.log('message is unknown', hashedMsg);
        if(msg.prev_hash != toBytes(0,32) && this.openSub[broker_id][topic_id].messages[msg.prev_hash] === undefined){
            console.log('the previous message is unknown, so I keep it for later');
            // TODO: keep it for later;
            return;
        }

        this.openSub[broker_id][topic_id].messages[hashedMsg] = msg
        this.save();
        this.onMessage(msg);
        this.sendAck(msg);
    }

    add(broker_id, topic_id) {

        if(!this.openSub[broker_id]) this.openSub[broker_id] = {}

        if(this.openSub[broker_id][topic_id] !== undefined) 
        {    //throw `existing subscription for broker ${broker.id} and topic ${topic_id}`;
            return;
        }

        //TODO: save here the proof that the subscription is open
        this.openSub[broker_id][topic_id] = {
            messages: {}
        };
        this.listenOnChainMessages(broker_id, topic_id);
    }

    async sendAck(msg) {
        const hashedMessage = hashMessage(msg);
        const sig = await signHash(hashedMessage, this.account);

        const buff = Buffer.from(JSON.stringify({
            hashedMessage,
            topic: msg.topic,
            broker_id: this.id,
            type: 'DATA_ACK',
            ...sig
        }));

        const [broker_id, topic_id] = parseTopic(msg.topic);

        const broker = await getBrokerInfo(broker_id);
        setTimeout(() => {
            this.server.send(buff, broker.port, broker.ipAddr, function(error){
                if(error){
                    console.log('error:', error);
                    //TODO send onChain
                }
            });
        }, 2000);
    }

    listenOnChainMessages(broker_id, topic_id)
    {
        const broker = getBrokerInfo(broker_id);

        const self = this;
        contractEvents().NewMessage({
            filter: {
                from: broker.account, 
                topic_id
            },
            fromBlock: 0
        })
        .on("connected", function(subscriptionId){
            console.log(`Listening to onChain message: ${broker_id}:${topic_id}`);
        })
        .on('data', function(event){
            console.log(`receiving onChain event ${broker_id}:${topic_id}`, event.returnValues); 
            
            self._onMessage({
                ...event.returnValues,
                topic: broker_id + ':' + topic_id // we need to reconstruct the topic when 
                                                  // the message is coming from the blockchain
            });
        })
        .on('changed', function(event){
            // remove event from local database
            console.log(`onChain event ${broker_id}:${topic_id} changed`, event);
        })
        .on('error', function(error, receipt) { 
            // If the transaction was rejected by the network with a receipt, the second parameter will be the receipt.
            console.log(`onChain event ${broker_id}:${topic_id} ERROR:`);
            console.log({error, receipt});
        });
    }
}

export default InSubscriptions;

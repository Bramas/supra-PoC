import fs from 'fs';
import { 
    verifyMessage, 
    signMessage,
    hashMessage, 
    parseTopic,
    toBytes,
    verifyAck
} from './utils.js';
import Log from './Log';
import { contractEvents, getBrokerInfo, sendMessageOnChain } from './supraContract'

class OutSubscriptions {

    constructor(id, account, server) {
        this.server = server;
        this.id = id;
        this.account = account;
        this.openSub = {};
        this.closedSub = {};
        this.sendingTimeout = {};
        
        this.filenameOpenSub = `store/${this.account.slice(0,7)}_openSub_out.json`;
        this.filenameClosedSub = `store/${this.account.slice(0,7)}_closedSub_out.json`;

        if(fs.existsSync(this.filenameOpenSub))
        {
            this.openSub = JSON.parse(fs.readFileSync(this.filenameOpenSub));
            for(const topic_id in this.openSub) {
                for(const broker_id in this.openSub[topic_id]) {
                    this.listenOnChainMessages(broker_id, topic_id);
                }
            }
            this.retryAll();

        }
        if(fs.existsSync(this.filenameClosedSub))
        {
            this.closedSub = JSON.parse(fs.readFileSync(this.filenameClosedSub));
        }

        const self = this;
        this.server.on('message',function(msg,info){
            
            msg = JSON.parse(msg.toString());
            
            if(msg.type == 'DATA_ACK') {
                self.ack(msg);
            }
        });
    }

    save() {
        fs.writeFileSync(this.filenameClosedSub, JSON.stringify(this.closedSub));
        fs.writeFileSync(this.filenameOpenSub, JSON.stringify(this.openSub));
    }

    async publish(msg) {
        
        const [_, topic_id] = parseTopic(msg.topic);
        if(this.openSub[topic_id] === undefined) return;



        const buff = Buffer.from(JSON.stringify(msg));

        for(const broker_id in this.openSub[topic_id])
        {
            const broker = await getBrokerInfo(broker_id);

            if(!msg.forceFail) // for testing purpose, simulate a failure
            {
                this.server.send(buff, broker.port, broker.ipAddr, function(error){
                    if(error){
                        Log('error:', error);
                    }
                });
            }

            const hashedMessage = hashMessage(msg);
            this.updateSendingTimeout(msg);

            Log(`sending message to broker [${topic_id}][${broker_id}]`, broker);
            this.openSub[topic_id][broker_id].sent[hashedMessage] = msg;
        }

        this.save();   
    }

    async retryAll() {
        for(const topic_id in this.openSub) {
            for(const broker_id in this.openSub[topic_id]) {
                for(const h in this.openSub[topic_id][broker_id].sent){

                    const msg = this.openSub[topic_id][broker_id].sent[h];
                    const broker = await getBrokerInfo(broker_id);
                    
                    const buff = Buffer.from(JSON.stringify(msg));
                    Log('retryAll: sending again to broker_id', {broker_id, msg});
                    if(!msg.forceFail) // for testing purpose, simulate a failure
                    {
                        this.server.send(buff, broker.port, broker.ipAddr, function(error){
                            if(error) {
                                Log('error:', error);
                                //TODO send onChain
                            }
                        });
                    }
                    this.updateSendingTimeout(msg);
                }
            }
        }
    }
    
    updateSendingTimeout(msg) {
        const hashedMessage = hashMessage(msg);
        if(!this.sendingTimeout[hashedMessage])
        {
            this.sendingTimeout[hashedMessage] = setTimeout(this.sendOnChain.bind(this, msg), 10000);
        }
    }

    async sendOnChain(msg) {
        Log('sending message onChain', msg);
        const messageId = await sendMessageOnChain(msg, this.account);
        const hashedMessage = hashMessage(msg);
        for(const topic_id in this.openSub) {
            for(const broker_id in this.openSub[topic_id]) {
                if(this.openSub[topic_id][broker_id].sent[hashedMessage])
                {
                    delete this.openSub[topic_id][broker_id].sent[hashedMessage];
                    msg.messageId = messageId;
                    this.openSub[topic_id][broker_id].onChain[hashedMessage] = msg;
                }
            }
        }
        this.save();
    }


    add(msg) {
        const [_, topic_id] = parseTopic(msg.topic);
        const broker_id = msg.broker_id;

        if(!this.openSub[topic_id]) this.openSub[topic_id] = {}

        if(this.openSub[topic_id][broker_id] !== undefined) 
        {    //throw `existing subscription for broker ${broker.id} and topic ${topic_id}`;
            return;
        }

        //TODO: save here the proof that the subscription is open
        this.openSub[topic_id][broker_id] = {
            sent: {},
            ack: {},
            onChain: {}
        };
        this.listenOnChainMessages(broker_id, topic_id);
        this.save();
    }

    ack(msg) {
        const [_, topic_id] = parseTopic(msg.topic);
        const broker_id = msg.broker_id;

        if(this.openSub[topic_id][broker_id].sent[msg.hashedMessage] === undefined) {
            // already acknowledged
            return;
        }
        const sentMsg = this.openSub[topic_id][broker_id].sent[msg.hashedMessage];
        //TODO: Check signature

        verifyAck(msg);

        this.openSub[topic_id][broker_id].ack = {
            sentMsg,
            ...msg
        };

        let prev_hash = msg.hashedMessage;
        while(this.openSub[topic_id][broker_id].sent[prev_hash] !== undefined) 
        {
            let m = this.openSub[topic_id][broker_id].sent[prev_hash];
            clearTimeout(this.sendingTimeout[msg.hashedMessage]);
            delete this.sendingTimeout[msg.hashedMessage];
            delete this.openSub[topic_id][broker_id].sent[prev_hash];
            prev_hash = m.prev_hash;
        }

        for(let h in this.openSub[topic_id][broker_id].onChain) {
            if(this.openSub[topic_id][broker_id].onChain[h].timestamp < sentMsg.timestamp) {
                delete this.openSub[topic_id][broker_id].onChain[h];
            }
        }

        this.save();
    }

    listenOnChainMessages(broker_id, topic_id)
    {
        //TODO: listen to closing events
        return;
        /*
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
            Log(`Listening to onChain message: ${broker_id}:${topic_id}`);
        })
        .on('data', function(event){
            Log(`receiving onChain event ${broker_id}:${topic_id}`, event.returnValues); 
            
            self._onMessage({
                ...event.returnValues,
                topic: broker_id + ':' + topic_id // we need to reconstruct the topic when 
                                                  // the message is coming from the blockchain
            });
        })
        .on('changed', function(event){
            // remove event from local database
            Log(`onChain event ${broker_id}:${topic_id} changed`, event);
        })
        .on('error', function(error, receipt) { 
            // If the transaction was rejected by the network with a receipt, the second parameter will be the receipt.
            Log(`onChain event ${broker_id}:${topic_id} ERROR:`);
            Log({error, receipt});
        });
        */
    }
}

export default OutSubscriptions;

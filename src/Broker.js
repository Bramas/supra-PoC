

import fs from 'fs';
import udp from 'dgram';
import InSubscriptions from './InSubscriptions'
import OutSubscriptions from './OutSubscriptions'
import { hashData, hashMessage, toBytes, signHash, signMessage, parseTopic } from './utils.js';
import { getBrokerInfo, registerBroker, getBrokers } from './supraContract';
import Log from './Log';


class Broker {


    constructor(brokerInfo, accountAdr) {
        this.accountAdr = accountAdr;
        this.timestamp = new Date().getTime();
        this.subscribers = {};
        this.brokers = [];
        this.id = brokerInfo.id;
        this.port = brokerInfo.port;
        this.ipAddr = brokerInfo.ipAddr;

        this.sentMessages = {};
        
    }

    initServer() {
        this.server = udp.createSocket('udp4');
        const self = this;

        this.server.on('error',function(error){
            Log('Error in initServer():', error);
            this.server.close();
        });
        this.server.on('listening',function(){
            var address = self.server.address();
            var port = address.port;
            var family = address.family;
            var ipaddr = address.address;
            Log(`Server is listening at ${ipaddr}:${port}`);
        });
        this.server.on('close',function(){
            Log('Socket is closed !');
        });
        this.server.on('message',function(msg,info){
            msg = JSON.parse(msg.toString());
            Log('UDP received', {msg,info});

            if(msg.type == 'SUBSCRIBE') {
                self.subscribe(msg.topic, info);
            }
            else if(msg.type == 'PUBLISH') {
                self.sign_and_publish(msg);
            } 
            else if(msg.type == 'BROKER_SUBSCRIBE') {
                self.outSubscriptions.add(msg);
            }
            else if(msg.type == 'BROKER_PUBLISH') {
                self.inSubscriptions.receivedOffChain(msg);
            } 
        });

        return new Promise((accept, reject) => {
            this.server.bind(parseInt(this.port), '0.0.0.0', accept);
        });
    }

    getBrokerPrefix() {        
        if(this.id === null) throw 'you forgot to call either create or load';
        
        return this.id;
    }

    async load() {
        this.brokers = await getBrokers();

        if(this.brokers[this.id] === undefined)
            throw `unable to find the current broker index ${this.id} in the broker list. Did you created it?`;
        
        await this.initServer();

        this.inSubscriptions = new InSubscriptions(
            this.id,
            this.accountAdr,
            this.server,
            this.onDistantMessage.bind(this)
        );
        this.outSubscriptions = new OutSubscriptions(
            this.id,
            this.accountAdr,
            this.server);


        this.storeFilename = `store/${this.accountAdr.slice(0,7)}_sent.json`;
        if(fs.existsSync(this.storeFilename))
        {
            this.sentMessages = JSON.parse(fs.readFileSync(this.storeFilename))
        }

    }

    prevHash(topic) {
        const [_, topic_id] = parseTopic(topic);
        if(!this.sentMessages[topic_id]) return toBytes(0, 32);
        const m = this.sentMessages[topic_id][this.sentMessages[topic_id].length-1];
        return hashMessage({
            ...m,
            topic
        });  
    }

    async signMessage(m) {
        return signMessage(m, this.accountAdr);
    }


    async onNewBrokerSubscription(broker, topic_id) {
        Log('New broker subscription');

        this.inSubscriptions.add(broker.id, topic_id);


    }
    

    async onDistantMessage(msg) {
        this.publish(msg);
    }


    async subscribe(topic, subInfo) {
        const self = this;


        if(topic.indexOf(':') != -1) {
            const [broker_id, topic_id] = parseTopic(topic);

            if(this.getBrokerPrefix() != broker_id)
            {
                const broker = await getBrokerInfo(broker_id);
                const data = Buffer.from(JSON.stringify({
                    topic,
                    broker_id: this.id,
                    type: 'BROKER_SUBSCRIBE'
                }));
                Log('new distant sub', {topic, broker, subInfo});

                const bs = new udp.createSocket('udp4');
                bs.send(data, broker.port,  broker.ipAddr, function(error) {
                    if(error){
                        Log('Error in subscribe()', error);
                    } else {
                        self.onNewBrokerSubscription(broker, topic_id);
                    }
                    bs.close();
                });
                /*
                bs.on('message', function(msg, info){
                    msg = JSON.parse(msg.toString());
                    Log('Data received from broker : ');
                    Log({msg, info});
                    self.broker_publish(msg);
                });
                this.broker_sockets.push(bs);
                */
            }
        } 
        else 
        {
            Log('new local sub', {topic, subInfo});
            topic = this.getBrokerPrefix() + ':' + topic;
        }

        
        if(!this.subscribers[topic]) this.subscribers[topic] = [];

        this.subscribers[topic].push(subInfo);
    }

    save_storeFile() {
        fs.writeFileSync(this.storeFilename, JSON.stringify(this.sentMessages));
    }

    prepare_msg(msg) {
        if(msg.topic.indexOf(':') == -1) {
            msg.topic = this.getBrokerPrefix()+':'+msg.topic;
        }
        this.timestamp = msg.timestamp = Math.max(this.timestamp + 1, new Date().getTime());
        msg.prev_hash = this.prevHash(msg.topic);
        return msg;
    }

    async sign_and_publish(msg) {
        msg = this.prepare_msg(msg);

        const [broker_id, topic_id] = parseTopic(msg.topic);

        if(!this.sentMessages[topic_id]) this.sentMessages[topic_id] = [];
        this.sentMessages[topic_id].push(msg);
        this.save_storeFile();

        Log('sign & publish', msg);
        
        const sig = await this.signMessage(msg);

        msg.type='BROKER_PUBLISH'
        this.publish({...msg, ...sig});
        this.outSubscriptions.publish({...msg, ...sig});
    }

    publish(msg) {
        Log('publish:', msg);

        const buff = Buffer.from(JSON.stringify(msg));

        (this.subscribers[msg.topic] || []).forEach(subInfo => {
            Log('sending message to ', subInfo);
            this.server.send(buff, subInfo.port, subInfo.address, function(error){
                if(error){
                    Log('error in publish():', error);
                }
            });
        });
    }

    async run() {
        await this.load();

        await (new Promise(() => {}));
    }

}

export default Broker;


import web3 from './web3.js';
import fs from 'fs';
import udp from 'dgram';

const BN = web3.utils.BN;

class Broker {

    static web3 = null;

    constructor(supraInstance, accountAdr) {
        this.supra = supraInstance;
        this.accountAdr = accountAdr;
        this.timestamp = new Date().getTime();
        this.messages = {};
        this.storeFilename = `store/${accountAdr}`;
        this.subscribers = {};
        this.broker_subscribers = {};
        this.broker_sockets = [];
        this.brokers = [];
        this.id = null;

        if(fs.existsSync(this.storeFilename))
        {
            this.messages = JSON.parse(fs.readFileSync(`store/${accountAdr}`))
        }
    }

    getBrokerPrefix() {
        if(this.id === null) throw 'you forgot to call either create or load';

        return this.id;
    }

    async create(ipAddr, port) {
        try {
            const gas = await this.supra.methods
                .registerBroker(ipAddr, port)
                .estimateGas({ from: this.accountAdr, value:1000 });
                
            await this.supra.methods
                .registerBroker(ipAddr, port)
                .send({ gas, from: this.accountAdr, value:1000 });

            await this.load();
            return true;
        } catch(e) {
            console.log(e);
        }
        return false;
    }

    async load() {
        this.brokers = await this.supra.methods.getBrokers().call();
        for(let i in this.brokers) {
            if(this.brokers[i].account == this.accountAdr)
            {
                this.id = i;
                return;
            }
        }
        throw 'unable to find the current broker index in the broker list. Did you create it? (by calling create)';
    }

    async getBrokerInfo(broker_id) {
        if(!this.brokers[broker_id]) {
            this.brokers = await this.supra.methods.getBrokers().call(); 
            if(!this.brokers[broker_id])  
            {
                throw 'unknown broker id';
            }
        }
        return this.brokers[broker_id];
    }

    
    async getBalance() {
        return await this.supra.methods
            .getBalance(this.accountAdr)
            .call();
    }

    prevHash(topic) {
        if(!this.messages[topic]) return this.toBytes(0, 32);
        const m = this.messages[topic][this.messages[topic].length-1];
        return this.hashMessage(m.timestamp, topic, this.hashData(m.data), m.prev_hash);  
    }

    async sendData(topic, dataHex, forceOnChain = false) {
        

        Math.max(this.timestamp + 1, new Date().getTime());
        const prev_hash = this.prevHash(topic);

        if(!this.messages[topic]) this.messages[topic] = [];


        this.messages[topic].push({
            timestamp: this.timestamp,
            data: dataHex,
            prev_hash: prev_hash
        })

        fs.writeFileSync(this.storeFilename, JSON.stringify(this.messages));

        if(forceOnChain)
        {
            await this.sendMessageOnChain(this.timestamp, topic, prev_hash, dataHex);
        } else {
            await this.sendMessageOffChain(this.timestamp, topic, prev_hash, dataHex);
        }
        
        return true;
    }
    

    async signHash(hashedMessage) {

        // sign hashed message
        const signature = await Broker.web3.eth.sign('0x'+hashedMessage, this.accountAdr); 

        // split signature
        const r = signature.slice(0, 66);
        const s = "0x" + signature.slice(66, 130);
        const v = parseInt(signature.slice(130, 132), 16);

        return { r, s, v };
    }

    async signMessage(m) {
        const [broker_id, topic_id] = this.parseTopic(m.topic);
        const hashedMessage = this.hashMessage(m.timestamp, parseInt(topic_id), this.hashData(m.data), m.prev_hash);

        return this.signHash(hashedMessage);
    }
    async verifyMessage(m) {
        const [broker_id, topic_id] = this.parseTopic(m.topic);
        const hashedMessage = this.hashMessage(m.timestamp, parseInt(topic_id), this.hashData(m.data), m.prev_hash);

        const signer = await Broker.web3.eth.accounts.recover(
            '0x'+hashedMessage,
            '0x'+m.v.toString(16),
            m.r,
            m.s
        );
        
        return signer;
    }

    async sendMessageOnChain(timestamp, topic, prev_hash, dataHex) {

        const hashedmsg = this.hashMessage(timestamp, topic, this.hashData(dataHex), prev_hash);
        const { r, s, v } = await this.signHash(hashedmsg)

        console.log('sending message', {
            hashedData: this.hashData(dataHex),
            hashedMessage: hashedmsg,
            infos: {
            timestamp, topic, prev_hash,
            dataHex
            },
            sig: { r, s, v }
        })

        //console.log(Broker.web3.utils.asciiToHex("abc"));
        //console.log(bytes.map(c => '0x'+c.toString(16)));
        //console.log({ r, s, v });
        /*

                uint32 topic, 
                bytes memory data, 
                uint64 timestamp, 
                uint8 prevsig_v, 
                bytes32 prevsig_r, 
                bytes32 prevsig_s
            */

        //await supra.sendMessage(topic, '0x'+dataHex, timestamp, '0x'+prev_hash, {from: account});

        const gas = await this.supra.methods
            .sendMessage(topic, '0x'+dataHex, this.timestamp, '0x'+prev_hash)
            .estimateGas({from: this.accountAdr});

        this.supra.methods
            .sendMessage(topic, '0x'+dataHex, this.timestamp, '0x'+prev_hash)
            .send({gas, from: this.accountAdr});

        return hashedmsg;
    }

    hashData(data) {
        return Broker.web3.utils.soliditySha3('0x'+data).slice(2);
    }

    toBytes(n, nb_bytes) {
        return new BN(n).toString(16,nb_bytes*2)
    }

    hashMessage(timestamp, topic, data_hash, prev_hash) {
        /*
            uint64 timestamp,
                uint32 topic, 
                bytes32 data_hash, 
                bytes32 prev_hash
            console.log('0x'+toBytes(timestamp, 8) + toBytes(topic, 4) + data_hash + prev_hash)
            console.log('0x'+toBytes(timestamp, 8))
            console.log('0x'+ toBytes(topic, 4) )
            console.log('0x'+ data_hash)
            console.log('0x'+ prev_hash)*/

        return Broker.web3.utils.soliditySha3('0x'+this.toBytes(timestamp, 8) + this.toBytes(topic, 4) + data_hash + prev_hash).slice(2);
    }

    async sendMessageOffChain(timestamp, topic, prev_hash, dataHex) {
        
        const hashedmsg = this.hashMessage(timestamp, topic, this.hashData(dataHex), prev_hash);
        const { r, s, v } = await this.signHash(hashedmsg)

        console.log('sending message off-chain', {
            hashedData: this.hashData(dataHex),
            hashedMessage: hashedmsg,
            infos: {
            timestamp, 
            topic, 
            prev_hash,
            dataHex
            },
            sig: { r, s, v }
        })

        return hashedmsg;
    }



    broker_subscribe(broker_id, topic) {
        console.log('new broker sub', {broker_id, topic});

        if(!this.broker_subscribers[topic]) this.broker_subscribers[topic] = {};

        this.broker_subscribers[topic][broker_id] = true;
    }

    parseTopic(topic) {
        if(topic.indexOf(':') == -1) {
            return [this.getBrokerPrefix(), topic];
        }
        return topic.split(':');
    }


    async broker_publish(msg) {
        const {topic} = msg;

        //TODO: check that the received msg is ok and send an ack
        const [broker_id, topic_id] = this.parseTopic(topic);
        const broker = await this.getBrokerInfo(broker_id);
        const signer = await this.verifyMessage(msg);

        if(signer != broker.account) {
            console.log('received wrong message', msg);
            console.log('signed by', signer);
            console.log('instead of', broker.account);
            return;
        }

        this.publish(msg);
    }

    async subscribe(topic, subInfo) {
        const self = this;


        if(topic.indexOf(':') != -1) {
            topic = topic.split(':');
            const broker_id = parseInt(topic[0]);
            topic = topic.join(':');

            if(this.getBrokerPrefix() != broker_id)
            {
                const broker = await this.getBrokerInfo(broker_id);
                const data = Buffer.from(JSON.stringify({
                    topic,
                    broker_id: this.id,
                    type: 'BROKER_SUBSCRIBE'
                }));
                console.log('new distant sub', {topic, broker, subInfo});

                const bs = new udp.createSocket('udp4');
                bs.send(data, broker.port,  broker.ipAddr, function(error) {
                    if(error){
                        console.log(error);
                    } else {
                        console.log('sent broker subscribe');
                    }
                    bs.close();
                });
                /*
                bs.on('message', function(msg, info){
                    msg = JSON.parse(msg.toString());
                    console.log('Data received from broker : ');
                    console.log({msg, info});
                    self.broker_publish(msg);
                });
                this.broker_sockets.push(bs);
                */
            }
        } 
        else 
        {
            console.log('new local sub', {topic, subInfo});
            topic = this.getBrokerPrefix() + ':' + topic;
        }

        
        if(!this.subscribers[topic]) this.subscribers[topic] = [];

        this.subscribers[topic].push(subInfo);
    }

    async sign_and_publish(msg) {
        if(msg.topic.indexOf(':') == -1) {
            msg.topic = this.getBrokerPrefix()+':'+msg.topic;
        }
        this.timestamp = msg.timestamp = Math.max(this.timestamp + 1, new Date().getTime());

        const [broker_id, topic_id] = this.parseTopic(msg.topic);

        msg.prev_hash = this.prevHash(topic_id);

        if(!this.messages[topic_id]) this.messages[topic_id] = [];
        this.messages[topic_id].push(msg);
        fs.writeFileSync(this.storeFilename, JSON.stringify(this.messages));

        console.log('sign & publish', msg);
        
        const sig = await this.signMessage(msg);
        this.publish({...msg, ...sig});
        

    }

    publish(msg) {
        msg.type='BROKER_PUBLISH'
        console.log('publish:', msg);

        const buff = Buffer.from(JSON.stringify(msg));

        (this.subscribers[msg.topic] || []).forEach(subInfo => {
            console.log('sending message to ', subInfo);
            this.server.send(buff, subInfo.port, subInfo.address, function(error){
                if(error){
                    console.log('error:', error);
                }else{
                  console.log('Data sent !!!');
                }
            });
        });

        Object.keys(this.broker_subscribers[msg.topic] || {}).forEach(async (broker_id) => {
            const broker = await this.getBrokerInfo(broker_id);
            console.log('sending message to broker ', broker);
            this.server.send(buff, broker.port, broker.ipAddr, function(error){
                if(error){
                    console.log('error:', error);
                    //TODO send onChain
                }
            });
        });
    }


    listen(port) {
        this.port = port;
        this.server = udp.createSocket('udp4');
        const self = this;

        this.server.on('error',function(error){
            console.log('Error:', error);
            this.server.close();
        });
        this.server.on('listening',function(){
            var address = self.server.address();
            var port = address.port;
            var family = address.family;
            var ipaddr = address.address;
            console.log('Server is listening at port ' + port);
            console.log('Server ip :' + ipaddr);
            console.log('Server is IP4/IP6 : ' + family);
        });
        this.server.on('close',function(){
            console.log('Socket is closed !');
        });
        this.server.on('message',function(msg,info){
            msg = JSON.parse(msg.toString());
            console.log('received', {msg,info});
            if(msg.type == 'SUBSCRIBE') {
                self.subscribe(msg.topic, info);
            }
            else if(msg.type == 'PUBLISH') {
                self.sign_and_publish(msg);
            } 
            else if(msg.type == 'BROKER_SUBSCRIBE') {
                self.broker_subscribe(msg.broker_id, msg.topic);
            }
            else if(msg.type == 'BROKER_PUBLISH') {
                self.broker_publish(msg);
            } 
            else 
            {
                console.log('error, unknown type');
            }
        });
        this.server.bind(port);
    }
}
Broker.web3 = web3;

export default Broker;
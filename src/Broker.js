

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

        if(fs.existsSync(this.storeFilename))
        {
            this.messages = JSON.parse(fs.readFileSync(`store/${accountAdr}`))
        }
    }

    getBrokerPrefix() {
        return this.port;
    }

    async create(ipAddr) {
        try {
            const gas = await this.supra.methods
                .registerBroker('0x'+new BN(ipAddr).toString(16,4*2))
                .estimateGas({ from: this.accountAdr, value:1000 });
                
            return await this.supra.methods
                .registerBroker('0x'+new BN(ipAddr).toString(16,4*2))
                .send({ gas, from: this.accountAdr, value:1000 });
        } catch(e) {
            console.log(e);
        }
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
    

    async signMessage(hashedMessage) {

        // sign hashed message
        const signature = await Broker.web3.eth.sign('0x'+hashedMessage, this.accountAdr); 

        // split signature
        const r = signature.slice(0, 66);
        const s = "0x" + signature.slice(66, 130);
        const v = parseInt(signature.slice(130, 132), 16);

        return { r, s, v };
    }

    async sendMessageOnChain(timestamp, topic, prev_hash, dataHex) {

        const hashedmsg = this.hashMessage(timestamp, topic, this.hashData(dataHex), prev_hash);
        const { r, s, v } = await this.signMessage(hashedmsg)

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

        //await supraInstance.sendMessage(topic, '0x'+dataHex, timestamp, '0x'+prev_hash, {from: account});

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
        const { r, s, v } = await this.signMessage(hashedmsg)

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


    static strToData(message) {
        const data = message;
        const bytes = []; // char codes
        for (var i = 0; i < data.length; ++i) {
            bytes.push(data.charCodeAt(i));
        }
        return bytes.map(c => c.toString(16)).join('');
    }
    static dataToStr(message) {
        message = message.slice(2); //remove '0x'
        const bytes = [];
        for (var i = 0; i < message.length; i+=2) {
            bytes.push(String.fromCharCode(parseInt(message.slice(i,i+2), 16)));
        }
        return bytes.join('');
    }


    broker_subscribe(topic, subInfo) {
        console.log('new broker sub', {topic, subInfo});

        if(!this.broker_subscribers[topic]) this.broker_subscribers[topic] = [];

        this.broker_subscribers[topic].push(subInfo);
    }
    broker_publish(msg) {
        const {topic, timestamp, data, prev_hash, r, s, v} = msg;

        //TODO: check that the received msg is ok and send an ack


        this.publish(msg);
    }

    subscribe(topic, subInfo) {
        const self = this;


        if(topic.indexOf(':') != -1) {
            topic = topic.split(':');
            const broker_port = parseInt(topic[0]);
            topic = topic.join(':');

            if(this.getBrokerPrefix() != broker_port)
            {
                const bs = new udp.createSocket('udp4');
                const data = Buffer.from(JSON.stringify({
                    topic,
                    type: 'BROKER_SUBSCRIBE'
                }));
                console.log('new distant sub', {topic, subInfo});

                //TODO: fix ip and port when not local
                bs.send(data, broker_port, 'localhost', function(error) {
                    if(error){
                        console.log(error);
                    } else {
                        console.log('sent broker subscribe');
                    }
                });
                bs.on('message', function(msg, info){
                    msg = JSON.parse(msg.toString());
                    console.log('Data received from broker : ');
                    console.log({msg, info});
                    self.broker_publish(msg);
                });
                this.broker_sockets.push(bs);
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

        const sig = await this.signMessage(this.hashMessage(msg.timestamp, msg.topic, this.hashData(msg.data), this.prevHash(msg.topic)));
        this.publish({...msg, ...sig})
    }

    publish(msg) {
        console.log('publish:', msg);

        const buff = Buffer.from(JSON.stringify(msg));
        console.log(this.subscribers);

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

        (this.broker_subscribers[msg.topic] || []).forEach(subInfo => {
            console.log('sending message to broker ', subInfo);
            this.server.send(buff, subInfo.port, subInfo.address, function(error){
                if(error){
                    console.log('error:', error);
                    //TODO send onChain
                }else{
                  console.log('Data sent !!!');
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
            console.log('Server is listening at port' + port);
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
                self.broker_subscribe(msg.topic, info);
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
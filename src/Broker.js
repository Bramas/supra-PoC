

import web3 from './web3.js';

const BN = web3.utils.BN;

class Broker {

    constructor(supraInstance, account) {
        this.supra = supraInstance;
        this.account = account;
        this.prev_hash = this.toBytes(0, 32);
        this.timestamp = new Date().getTime();
    }

    async create(ipAddr) {
        try {
            const gas = await this.supra.methods
                .registerBroker('0x'+new BN(ipAddr).toString(16,4*2))
                .estimateGas({ from: this.account.address, value:1000 });
                
            return await this.supra.methods
                .registerBroker('0x'+new BN(ipAddr).toString(16,4*2))
                .send({ gas, from: this.account.address, value:1000 });
        } catch(e) {
            console.log(e);
        }
    }
    
    async getBalance() {
        return await this.supra.methods
            .getBalance(this.account.address)
            .call();
    }

    async sendData(topic, dataHex) {
        

        Math.max(this.timestamp + 1, new Date().getTime());
        this.prev_hash = await this.sendMessageOnChain(this.timestamp, topic, this.prev_hash, dataHex);
        return true;
    }
    

    async signMessage(hashedMessage) {

        // sign hashed message
        const signature = await web3.eth.sign('0x'+hashedMessage, this.account.address); 

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

        //console.log(web3.utils.asciiToHex("abc"));
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
            .estimateGas({from: this.account.address});

        this.supra.methods
            .sendMessage(topic, '0x'+dataHex, this.timestamp, '0x'+prev_hash)
            .send({gas, from: this.account.address});

        return hashedmsg;
    }

    hashData(data) {
        return web3.utils.soliditySha3('0x'+data).slice(2);
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
        return web3.utils.soliditySha3('0x'+this.toBytes(timestamp, 8) + this.toBytes(topic, 4) + data_hash + prev_hash).slice(2);
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
}

export default Broker;



import fs from 'fs';
import udp from 'dgram';
import { Buffer } from 'buffer';


class Worker {

    constructor(ip, port) {
        this.ip = ip;
        this.port = port;
        this.client = udp.createSocket('udp4');

        this.client.on('message', function(msg, info){
            msg = JSON.parse(msg.toString());
            console.log('Data received from server : ');
            console.log({msg, info});
        });
    }

    _send(data) {
        const self = this;
        return new Promise(function(resolve, reject) {
            //buffer msg
            data = Buffer.from(data);
            
            //sending msg
            self.client.send(data, self.port, self.ip, function(error) {
                if(error){
                    reject(error);
                } else {
                    resolve(null);
                }
            });
        });
    }

    async subscribe(topic) {
        return await this._send(JSON.stringify({topic,type:'SUBSCRIBE'}));
    }
    async publish(topic, data) {
        return await this._send(JSON.stringify({topic,data,type:'PUBLISH'}));
    }
    close() {
        this.client.close();
    }

}

export default Worker;



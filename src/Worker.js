


import fs from 'fs';
import udp from 'dgram';
import { Buffer } from 'buffer';
import {strToData} from './utils';


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
        await this._send(JSON.stringify({topic,type:'SUBSCRIBE'}));
        await (new Promise(() => {})); //wait for infinity;
    }
    async publish(topic, data, forceFail) {
        return await this._send(JSON.stringify({
            topic,
            data: strToData(data),
            type:'PUBLISH',
            forceFail
        }));
    }
    close() {
        this.client.close();
    }

}

export default Worker;



import { strToData } from './utils.js';

import assert from 'assert';

export const broker_info = async (b1, topic) => {
    console.log({topic});
    try{
      return null;
    } catch (e) {
      console.log('ERROR', e);
    }
}
  

export const broker_send = async (b1, topic, message) => {
    console.log({topic, message});
    assert(!!topic)
    assert(!!message)
    try{
      const resp = await b1.sendData(parseInt(topic), strToData(message));
      return resp;
    } catch (e) {
      console.log('ERROR', e);
    }
  }
  
  export const broker_listen = async (b1, port) => {
    port = parseInt(port);
    
    const brokersInfo = await b1.supra.methods.getBrokers().call();

    if(brokersInfo.filter(b => b.account == b1.accountAdr).length == 0)
    {
        console.log('create broker', await b1.create('0x7f000001', port)); // '0x'+b1.toBytes('127',1)+'000001'
    }
    else {
      console.log('loading broker');
      await b1.load();
    }
    console.log('running broker with index', b1.id);
    b1.listen(port);
  }


  export const worker_subscribe = async (w, topic) => {    

    w.subscribe(topic);
  }
  export const worker_publish = async (w, topic, msg) => {    

    await w.publish(topic, msg);
    console.log('data sent');
    w.close();
  }
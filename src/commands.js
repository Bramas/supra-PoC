import Broker from './broker.js';

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
      const resp = await b1.sendData(parseInt(topic), Broker.strToData(message));
      return resp;
    } catch (e) {
      console.log('ERROR', e);
    }
  }
  
  export const broker_listen = async (b1, port) => {
    b1.listen(parseInt(port));
  }


  export const worker_subscribe = async (w, topic) => {    

    w.subscribe(topic);
  }
  export const worker_publish = async (w, topic, msg) => {    

    await w.publish(topic, msg);
    console.log('data sent');
    w.close();
  }
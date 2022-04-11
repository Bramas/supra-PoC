import Broker from './broker.js';

import assert from 'assert';

export const info = async (b1, topic) => {
    console.log({topic});
    try{
      return null;
    } catch (e) {
      console.log('ERROR', e);
    }
}
  
  

export const send = async (b1, topic, message) => {
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
  
  
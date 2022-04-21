import { strToData, toBytes } from './utils.js';

import assert from 'assert';
import { getBrokers, registerBroker } from './supraContract.js';
import Broker from './Broker.js';

export const broker_info = async (account, topic) => {
    console.log({topic});
    try{
      return null;
    } catch (e) {
      console.log('ERROR', e);
    }
}
  
export const broker_create = async (account, ip, port) => {

  ip = '0x'+ip.split('.').map(n => toBytes(parseInt(n), 1).slice(2)).join('');

  console.log('creating broker', ip, port);

  console.log('created broker', await registerBroker('0x7f000001', port, account));
}

  
export const broker_listen = async (account, id) => {


    const brokersInfo = await getBrokers();

    const brokerInfo = brokersInfo[id];

    if(!brokerInfo) throw `broker ${id} does not exists, please create it first`;
    console.log({brokerInfo});
    const broker = new Broker(brokerInfo, account)

    console.log('running broker with index', broker.id);
    await broker.run();
  }


  export const worker_subscribe = async (w, topic) => {    
    await w.subscribe(topic);
  }
  export const worker_publish = async (w, topic, msg, forceFail) => {    

    await w.publish(topic, msg, !!forceFail);
    console.log('data sent');
    w.close();
  }
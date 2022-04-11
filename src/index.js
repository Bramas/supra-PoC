

import {default as web3, account0} from './web3.js';
import Broker from './Broker.js';

import fs from 'fs';
import * as commands from './commands.js';

const contractAbi = JSON.parse(fs.readFileSync('build/contracts/Supra.json', 'utf8'))


const contract = new web3.eth.Contract(contractAbi['abi'], {
    gasPrice: web3.utils.toWei('50', 'gwei')
});
contract.options.address = process.env.SUPRA_ADDR;
contract.options.from = account0.address;

console.log('from '+account0.address);


const command = process.argv[2];
if(!commands[command])
{
  console.log('Available commands:');
  Object.keys(commands).forEach(c => console.log('  -',c));
  process.exit(1);
}


(async function() {
    const b1 = new Broker(contract, account0);
    const brokersInfo = await contract.methods.getBrokers().call();
    if(brokersInfo.filter(b => b.account == account0.address).length == 0)
    {
        console.log(await b1.create('0x01'));
    }
    console.log(await commands[command].apply(null, [b1, ...process.argv.slice(3)]));

    console.log(
        (await contract.getPastEvents('NewMessage',{fromBlock:'earliest', toBlock:'latest'}))
        .map(event => ({topic:event.returnValues.topic, data:Broker.dataToStr(event.returnValues.data)}))
    );
})()



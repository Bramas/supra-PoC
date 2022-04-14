

import {default as web3, account0} from './web3.js';
import Broker from './Broker.js';
import Worker from './Worker.js';

import fs from 'fs';
import * as commands from './commands.js';

const contractAbi = JSON.parse(fs.readFileSync('build/contracts/Supra.json', 'utf8'))


const contract = new web3.eth.Contract(contractAbi['abi'], {
    gasPrice: web3.utils.toWei('50', 'gwei')
});
contract.options.address = process.env.SUPRA_ADDR;
contract.options.from = account0.address;

console.log('from '+account0.address);


const command_type = process.argv[2];
const command = command_type+'_'+process.argv[3];

if(!commands[command])
{
  console.log('Available commands:');
  Object.keys(commands).forEach(c => console.log('  -',c.split('_',1).join(' ')));
  process.exit(1);
}


(async function() {
    if(command_type == 'broker') {
        const b1 = new Broker(contract, account0.address);
        const brokersInfo = await contract.methods.getBrokers().call();
        if(brokersInfo.filter(b => b.account == account0.address).length == 0)
        {
            console.log(await b1.create('0x01'));
        }
    
        console.log(await commands[command].apply(null, [b1, ...process.argv.slice(4)]));
    } else if (command_type == 'worker') {

        let ip = parseInt(process.argv[4]);
        let port = parseInt(process.argv[5]);  
        const w = new Worker(ip, port);

        console.log(await commands[command].apply(null, [w, ...process.argv.slice(6)]));
    }
    

    /*
    console.log(
        (await contract.getPastEvents('NewMessage',{fromBlock:'earliest', toBlock:'latest'}))
        .map(event => ({topic:event.returnValues.topic, data:Broker.dataToStr(event.returnValues.data)}))
    );*/
    
})()



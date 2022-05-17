import dotenv from 'dotenv'
dotenv.config();


const url = 'http://127.0.0.1:7545';

import Web3 from 'web3';

console.log(`Trying to connect to the Ethereum Blockchain at ${url}`);
const web3 = new Web3(new Web3.providers.WebsocketProvider(url));


if(!process.env.TRUFFLE_PK0) {
    console.log('you must create a .env file with a variable TRUFFLE_PK0=THE PRIVATE KEY OF ACCOUNT0');
    process.exit(1);
}


if(!process.env.SUPRA_ADDR) {
    console.log('you must create a .env file with a variable SUPRA_ADDR=ADDRESS OF SUPRA CONTRACT');
    process.exit(1);
}


export const accounts = [
    web3.eth.accounts.privateKeyToAccount(process.env.TRUFFLE_PK0),
    web3.eth.accounts.privateKeyToAccount(process.env.TRUFFLE_PK1),
    web3.eth.accounts.privateKeyToAccount(process.env.TRUFFLE_PK2)
];


web3.eth.defaultAccount = accounts[0].address;
web3.eth.accounts.wallet.add(accounts[0]);
web3.eth.accounts.wallet.add(accounts[1]);
web3.eth.accounts.wallet.add(accounts[2]);

export default web3;

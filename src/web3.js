const url = 'http://127.0.0.1:9545';

import Web3 from 'web3';

const web3 = new Web3(url)





export const account0 = web3.eth.accounts.privateKeyToAccount('b78064bfa40f876b39fb4f0f079f3f95126998662afd5558e46432f3b4510d74');


web3.eth.defaultAccount = account0.address;
web3.eth.accounts.wallet.add(account0);

export default web3;

const Supra = artifacts.require("Supra");



const BN = web3.utils.BN;



contract('Supra', (accounts) => {

  let chainId;

  beforeEach(async () => {
    chainId = await web3.eth.net.getId();
  });


  it('should put some brokers in the broker list', async () => {
    const supraInstance = await Supra.deployed();
    
    console.log(accounts[0],new BN('1').toString(16,4*2))

    await supraInstance.registerBroker('0x'+new BN('1').toString(16,4*2), { from: accounts[0], value:1000 });
    await supraInstance.registerBroker('0x'+new BN('2').toString(16,4*2), { from: accounts[1], value:1000 });
    
    const b1Balance = (await supraInstance.getBalance.call(accounts[0])).toNumber();
    const b2Balance = (await supraInstance.getBalance.call(accounts[1])).toNumber();

    console.log({b1Balance, b2Balance})
    assert.equal(b1Balance, 1000, "1000 wasn't in the first account");

    const brokers = await supraInstance.getBrokers.call();

    console.log(brokers);

    assert.equal(brokers.length, 2, "the number of brokers is not 2");
    
    let prev_hash = toBytes(0, 32);

    console.log('sending messages from ', accounts[0]);

    const topic = 1;
    let timestamp = 1;

    prev_hash = await sendMessageOnChain(
      supraInstance, accounts[0], 
      timestamp, topic, prev_hash, strToData('HELLO')
    );
    
    timestamp++;

    prev_hash = await sendMessageOnChain(
      supraInstance, accounts[0], 
      timestamp, topic, prev_hash, strToData('HELLO 2')
    );

    timestamp++;

    prev_hash = await sendMessageOffChain(
      accounts[0], 
      timestamp, topic, prev_hash, strToData('HELLO 3')
    );

  });


  //verify signature https://blog.chainsafe.io/how-to-verify-a-signed-message-in-solidity-6b3100277424
  // testing signatures onchain: https://github.com/kaleido-io/ecrecover/blob/master/contracts/Test.sol
  
});

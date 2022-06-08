const Supra = artifacts.require("Supra");

const Broker = require("esm")(module)('../src/Broker.js').default;
const commands = require("esm")(module)('../src/commands.js');


const { 
  setWeb3, 
  toBytes,     
  verifyMessage, 
  signMessage,
  hashMessage, 
  strToData,
  signHash,
  hashOpeningSub,
} = require("esm")(module)('../src/utils');
const { 
  setSupra, 
  getBrokers, 
  registerBroker,
  getBalance,
  sendMessageOnChain,
  accuse,
  defendOnChain,
  defendOffChain,
 } = require("esm")(module)('../src/supraContract');

setWeb3(web3);


const BN = web3.utils.BN;


contract('Supra', (accounts) => {

  const ports = [2222, 2223];

  const brokers = [null, null];

  let contract = null;

  before(async () => {

    let supraInstance = await Supra.deployed();

    contract = new web3.eth.Contract(supraInstance.abi, {
      gasPrice: web3.utils.toWei('50', 'gwei')
    });

    contract.options.address = supraInstance.address;
    setSupra(contract);


    await registerBroker('0x7f000001', ports[0], accounts[0])
    await registerBroker('0x7f000001', ports[1], accounts[1])
  });


  it('should contain 2 brokers', async () => {

    const brokersInfo = await getBrokers();

    assert.equal(brokers.length, 2);

    brokers[0] = new Broker(brokersInfo[0], accounts[0])
    brokers[1] = new Broker(brokersInfo[1], accounts[1])
  });

  it('should verify what it signed', async () => {

    let msg = {
      topic: '0:1',
      timestamp: 2,
      data: '2457367356',
      prev_hash: toBytes(0, 32)
    }

    const sig = await signMessage(msg, accounts[0]);
    msg = {...msg, ...sig};

    assert.ok(await verifyMessage(msg));
  });


  it('should have the initial balance', async () => {

    assert.equal(await getBalance(accounts[0]), 1000);

  });

  it('should defend itself with a message on-chain', async () => {

    // create an opening sub message
    let openingSub = {
      timestamp: 1,
      topic: '0:1',
      subscriber: accounts[1],
      prev_hash: toBytes(0, 32)
    }
    openingSub = {...openingSub, ...await signHash(hashOpeningSub(openingSub), accounts[0])};
    
    // create a message

    let msg0 = {
      topic: '0:1',
      timestamp: 4,
      data: strToData('HELLO'),
      prev_hash: toBytes(0, 32)
    };

    let sig = await brokers[0].signMessage(msg0);
    msg0 = {...msg0, ...sig};


    // A message is sent on chain
    const msg0_id = await sendMessageOnChain(
      msg0, accounts[0]
    );
    
    
    // Then the message just after is used to accuse the sender broker
    let msg1 = { ...msg0 };
    msg1.timestamp++;
    msg1.prev_hash = hashMessage(msg0)

    sig = await brokers[0].signMessage(msg1);
    msg1 = {...msg1, ...sig};
    
    const accusation_id = await accuse(msg1, openingSub, accounts[1]); //account1 is the receiver accusing the sender


    // but the broker can defend itself by showing the id of the message on-chain
    await defendOnChain(accusation_id, msg0_id, accounts[0]);

    // After a successful defence, the defendand earn 10 and 
    // the accuser lose 10 (but the accuser paid 10 to call the accuse method)
    assert.equal(await getBalance(accounts[0]), 1010);
    assert.equal(await getBalance(accounts[1]), 1000);
      
  });

  
  it('should defend itself with a message off-chain', async () => {

    // create an opening sub message
    let openingSub = {
      timestamp: 1,
      topic: '0:1',
      subscriber: accounts[1],
      prev_hash: toBytes(0, 32)
    }
    openingSub = {...openingSub, ...await signHash(hashOpeningSub(openingSub), accounts[0])};

    
    // create a message

    let msg0 = {
      topic: '0:1',
      timestamp: 4,
      data: strToData('HELLO'),
      prev_hash: toBytes(0, 32)
    };

    let sig = await brokers[0].signMessage(msg0);
    msg0 = {...msg0, ...sig};


    // The message is acknowledged by the receiver
    const msg0_ack = await signHash(hashMessage(msg0), accounts[1]);
    
    
    // Then the message just after is used to accuse the sender broker
    let msg1 = { ...msg0 };
    msg1.timestamp++;
    msg1.prev_hash = hashMessage(msg0)

    sig = await brokers[0].signMessage(msg1);
    msg1 = {...msg1, ...sig};
    
    const accusation_id = await accuse(msg1, openingSub, accounts[1]); //account1 is the receiver accusing the sender

    // but the broker can defend itself by showing the message and the acknowledgment
    await defendOffChain(accusation_id, msg0, msg0_ack, accounts[0]);

    // After a successful defence, the defendand earn 10 and 
    // the accuser lose 10 (but the accuser paid 10 to call the accuse method)
    assert.equal(await getBalance(accounts[0]), 1020); // due to the previous test, 1010 + 10
    assert.equal(await getBalance(accounts[1]), 1000);

  });
  
});

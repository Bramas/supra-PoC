// SPDX-License-Identifier: MIT
pragma solidity >=0.8.13;

contract Supra {

	uint constant FINE = 10;
	uint constant REGISTER_FEE = FINE * 10;
	uint constant ACCUSATION_DEADLINE_DAYS = 3;
	uint constant MESSAGE_MAX_DELAY_HOURS = 2;

	struct Accusation {
		address payable accuser;
		uint defendant_id;

		// The message
		uint32 topic;
		bytes32 prev_hash;
		bytes32 data_hash;
		uint64 timestamp;
		uint8 sig_v;
		bytes32 sig_r;
		bytes32 sig_s;

		// The proof that the subscription exists
		
		uint64 open_timestamp;
		bytes32 open_prev_hash;
		uint8   open_sig_v;
		bytes32 open_sig_r;
		bytes32 open_sig_s;

		bool valid;
		uint256 deadline;
		uint block_number;
	}

	struct Broker {
		address payable account;
		bytes4 ipAddr;
	}

	struct Message {
		bytes data;
		uint64  timestamp;
		bytes32 prev_hash;
		uint block_number;
	}

	mapping (address => uint) balances;
	
	Accusation[] accusations;
	Broker[] brokers;
	mapping (address => mapping (uint32 => Message[])) messages;

	event Transfer(address indexed _from, address indexed _to, uint256 _value);

	event NewMessage(address indexed from, uint64 indexed timestamp, uint32 indexed topic, bytes32 prev_hash, bytes data);

	event BrokerInvalid(uint broker_id);

	event LogBytes32(bytes32 b);
	event LogBytes(bytes b);

	constructor () {
		
	}


	function registerBroker(bytes4 _ipAddr) public payable
	{
		require(msg.value >= REGISTER_FEE);
		for (uint i = 0; i < brokers.length; i++) {
			require(brokers[i].account != msg.sender);
		}

		balances[msg.sender] += msg.value;
		brokers.push(Broker({
			account: payable(msg.sender), 
			ipAddr: _ipAddr
		}));
	}

	function getBrokers() public view returns(Broker[] memory)
	{
		return brokers;
	}


    function VerifyMessage(bytes32 _hashedMessage, uint8 _v, bytes32 _r, bytes32 _s) 
		public pure returns (address) 
	{
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 prefixedHashMessage = keccak256(abi.encodePacked(prefix, _hashedMessage));
        address signer = ecrecover(prefixedHashMessage, _v, _r, _s);
        return signer;
    }

	function sendMessage(
		uint32 topic, 
		bytes memory data, 
		uint64 timestamp, 
		bytes32 prev_hash, 
		uint8 sig_v, 
		bytes32 sig_r, 
		bytes32 sig_s
	) public pure returns (address)
	{
		return VerifyMessage(
				messageHash(timestamp,topic, hashData(data), prev_hash), 
				sig_v, sig_r, sig_s);
	}
	function sendMessage(
		uint32 topic, 
		bytes memory data, 
		uint64 timestamp, 
		bytes32 prev_hash
	) public 
	{
		messages[msg.sender][topic].push(Message({
			data: data,
			timestamp: timestamp,
			prev_hash: prev_hash,
			block_number: block.number
		}));
		emit NewMessage(msg.sender, timestamp, topic, prev_hash, data);

	}

	function messageHash(
		uint64 timestamp,
	 	uint32 topic, 
		bytes32 data_hash, 
		bytes32 prev_hash
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(timestamp, topic, data_hash, prev_hash));
    }
	function hashData(
        bytes memory data
    ) public pure returns (bytes32) {
        return keccak256(data);
    }

	function hashOpeningSub(
		uint64 timestamp,
		uint32 topic,
        address subscriber,
		bytes32 prev_hash
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(timestamp, topic, subscriber, prev_hash));
    }

	function ackHash(
		uint8 sig_v,
		bytes32 sig_r,
		bytes32 sig_s
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(sig_v, sig_r, sig_s));
    }


	function accuse(
		uint defendant_id,
	 	uint32 topic, 
		bytes32 prev_hash, 
		bytes32 data_hash,
		uint64 timestamp, 
		uint8 sig_v,
		bytes32 sig_r,
		bytes32 sig_s,

		uint64 open_timestamp,
		bytes32 open_prev_hash,
		uint8   open_sig_v,
		bytes32 open_sig_r,
		bytes32 open_sig_s
		
		) public payable
	{
		require(msg.value >= FINE);
		require(block.timestamp >= timestamp + (MESSAGE_MAX_DELAY_HOURS * 1 hours));

		address defendant = brokers[defendant_id].account;
		require(defendant == VerifyMessage(
			messageHash(timestamp,topic,data_hash,prev_hash), 
			sig_v, sig_r, sig_s)
		);

		require(defendant == VerifyMessage(
			hashOpeningSub(open_timestamp, topic, msg.sender, open_prev_hash), 
			open_sig_v, open_sig_r, open_sig_s)
		);


		balances[msg.sender] += msg.value;

		accusations.push(Accusation({
			accuser: payable(msg.sender), 
			defendant_id: defendant_id, 
			topic: topic, 
			timestamp: timestamp,
			data_hash: data_hash, 
			prev_hash: prev_hash, 
			sig_v: sig_v,
			sig_r: sig_r,
			sig_s: sig_s,
			valid: true,
			deadline: block.timestamp + (ACCUSATION_DEADLINE_DAYS * 1 days),
			block_number: block.number,
			open_timestamp: open_timestamp,
			open_prev_hash: open_prev_hash,
			open_sig_v: open_sig_v,
			open_sig_r: open_sig_r,
			open_sig_s: open_sig_s
		}));
	}

	function defendClosedSubOnChain(
		uint32 accusation_id, 
		uint32 message_id)
		public
	{
		uint32 topic = accusations[accusation_id].topic;
		uint defendant_id = accusations[accusation_id].defendant_id;
		address defendant = brokers[defendant_id].account;

		uint64 timestamp = accusations[accusation_id].timestamp;

		bytes32 open_hash = hashOpeningSub(
			accusations[accusation_id].open_timestamp,
			accusations[accusation_id].topic,
			accusations[accusation_id].accuser,
			accusations[accusation_id].open_prev_hash);

		Message storage m = messages[defendant][topic][message_id]; 

		require(m.timestamp < timestamp);		
		require(m.block_number < accusations[accusation_id].block_number);
		require(m.data[0:32] == open_hash);

		_payeAccuserFine(accusation_id);
		
	}
	function defendOnChain(uint32 accusation_id, uint32 message_id)
		public
	{
		uint32 topic = accusations[accusation_id].topic;
		uint defendant_id = accusations[accusation_id].defendant_id;
		address defendant = brokers[defendant_id].account;

		bytes32 missing_hash = accusations[accusation_id].prev_hash;

		Message storage m = messages[defendant][topic][message_id]; 
		bytes32 proof_hash = messageHash(m.timestamp, topic, hashData(m.data), m.prev_hash); 
		
		require(missing_hash == proof_hash);
		require(accusations[accusation_id].block_number > m.block_number);
		
		_payeAccuserFine(accusation_id);
		
	}
	function defendOffChain(
		uint32 accusation_id, 

		// the message
		uint32 topic, 
		uint64 timestamp,
		bytes32 dataHash,
		bytes32 prevHash,
		
		// the signature of its hash by the accuser (i.e. the ack of the message)
		uint8 _v, 
		bytes32 _r, 
		bytes32 _s)
		public
	{
		bytes32 msgHash = messageHash(timestamp, topic, dataHash, prevHash);

		address accuser = accusations[accusation_id].accuser;

		require(accuser == VerifyMessage(msgHash, _v, _r, _s));
		require(timestamp > accusations[accusation_id].timestamp);
				
		_payeAccuserFine(accusation_id);
	}

	function redeemAccusationFine(uint accusation_id) private {

		require(accusations[accusation_id].valid);
		require(accusations[accusation_id].deadline < block.timestamp);

		address accuser = accusations[accusation_id].accuser;
		uint defendant_id = accusations[accusation_id].defendant_id;
		address defendant = brokers[defendant_id].account;

		require(balances[defendant] >= FINE);
		require(balances[accuser] >= FINE);

		balances[defendant] -= FINE;
		balances[accuser] -= FINE;
		payable(accuser).transfer( 2 * FINE );

		// after the payment, the broker should still be able to paye a fine
		if(balances[defendant] < FINE) {
			emit BrokerInvalid(defendant_id);
		}
	}

	function _payeAccuserFine(uint accusation_id) private {

		address accuser = accusations[accusation_id].accuser;
		address defendant = brokers[accusations[accusation_id].defendant_id].account;
		accusations[accusation_id].valid = false;

		require(balances[accuser] >= FINE);

		balances[accuser] -= FINE;
		balances[defendant] += FINE;
	
	}

	function getBalance(address addr) public view returns(uint) {
		return balances[addr];
	}

}

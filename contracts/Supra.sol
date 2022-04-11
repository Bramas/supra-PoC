// SPDX-License-Identifier: MIT
pragma solidity >=0.8.13;

contract Supra {

	uint constant FINE = 10;
	uint constant REGISTER_FEE = FINE * 10;
	uint constant ACCUSATION_DEADLINE_DAYS = 3;

	struct Accusation {
		address payable accuser;
		uint defendant_id;
		uint32 topic;
		bytes32 prev_hash;
		bytes32 data_hash;
		uint64 timestamp;

		uint8 sig_v;
		bytes32 sig_r;
		bytes32 sig_s;
		bool valid;
		uint256 deadline;
	}

	struct Broker {
		address payable account;
		bytes4 ipAddr;
	}

	struct Message {
		bytes data;
		uint64  timestamp;
		bytes32 prev_hash;
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
			prev_hash: prev_hash
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
		bytes32 sig_s) public payable
	{
		require(msg.value >= FINE);

		address defendant = brokers[defendant_id].account;
		require(defendant == VerifyMessage(messageHash(timestamp,topic,data_hash,prev_hash), sig_v, sig_r, sig_s));
		balances[msg.sender] += msg.value;

		accusations.push(Accusation({
			accuser: payable(msg.sender), 
			defendant_id: defendant_id, 
			topic: topic, 
			prev_hash: prev_hash, 
			data_hash: data_hash, 
			timestamp: timestamp,
			sig_v: sig_v,
			sig_r: sig_r,
			sig_s: sig_s,
			valid: true,
			deadline: block.timestamp + (ACCUSATION_DEADLINE_DAYS * 1 days)
		}));
	}

	function defendOnChain(uint32 accusation_id, uint32 message_id)
		public
	{
		uint32 topic = accusations[accusation_id].topic;
		address defendant = brokers[accusations[accusation_id].defendant_id].account;
		//bytes32 missing_hash = accusations[accusation_id].data_hash;
		uint64 missing_timestamp = accusations[accusation_id].timestamp;
		//address accuser = accusations[accusation_id].accuser;

		//bytes32 data_hash = hashData(Message[defendant][topic].data);
		uint64 timestamp = messages[defendant][topic][message_id].timestamp;
		require(missing_timestamp == timestamp);
		
		_payeAccuserFine(accusation_id);
		
	}
	function defendOffChain(uint32 accusation_id, uint8 _v, bytes32 _r, bytes32 _s)
		public
	{
		uint8 sig_v = accusations[accusation_id].sig_v;
		bytes32 sig_r = accusations[accusation_id].sig_r; 
		bytes32 sig_s = accusations[accusation_id].sig_s;

		address accuser = accusations[accusation_id].accuser;
		require(accuser == VerifyMessage(ackHash(sig_v, sig_r, sig_s), _v, _r, _s));
				
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

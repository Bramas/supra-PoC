
# Experiment Steps

### Registering two brokers on the blockchain

<img src="./figures/SUPRA POC-Page-1.svg" width="400" />

### Connecting a device to a broker, listenning to a topic of the second broker.

<img src="./figures/SUPRA POC-SUB.svg" width="400" />

### Publishing a content, the message is sent off-chain
<img src="./figures/SUPRA POC-DATA off.svg" width="400" />

### Publishing a content, the message is sent on-chain
<img src="./figures/SUPRA POC-DATA on.svg" width="400" />



# Installation

then in another terminal execute
```
npm install
npm install -g tuffle
```



# Steps

### Start truffle
```
truffle develop
```
In the truffle console, write:
```
migrate
```

### Create 2 brokers
```
node src/mod_index.js broker create 127.0.0.1 2222
node src/mod_index.js broker create 127.0.0.1 2223 --pk1
```

### Start the brokers
Then you can open 2 terminals to start 2 brokers:
```
node src/mod_index.js broker listen 0
```

```
node src/mod_index.js broker listen 1 --pk1
```


### Start the subscriber and the publisher
Open two more terminals to start 2 workers:
One worker connected to the first broker, but subscribed to the second broker:
```
node src/mod_index.js worker subscribe localhost 2222 1:1
```

and one worker connected to the second broker that publishes a data:
One worker connected to the first broker, but subscribed to the second broker:
```
node src/mod_index.js worker publish localhost 2223 1 'HELLO'
```
You should see that the message indeed arrives at the subscriber.


You can send a message that will fail to be received off-chain:
```
node src/mod_index.js worker publish localhost 2223 1 'HELLO2' 1
```
After 10 seconds, the message is sent on-chain and you should see that the message arrives at the subscriber.

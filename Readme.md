

```
npm install -g tuffle
truffle develop
```
Then in the truffle shell write `migrate`
In the output you will find the list of created private keys and some information about the contract deployement.

Create an `.env` file containing two keys: 
* `TRUFFLE_PK0`: the private key of the first account 
* `TRUFFLE_PK1`: the private key of the second account 
* `TRUFFLE_PK2`: the private key of the third account 
* `SUPRA_ADDR`: the address of the supra contract


then in another terminal execute
```
npm install
```

Then you can open 4 terminals to start 2 brokers:
```
node src/mod_index.js broker listen 2222
```

```
node src/mod_index.js broker listen 2223 --pk1
```

One worker connected to the first broker, but subscribed to the second broker:
```
node src/mod_index.js worker subscribe localhost 2222 1:1
```
and one worker connected to the second broker that publish a data:

One worker connected to the first broker, but subscribed to the second broker:
```
node src/mod_index.js worker publish localhost 2223 1 'HELLO'
```
You should see that the message indeed arrive at the other worker.

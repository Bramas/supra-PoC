

```
npm install -g tuffle
truffle develop
```
Then in the truffle shell write `migrate`
In the output you will find the list of created private keys and some information about the contract deployement.

Create an `.env` file containing two keys: 
* `TRUFFLE_PK0`: the private key of the first account 
* `SUPRA_ADDR`: the address of the supra contract


then in another terminal execute
```
npm install
node src/mod_index.js send 1 Hello
```
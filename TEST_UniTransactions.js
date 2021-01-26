// getPastLogs

const Web3 = require('web3')

const main_URL = 'https://mainnet.infura.io/v3/201292230a8a4241b6ba2b14a00fca47'
const web3 = new Web3(main_URL)

var currentBlock = web3.eth.getBlock('latest').then(return)
console.log(currentBlock)

var SETTINGS = {
    fromBlock: web3.eth.getBlock('latest'),
    toBlock: web3.eth.getBlock('pending'),
    address: '0xe069CB01D06bA617bCDf789bf2ff0D5E5ca20C71' // 1inch.echange v2: Router https://etherscan.io/address/0xe069cb01d06ba617bcdf789bf2ff0d5e5ca20c71
}

web3.eth.getPastLogs(SETTINGS)
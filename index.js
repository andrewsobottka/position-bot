

require('dotenv').config()
const fs = require('fs')
const express = require('express')
const http = require('http')
const Web3 = require('web3')
const _ = require('lodash')
const HDWalletProvider = require('@truffle/hdwallet-provider')
const bigNumber = require('bignumber.js')
const inputs = require('./inputs.js')
const { Contract } = require('web3-eth-contract')
const approve = require('./approve.js')
var axios = require('axios')

// most up-to-date version of contractData is at https://github.com/andrewsobottka/eth-data/blob/main/contractData.json
const contractData = JSON.parse(fs.readFileSync('./contractData.json'))

//----- SERVER CONFIG -----//
const PORT = process.env.PORT || 5000
const app = express()
const server = http.createServer(app).listen(PORT, () => console.log(`Listening on ${ PORT }`))

//----- WEB 3 CONFIG -----//
const web3 = new Web3(new HDWalletProvider(process.env.PRIVATE_KEY, process.env.RPC_URL))
web3.eth.transactionConfirmationBlocks = 1; // USE FOR TESTING IN GANACHE

//----- CONTRACT DETAILS for 1inch -----//
const poolData = contractData['1inch']
const pool = new web3.eth.Contract(poolData.abi, poolData.address)
pool.transactionConfirmationBlocks = 1; // USE FOR TESTING IN GANACHE

//----- CONTRACT for Target Token -----//
const targetTokenData = contractData[inputs.targetToken]
const targetToken = new web3.eth.Contract(targetTokenData.abi, targetTokenData.address)

//------ CONTRACT for Base Token -----//
const baseTokenData = contractData[inputs.baseToken]
// n/a if Base Token is ETHEREUM


//----- USER INPUTS -----//
//const baseTokenApproved = web3.utils.toWei(inputs.baseTokenApproved, 'mwei') // converted to units of wei
var minTrade = web3.utils.toWei(inputs.minTradeSize, 'ether') // In units of base token, converted to no decimals
var maxTrade = web3.utils.toWei(inputs.maxTradeSize, 'ether') // In units of base token, converted to no decimals
var limitPriceInverse = web3.utils.toWei((1/ inputs.maxLimitPrice).toString(),'ether') // min num. of target tokens to receive per 1 base token
var limitPrice = web3.utils.toWei(inputs.maxLimitPrice, 'ether') // max base tokens to pay for 1 target token
var baseTokenApproved = web3.utils.toWei(inputs.targetPosition, 'ether') // Setting approval request equal to target position
var tradingAccount = process.env.ACCOUNT

console.log('Limit price of ',targetTokenData.symbol,'is',web3.utils.fromWei(limitPrice,'ether'),baseTokenData.symbol)
console.log('Must receive at least ',web3.utils.fromWei(limitPriceInverse, 'ether'),targetTokenData.symbol,'for every 1',baseTokenData.symbol)

let splitExchanges = [
    "Uniswap", 
    "Kyber", 
    "Bancor", 
    "Oasis", 
    "CurveCompound", 
    "CurveUsdt", 
    "CurveY", 
    "CurveBinance", 
    "CurveSynthetix", 
    "UniswapCompound", 
    "UniswapChai", 
    "UniswapAave", 
    "Mooniswap", 
    "UniswapV2", 
    "UniswapV2ETH", 
    "UniswapV2DAI", 
    "UniswapV2USDC", 
    "CurvePax", 
    "CurveRenBtc", 
    "CurveTBtc", 
    "DforceSwap", 
    "Shellexchangers"
]

//////////////////////////////////////////////////////////////////////////////
//                               FUNCTIONS                                  //
//////////////////////////////////////////////////////////////////////////////

let priceMonitor
let monitoringPrice = false

async function monitorPrice() {
    if (monitoringPrice) {
        return
    }
    
    console.log('--- Refreshing ---')

    //----- Check Total Balance in Wallet -----//
    //  If total balance in wallet is less than target balance, continue; otherwise
    //  the target balance has been reached, exit the program.
    let balance
    balance = await web3.eth.getBalance(process.env.ACCOUNT)
    balance = web3.utils.fromWei(balance.toString(), 'ether')
    console.log(baseTokenData.symbol, 'balance in Wallet: ', balance)
    
    balance = await targetToken.methods.balanceOf(process.env.ACCOUNT).call()
    balance = web3.utils.fromWei(balance.toString(), 'ether')
    console.log(targetTokenData.symbol, 'balance in Wallet: ', balance)
    
    if (balance >= inputs.targetPosition) {
        console.log('Target of', inputs.targetPosition,' reached!')
        monitoringPrice = false
        clearInterval(priceMonitor)
        return
    } 


    //----- ERC20 Token Approval -----//
    approvalStatus = JSON.parse(fs.readFileSync('approvalStatus.json'))
    currApprovedAmount = approvalStatus.approvedAmount
    if (currApprovedAmount <= maxTrade) {
        currApprovedAmount = await approve.approveToken(baseToken, contractData.address, baseTokenApproved, tradingAccount)
        console.log('Additional USDC Approved: ', currApprovedAmount)
        var newApprovedAmount = { approvedAmount: currApprovedAmount}
        fs.writeFileSync('./approvalStatus.json', JSON.stringify(newApprovedAmount, null, 2) , 'utf-8');
        return
    }
    

    //----- Swap -----//
    console.log('Checking price for',inputs.maxTradeSize,baseTokenData.symbol)
    monitoringPrice = true

    try {
        //----- Checking Price -----//
        let SCresult = await pool.methods.getExpectedReturn(
            baseTokenData.address,
            targetTokenData.address,
            web3.utils.toWei(inputs.maxTradeSize,'ether'),
            100,
            0
        ).call()
        
        quotedPrice = 1 / (web3.utils.fromWei(SCresult.returnAmount,'ether') / inputs.maxTradeSize)
        console.log('Price Quoted:', quotedPrice.toString(),baseTokenData.symbol,'per',targetTokenData.symbol)
        console.log('Distributions by Smart Contract:')
        for (let index = 0; index < SCresult.distribution.length; index++) {
            console.log('-',splitExchanges[index], ":", SCresult.distribution[index]);
        }

        let currentPrice = Number(quotedPrice)
        let targetPrice = Number(inputs.maxLimitPrice)
        if (currentPrice < targetPrice) {     
            //----- Execute Buy -----//
            // Swap is only performed if current Spot Price is below the target price.
            
            console.log('Price is below Max Limit')
            console.log('Executing swap...')
            
            var gasPrice = await web3.eth.getGasPrice()
            gasPrice = web3.utils.toBN(gasPrice * 1.10) // will pay 10% above current avg. gas prices to expedite transaction

            var gasLimit = await pool.methods.swap(
                baseTokenData.address,
                targetTokenData.address,
                web3.utils.toWei(inputs.maxTradeSize,'ether'),
                SCresult.returnAmount, //No slippage
                SCresult.distribution,
                0
            ).estimateGas({
                from: process.env.ACCOUNT,
                value: web3.utils.toWei(inputs.maxTradeSize,'ether')
            })
            
            var gasLimit = gasLimit
            var gasPrice = await web3.eth.getGasPrice()
            gasPrice = web3.utils.toBN(gasPrice * 1.10) // will pay 10% above current avg. gas prices to expedite transaction
            
            var swapExecution = await pool.methods.swap(
                baseTokenData.address,
                targetTokenData.address,
                web3.utils.toWei(inputs.maxTradeSize,'ether'),
                SCresult.returnAmount, //No slippage
                SCresult.distribution,
                0
            ).send({
                from: process.env.ACCOUNT,
                gas: gasLimit,
                gasPrice: gasPrice,
                value: web3.utils.toWei(inputs.maxTradeSize,'ether')
            })
            
            console.log(swapExecution)

            //----- Update Approval Counter -----//
            currApprovedAmount = currApprovedAmount - maxTrade
            var newApprovedAmount = { approvedAmount: currApprovedAmount}
            fs.writeFileSync('./approvalStatus.json', JSON.stringify(newApprovedAmount, null, 2) , 'utf-8');

            console.log('--- Swap Complete ---')

        } else {
            console.log('The price is above Max Limit')
        }
        
        //clearInterval(priceMonitor)

    } catch (error) {
        console.error(error)
        monitoringPrice = false
        clearInterval(priceMonitor)
        return
    }
    
    monitoringPrice = false
}

//----- Continuously Run Monitoring Function -----//
// Checks pool every n seconds
const POLLING_INTERVAL = process.env.POLLING_INTERVAL || 2000 // 2 Seconds
priceMonitor = setInterval(async () => { await monitorPrice() }, POLLING_INTERVAL)

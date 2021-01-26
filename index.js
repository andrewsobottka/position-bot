

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

// Look into how I can store/read a file online; goal is to only
//  have to update one version of this file, not keep copies in each
//  project folder I work in.
//const contractData = JSON.parse(fs.readFileSync('https://github.com/andrewsobottka/eth-data/blob/main/contractData.json'))
const contractData = JSON.parse(fs.readFileSync('./contractData.json'))


//----- SERVER CONFIG -----//
const PORT = process.env.PORT || 5000
const app = express()
const server = http.createServer(app).listen(PORT, () => console.log(`Listening on ${ PORT }`))


//----- WEB 3 CONFIG -----//
const main_URL = 'https://mainnet.infura.io/v3/201292230a8a4241b6ba2b14a00fca47'// TEMPORARY FOR TESTING
//const web3 = new Web3(new HDWalletProvider(process.env.PRIVATE_KEY, process.env.RPC_URL))
const web3 = new Web3(main_URL)
web3.eth.transactionConfirmationBlocks = 1;

//----- CONTRACT DETAILS for 1inch -----//
const poolData = contractData['1inch']
const pool = new web3.eth.Contract(poolData.abi, poolData.address)
pool.transactionConfirmationBlocks = 1;

//----- CONTRACT for Target Token -----//
const targetTokenData = contractData[inputs.targetToken]
const targetToken = new web3.eth.Contract(targetTokenData.abi, targetTokenData.address)

//------ CONTRACT for USDC -----//
const baseTokenData = contractData[inputs.baseToken]
const baseToken = new web3.eth.Contract(baseTokenData.abi, baseTokenData.address)

//----- USER INPUTS -----//
//const baseTokenApproved = web3.utils.toWei(inputs.baseTokenApproved, 'mwei') // converted to units of wei
var minTrade = web3.utils.toWei(inputs.minTradeSize, 'mwei') // In units of base token, converted to no decimals
var maxTrade = web3.utils.toWei(inputs.maxTradeSize, 'mwei') // In units of base token, converted to no decimals
var limitPriceInverse = web3.utils.toWei((1/ inputs.maxLimitPrice).toString(),'ether') // min num. of target tokens to receive per 1 base token
var limitPrice = web3.utils.toWei(inputs.maxLimitPrice, 'mwei') // max base tokens to pay for 1 target token
var baseTokenApproved = web3.utils.toWei(inputs.targetPosition, 'mwei') // Setting approval request equal to target position
var tradingAccount = process.env.ACCOUNT

console.log('Limit price of ',targetTokenData.symbol,'is',web3.utils.fromWei(limitPrice,'mwei'),baseTokenData.symbol)
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
    balance = await targetToken.methods.balanceOf(process.env.ACCOUNT).call()
    balance = web3.utils.fromWei(balance.toString(), 'ether')
    console.log(targetTokenData.symbol, 'balance in Wallet: ', balance)
    
    if (balance >= inputs.targetPosition) {
        console.log('Target balance reached!')
        monitoringPrice = false
        clearInterval(priceMonitor)
        return
    } 

    /*
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
    */
    //----- Swap -----//
    console.log('Checking price for',inputs.maxTradeSize,baseTokenData.symbol)
    console.log(baseTokenData.symbol,baseTokenData.address)
    console.log(targetTokenData.symbol,targetTokenData.address)
    monitoringPrice = true

    try {
        //----- Checking Price USING API -----//
        let APIresult = await axios.get('https://api.1inch.exchange/v2.0/quote', {
            params: {
                fromTokenAddress: baseTokenData.address,
                toTokenAddress: targetTokenData.address,
                amount: web3.utils.toWei(inputs.maxTradeSize,'mwei'),
                complexityLevel: '0',
                parts: '0',
                virtualParts: '0',
                mainRouteParts: '1'
            }
        })
        
        //----- Checking Price USING SMART CONTRACT -----//
        let SCresult = await pool.methods.getExpectedReturn(
            baseTokenData.address,
            targetTokenData.address,
            web3.utils.toWei(inputs.maxTradeSize,'mwei'),
            100,
            0
        ).call()


        //----- DISTRIBUTIONS -----//
        console.log('----- Smart Routing by API -----')
        quotedPrice = web3.utils.fromWei(APIresult.data.fromTokenAmount,'mwei') / web3.utils.fromWei(APIresult.data.toTokenAmount, 'ether')
        console.log('Price Quoted by API: ', quotedPrice.toString())
        //console.log('Trading',web3.utils.fromWei(APIresult.data.fromTokenAmount, 'mwei'),APIresult.data.fromToken.symbol, `(${APIresult.data.fromToken.address})`)
        //console.log('For',web3.utils.fromWei(APIresult.data.toTokenAmount, 'ether'),APIresult.data.toToken.symbol,`(${APIresult.data.toToken.address})`)
        console.log(APIresult.data.protocols[0])

        console.log('----- Distributions by Smart Contract -----')
        console.log('Price Quoted by Smart Contract:', web3.utils.fromWei(SCresult.returnAmount, 'ether'))
        for (let index = 0; index < SCresult.distribution.length; index++) {
            console.log(splitExchanges[index], ":", SCresult.distribution[index]);
        }

        /*
        let currentPrice = Number(quotedPrice)
        let targetPrice = Number(inputs.maxLimitPrice)
        if (currentPrice < targetPrice) {     
            //----- Execute Buy -----//
            // Swap is only performed if current Spot Price is below the target price.
            
            console.log('Price is right!')
            
            //await tokenExchange()

            //----- Update Approval Counter -----//
            //currApprovedAmount = currApprovedAmount - maxTrade
            //var newApprovedAmount = { approvedAmount: currApprovedAmount}
            //fs.writeFileSync('./approvalStatus.json', JSON.stringify(newApprovedAmount, null, 2) , 'utf-8');

        //    console.log('--- Swap Complete ---')
        } else {
            console.log('The price is too high!')
        }
        */

        clearInterval(priceMonitor)

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

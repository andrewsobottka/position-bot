
/***** User Inputs *****/
exports.baseToken = 'USDC' // Token we'll sell to buy target token
exports.targetToken = 'WNXM' // Token we want to acquire
exports.targetPosition = '10000' // Reach a total position of 10,000 target tokens
//exports.minLimitPrice = 'n/a' // only buy if 1 target token <= 30.50 base tokens
exports.maxLimitPrice = '30.50' // only buy if 1 target token <= 30.50 base tokens
exports.minTradeSize = '1000' // Min Spend >= 1,000 USDC at a time
exports.maxTradeSize = '5000' // Max Spend <= 3,000 USDC at a time
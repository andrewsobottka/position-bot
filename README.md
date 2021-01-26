

## Development Plan

### Create Config file:
 - Base Token for trading
 - Target Token to buy/sell
 - How much of the Target token we want to own {
    - if less than current balance, Sell
    - if more than current balance, Buy }
 - The price we want to transact with the Target Token
    - if buying, Price is upper bound
    - if selling, Price is lower bound
 - The Minimum amount of Base Token per transaction
 - The Maximum amount of Base Token per transaction


### Set a variable to keep track of how much NXM we currently own
 - need a wallet address
 - need to check blance of WNXM

### Integrate with 1inch
 - Should only buy when a pending sell order meets criteria above
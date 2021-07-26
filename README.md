# New Bedford

![Node.js CI](https://github.com/haydenshively/new-bedford/workflows/Node.js%20CI/badge.svg)

New Bedford is a (massively) upgraded version of [Nantucket](https://github.com/haydenshively/Nantucket)
that some of you are probably familiar with. I'm releasing this now because I don't feel like making upgrades
for the new Chainlink oracle setup (and I don't want to pay for [bloXroute](https://bloxroute.com/) to backrun
the price updates). Despite this lack of compatibility, I hope something in here is useful to someone.

## Features

### Solidity

- 🦄 Liquidate via Uniswap (v2) flash swaps
  - Intelligently select between 1 hop vs 2 hop paths based on expected slippage
- 🔢 Liquidate multiple accounts at once
- 🧮 Compute repay amounts atomically on-chain
- ⛽️ Burn CHI to reduce gas costs **or** use custom CHI-like implementation to avoid
extraneous `transfer`s and `emit`s
  - https://github.com/matnad/liquid-gas-token
- 🏷 Atomically post prices to Compound's Open Price Feed
  - _This won't work anymore because of Chainlink 😞_
- ⛏ Updateable `MinerPayer` in case Flashbots makes searchers pay a contract
- 📦 Adjust % paid to miner at bundle creation time
- 🥸 Incognito mode for PGAs - rotate to & from addresses after each successful transaction

> NOTE: These features are spread across the [ethereum](./ethereum) and [ethereum-mev](./ethereum-mev)
> directories. `ethereum-mev` is generally better (although it should really be called `ethereum-flashbots`)

### TypeScript

- Fetch accounts from Compound's API on startup
- Subscribe to Compound contract events to stay up-to-date after that
- Poll Coinbase Pro API and see if new prices make any account liquidatable
  - _This won't work anymore because of Chainlink 😞_
- Keep track of min & max prices since last on-chain posting, and use combination most likely to make an account liquidatable
- Split architecture that communicates over IPC
  - [delegator](./services/delegator) subscribes to events and watches for accounts to become liquidatable
  - [txmanager](./services/txmanager) receives liquidatable accounts + params from `delegator` and formulates transactions for PGAs
  - [txmanager-mev](./services/txmanager-mev) receives liquidatable accounts + params from `delegator` and formulates transactions for flashbots
- Extensive logging with Winston; optional Slack bot integration
- Decent test coverage

> NOTE: Most of this won't work without my `web3-blocks` library, which is still private. But if you can infer
> what functionality needs to be there and replicate the API, you might be able to get this running.

## Usage and Disclaimer

Don't. You will almost certainly loose money. Feel free to admire the code or use it as
a reference point, but please don't try to run it as-is.

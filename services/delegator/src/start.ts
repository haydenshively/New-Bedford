import ipc from 'node-ipc';
import { EventData } from 'web3-eth-contract';

import { Big, providerFor } from '@goldenagellc/web3-blocks';

import ICompoundBorrower from './types/ICompoundBorrower';
import { CTokens } from './types/CTokens';
import cTokens from './contracts/CToken';

import comptroller from './contracts/Comptroller';
import openOraclePriceData from './contracts/OpenOraclePriceData';
import uniswapAnchoredView from './contracts/UniswapAnchoredView';

import PriceList from './PriceList';

import StatefulComptroller from './StatefulComptroller';
import StatefulPriceFeed from './StatefulPriceFeed';
import StatefulCoinbaseReporter from './StatefulCoinbaseReporter';

require('dotenv-safe').config();

// configure providers
const provider = providerFor('mainnet', {
  type: 'IPC',
  envKeyPath: 'PROVIDER_IPC_PATH',
});

const symbols: (keyof typeof CTokens)[] = <(keyof typeof CTokens)[]>Object.keys(CTokens);

import addressesJSON from './_borrowers.json';
const addressesList = new Set<string>([...addressesJSON.high_value, ...addressesJSON.previously_liquidated]);

const priceList = new PriceList();

const statefulComptroller = new StatefulComptroller(provider, comptroller);
const statefulPriceFeed = new StatefulPriceFeed(provider, openOraclePriceData, uniswapAnchoredView);
const statefulCoinbaseReporter = new StatefulCoinbaseReporter(
  priceList,
  120000,
  process.env.COINBASE_ENDPOINT!,
  process.env.CB_ACCESS_KEY!,
  process.env.CB_ACCESS_SECRET!,
  process.env.CB_ACCESS_PASSPHRASE!,
);

async function start() {
  await statefulComptroller.init();
  await statefulPriceFeed.init();
  await statefulCoinbaseReporter.init();

  console.log(statefulComptroller.getCloseFactor().toFixed(0));
  console.log(statefulComptroller.getLiquidationIncentive().toFixed(0));

  symbols.forEach((symbol) => {
    console.log(
      `${symbol} price is ${statefulPriceFeed
        .getPrice(symbol)
        .value.div(1e6)
        .toFixed(3)} with a CF of ${statefulComptroller.getCollateralFactor(symbol).div(1e18).toFixed(2)}`,
    );
  });
}

// const borrowers: ICompoundBorrower[] = [];
// addressesList.forEach(address => {
//   cTokens.cBAT.getAccountSnapshot
// });

start();

// symbols.forEach((symbol) => {
//   const accrueInterestEmitter = cTokens[symbol].bindTo(provider).subscribeTo.AccrueInterest('latest');

//   accrueInterestEmitter
//     .on('connected', (id: string) => console.log(`Connected ${symbol} at ${id}`))
//     .on('data', console.log)
//     .on('changed', console.log)
//     .on('error', console.log);
// });

// ipc.config.appspace = 'newbedford.';
// ipc.config.id = 'delegator';
// // ipc.config.silent = true;
// ipc.connectTo('txmanager', '/tmp/newbedford.txmanager', () => {
//   ipc.of['txmanager'].on('connect', () => {
//     console.log('Connected');

//     ipc.of['txmanager'].emit('liquidation-candidate-add', 'My message');
//   });
// });

process.on('SIGINT', () => {
  console.log('\nCaught interrupt signal');

  // @ts-expect-error: Web3 typings are incorrect for `clearSubscriptions()`
  provider.eth.clearSubscriptions();
  // @ts-expect-error: We already checked that type is valid
  provider.eth.currentProvider.connection.destroy();

  console.log('Exited cleanly');
  process.exit();
});

import ipc from 'node-ipc';
import { EventData } from 'web3-eth-contract';
import winston from 'winston';

import { providerFor } from '@goldenagellc/web3-blocks';

import { CTokens } from './types/CTokens';

import SlackHook from './logging/SlackHook';

import comptroller from './contracts/Comptroller';
import openOraclePriceData from './contracts/OpenOraclePriceData';
import uniswapAnchoredView from './contracts/UniswapAnchoredView';

import PriceLedger from './PriceLedger';
import StatefulComptroller from './StatefulComptroller';
import StatefulPricesOnChain from './StatefulPricesOnChain';
import StatefulPricesCoinbase from './StatefulPricesCoinbase';

require('dotenv-safe').config();

// configure providers
const provider = providerFor('mainnet', {
  type: 'IPC',
  envKeyPath: 'PROVIDER_IPC_PATH',
});

// configure winston
winston.configure({
  format: winston.format.combine(winston.format.splat(), winston.format.simple()),
  transports: [
    new winston.transports.Console({ handleExceptions: true }),
    new winston.transports.File({
      level: 'debug',
      filename: 'delegator.log',
      maxsize: 100000,
    }),
    new SlackHook(process.env.SLACK_WEBHOOK!, { level: 'info' }),
  ],
  exitOnError: false,
});

const symbols: (keyof typeof CTokens)[] = <(keyof typeof CTokens)[]>Object.keys(CTokens);

import addressesJSON from './_borrowers.json';
const addressesList = new Set<string>([...addressesJSON.high_value, ...addressesJSON.previously_liquidated]);

const priceLedger = new PriceLedger();

const statefulComptroller = new StatefulComptroller(provider, comptroller);
const statefulPricesOnChain = new StatefulPricesOnChain(provider, priceLedger, openOraclePriceData, uniswapAnchoredView);
const statefulPricesCoinbase = new StatefulPricesCoinbase(
  priceLedger,
  process.env.COINBASE_ENDPOINT!,
  process.env.CB_ACCESS_KEY!,
  process.env.CB_ACCESS_SECRET!,
  process.env.CB_ACCESS_PASSPHRASE!,
);

async function start() {
  await statefulComptroller.init();
  await statefulPricesOnChain.init();
  await statefulPricesCoinbase.init(4000);

  console.log(statefulComptroller.getCloseFactor().toFixed(0));
  console.log(statefulComptroller.getLiquidationIncentive().toFixed(0));
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

import ipc from 'node-ipc';
import Web3Utils from 'web3-utils';
import winston from 'winston';

import { providerFor } from '@goldenagellc/web3-blocks';

import SlackHook from './logging/SlackHook';

import cTokens from './contracts/CToken';
import comptroller from './contracts/Comptroller';
import openOraclePriceData from './contracts/OpenOraclePriceData';
import uniswapAnchoredView from './contracts/UniswapAnchoredView';

import PriceLedger from './PriceLedger';
import StatefulBorrowers from './StatefulBorrowers';
import StatefulComptroller from './StatefulComptroller';
import StatefulPricesOnChain from './StatefulPricesOnChain';
import StatefulPricesCoinbase from './StatefulPricesCoinbase';

import getBorrowers from './CompoundAPI';

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

const priceLedger = new PriceLedger();

const statefulBorrowers = new StatefulBorrowers(provider, cTokens);
const statefulComptroller = new StatefulComptroller(provider, comptroller);
const statefulPricesOnChain = new StatefulPricesOnChain(
  provider,
  priceLedger,
  openOraclePriceData,
  uniswapAnchoredView,
);
const statefulPricesCoinbase = new StatefulPricesCoinbase(
  priceLedger,
  process.env.COINBASE_ENDPOINT!,
  process.env.CB_ACCESS_KEY!,
  process.env.CB_ACCESS_SECRET!,
  process.env.CB_ACCESS_PASSPHRASE!,
);

let candidatesObj = {
  previous: <string[]>[],
};

async function scan(ipcTxManager: any) {
  const candidates = await statefulBorrowers.scan(statefulComptroller, priceLedger);
  const candidatesSet = new Set<string>();

  candidates.forEach((candidate) => {
    candidatesSet.add(candidate.address);
    ipcTxManager.emit('liquidation-candidate-add', candidate);
    // winston.log('info', `🐳 Found ${candidate.address.slice(0, 6)} for revenue of ${candidate.expectedRevenue} Eth`);
  });

  candidatesObj.previous.forEach((address) => {
    if (candidatesSet.has(address)) return;
    ipcTxManager.emit('liquidation-candidate-remove', address);
  });

  candidatesObj.previous = Array.from(candidatesSet);
}

async function start(ipcTxManager: any) {
  await statefulBorrowers.init();
  await statefulComptroller.init();
  await statefulPricesOnChain.init();
  await statefulPricesCoinbase.init(2000);

  winston.log('info', 'Searching for borrowers using the Compound API...');
  const borrowers = await getBorrowers('1');
  winston.log('info', `Found ${borrowers.length} borrowers using the Compound API`);

  const borrowersPushStart = Date.now();
  await statefulBorrowers.push(borrowers.map((x) => Web3Utils.toChecksumAddress(x)));
  winston.log('info', `Fetched all borrower data in ${Date.now() - borrowersPushStart} ms`);

  statefulPricesCoinbase.register(() => scan(ipcTxManager));
  provider.eth.subscribe('newBlockHeaders').on('data', (_block) => setTimeout(() => scan(ipcTxManager), 500));

  setInterval(() => ipcTxManager.emit('keepalive', ''), 60 * 5 * 1000);
}

function stop() {
  statefulPricesCoinbase.stop();
  // @ts-expect-error: Web3 typings are incorrect for `clearSubscriptions()`
  provider.eth.clearSubscriptions();
  // @ts-expect-error: We already checked that type is valid
  provider.eth.currentProvider.connection.destroy();
}

ipc.config.appspace = 'newbedford.';
ipc.config.id = 'delegator';
ipc.config.silent = true;
ipc.connectTo('txmanager', '/tmp/newbedford.txmanager', () => {
  ipc.of['txmanager'].on('connect', () => {
    console.log("Connected to TxManager's IPC");
    start(ipc.of['txmanager']);
  });

  ipc.of['txmanager'].on('disconnect', () => {
    console.log("Disconnected from TxManager's IPC");
    stop();
    process.exit();
  });
});

process.on('SIGINT', () => {
  console.log('\nCaught interrupt signal');
  ipc.disconnect('txmanager');
  stop();
  console.log('Exited cleanly');
  process.exit();
});

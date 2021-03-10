import ipc from 'node-ipc';
import Web3 from 'web3';
import winston from 'winston';

import { ProviderGroup, Wallet } from '@goldenagellc/web3-blocks';

import EthSubscriber from './EthSubscriber';
import IncognitoQueue from './IncognitoQueue';
import LatencyInterpreter from './LatencyInterpreter';
import LatencyWatcher from './LatencyWatcher';
import TxManager from './TxManager';
import SlackHook from './logging/SlackHook';

require('dotenv-safe').config();

// configure providers
const provider = ProviderGroup.for('mainnet', [
  {
    type: 'IPC',
    envKeyPath: 'PROVIDER_IPC_PATH',
  },
  {
    type: 'WS_Infura',
    envKeyID: 'PROVIDER_INFURA_ID',
  },
  {
    type: 'WS_Alchemy',
    envKeyKey: 'PROVIDER_ALCHEMY_KEY',
  },
]);

// configure winston
winston.configure({
  format: winston.format.combine(winston.format.splat(), winston.format.simple()),
  transports: [
    new winston.transports.Console({ handleExceptions: true }),
    new winston.transports.File({
      level: 'debug',
      filename: 'txmanager.log',
      maxsize: 100000,
    }),
    new SlackHook(process.env.SLACK_WEBHOOK!, { level: 'info' }),
  ],
  exitOnError: false,
});

// subscribe to basic events
const ethSub = new EthSubscriber((provider as unknown) as Web3);
ethSub.init();

// monitor latency
const latencyInterp = new LatencyInterpreter();
const latencyWatch = new LatencyWatcher(latencyInterp);
ethSub.register(latencyWatch);

// create queue
const wallet = new Wallet(
  provider,
  process.env.ACCOUNT_ADDRESS_CALLER!,
  process.env.ACCOUNT_SECRET_CALLER!,
);
const queue = new IncognitoQueue(wallet);
ethSub.register(queue);

// create tx manager
const txmanager = new TxManager(queue, latencyInterp, (provider as unknown) as Web3);
ethSub.register(txmanager);
txmanager.init();

ipc.config.appspace = 'newbedford.';
ipc.config.id = 'txmanager';
ipc.config.silent = true;
ipc.serve('/tmp/newbedford.txmanager', () => {
  ipc.server.on('liquidation-candidate-add', (message) => {
    console.log(message);
  });
  ipc.server.on('liquidation-candidate-remove', (message) => {
    console.log(message);
  });
});
ipc.server.start();

process.on('SIGINT', () => {
  console.log('\nCaught interrupt signal');
  txmanager.stop();

  provider.eth.clearSubscriptions();
  provider.eth.closeConnections();

  console.log('Exited cleanly');
  process.exit();
});

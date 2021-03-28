import ipc from 'node-ipc';
import Web3 from 'web3';
import winston from 'winston';

import { ProviderGroup, Wallet } from '@goldenagellc/web3-blocks';

import EthSubscriber from './EthSubscriber';
import ILiquidationCandidate from './types/ILiquidationCandidate';
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
      filename: 'txmanager-mev.log',
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
const wallet = new Wallet(provider, process.env.ACCOUNT_ADDRESS_CALLER!, process.env.ACCOUNT_SECRET_CALLER!);
const queue = new IncognitoQueue(wallet);
ethSub.register(queue);

// create tx manager
const txmanager = new TxManager(queue, latencyInterp, (provider as unknown) as Web3);
ethSub.register(txmanager);
txmanager.init();

ipc.config.appspace = 'newbedford.';
ipc.config.id = 'txmanager-mev';
ipc.config.silent = true;
ipc.serve('/tmp/newbedford.txmanager-mev', () => {
  ipc.server.on('liquidation-candidate-add', async (message) => {
    const candidate = message as ILiquidationCandidate;

    const syncing = await provider.eth.isSyncing();
    if (typeof syncing !== 'boolean' && syncing.CurrentBlock < syncing.HighestBlock - 10) {
      console.log(`Ignoring candidate ${candidate.address.slice(0, 6)} because Geth is syncing`);
      return;
    }
    txmanager.addLiquidationCandidate(candidate);
  });
  ipc.server.on('liquidation-candidate-remove', (message) => {
    txmanager.removeLiquidationCandidate(message);
  });
  ipc.server.on('keepalive', (_message) => {
    console.log('Staying alive oh oh oh 🎶');
  });
});
ipc.server.start();

process.on('SIGINT', () => {
  console.log('\nCaught interrupt signal');
  ipc.server.stop();
  txmanager.stop();

  provider.eth.clearSubscriptions();
  provider.eth.closeConnections();

  console.log('Exited cleanly');
  process.exit();
});

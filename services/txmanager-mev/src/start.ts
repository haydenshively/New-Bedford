import ipc from 'node-ipc';
import Web3 from 'web3';
import winston from 'winston';

import { ProviderGroup, FlashbotsWallet } from '@goldenagellc/web3-blocks';

import EthSubscriber from './EthSubscriber';
import ILiquidationCandidate from './types/ILiquidationCandidate';
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
    type: 'Flashbots',
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

// create queue
const wallet = new FlashbotsWallet(provider, process.env.ACCOUNT_ADDRESS_CALLER!, process.env.ACCOUNT_SECRET_CALLER!);

// create tx manager
const txmanager = new TxManager(wallet);
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

  provider.eth.clearSubscriptions();
  provider.eth.closeConnections();

  console.log('Exited cleanly');
  process.exit();
});

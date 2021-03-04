import ipc from 'node-ipc';

import { providerFor } from '@goldenagellc/web3-blocks';

import { CTokens } from './types/CTokens';
import cTokens from './contracts/CToken';

require('dotenv-safe').config();

// configure providers
const provider = providerFor('mainnet', {
  type: 'IPC',
  envKeyPath: 'PROVIDER_IPC_PATH',
});

const symbols: (keyof typeof CTokens)[] = <(keyof typeof CTokens)[]>Object.keys(CTokens);
symbols.forEach((symbol) => {

  const accrueInterestEmitter = cTokens[symbol].connectTo(provider).subscribeTo.AccrueInterest('latest');
  
  accrueInterestEmitter
    .on('connected', (id: string) => console.log(`Connected ${symbol} at ${id}`))
    .on('data', console.log)
    .on('changed', console.log)
    .on('error', console.log);
});

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

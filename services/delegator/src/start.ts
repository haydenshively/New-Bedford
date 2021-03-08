import ipc from 'node-ipc';
import { EventData } from 'web3-eth-contract';

import { Big, providerFor } from '@goldenagellc/web3-blocks';

import ICompoundBorrower from './types/ICompoundBorrower';
import { CTokens } from './types/CTokens';
import cTokens from './contracts/CToken';
import comptroller from './contracts/Comptroller';

require('dotenv-safe').config();

// configure providers
const provider = providerFor('mainnet', {
  type: 'IPC',
  envKeyPath: 'PROVIDER_IPC_PATH',
});

const symbols: (keyof typeof CTokens)[] = <(keyof typeof CTokens)[]>Object.keys(CTokens);

import addressesJSON from './_borrowers.json';
const addressesList = new Set<string>([...addressesJSON.high_value, ...addressesJSON.previously_liquidated]);

let closeFactor: Big | null = null;
let liquidationIncentive: Big | null = null;
const collateralFactors: { -readonly [d in keyof typeof CTokens]: Big | null } = {
  cBAT: null,
  cCOMP: null,
  cDAI: null,
  cETH: null,
  cREP: null,
  cSAI: null,
  cUNI: null,
  cUSDC: null,
  cUSDT: null,
  cWBTC: null,
  cZRX: null,
};

async function start() {
  // CLOSE FACTOR
  comptroller
    .bindTo(provider)
    .subscribeTo.NewCloseFactor('latest')
    .on('connected', async (_id: string) => {
      const x = await comptroller.closeFactor()(provider);
      if (closeFactor === null) {
        closeFactor = x;
        console.log(`Fetch: close factor set to ${closeFactor.toFixed(0)}`);
      }
    })
    .on('data', async (ev: EventData) => {
      const x = ev.returnValues.newCloseFactorMantissa;
      closeFactor = Big(x);
      console.log(`Event: close factor set to ${x}`);
    })
    .on('changed', async (ev: EventData) => {
      const x = ev.returnValues.oldCloseFactorMantissa;
      closeFactor = Big(x);
      console.log(`Event: close factor reverted to ${x}`);
    })
    .on('error', console.log);

  // LIQUIDATION INCENTIVE
  comptroller
    .bindTo(provider)
    .subscribeTo.NewLiquidationIncentive('latest')
    .on('connected', async (_id: string) => {
      const x = await comptroller.liquidationIncentive()(provider);
      if (liquidationIncentive === null) {
        liquidationIncentive = x;
        console.log(`Fetch: liquidation incentive set to ${x.toFixed(0)}`);
      }
    })
    .on('data', (ev: EventData) => {
      const x = ev.returnValues.newLiquidationIncentiveMantissa;
      liquidationIncentive = Big(x);
      console.log(`Event: liquidation incentive set to ${x}`);
    })
    .on('changed', (ev: EventData) => {
      const x = ev.returnValues.oldLiquidationIncentiveMantissa;
      liquidationIncentive = Big(x);
      console.log(`Event: liquidation incentive reverted to ${x}`);
    })
    .on('error', console.log);

  // COLLATERAL FACTORS
  comptroller
    .bindTo(provider)
    .subscribeTo.NewCollateralFactor('latest')
    .on('connected', (_id: string) => {
      symbols.forEach(async (symbol) => {
        const x = await comptroller.collateralFactorOf(CTokens[symbol])(provider);
        if (collateralFactors[symbol] === null) {
          collateralFactors[symbol] = x;
          console.log(`Fetch: ${symbol} collateral factor set to ${x.toFixed(0)}`);
        }
      });
    })
    .on('data', (ev: EventData) => {
      const address: string = ev.returnValues.cToken;
      const x = ev.returnValues.newCollateralFactorMantissa;

      symbols.forEach((symbol) => {
        if (CTokens[symbol] === address) {
          collateralFactors[symbol] = Big(x);
          console.log(`Fetch: ${symbol} collateral factor set to ${x.toFixed(0)}`);
        }
      });
    })
    .on('changed', (ev: EventData) => {
      const address: string = ev.returnValues.cToken;
      const x = ev.returnValues.oldCollateralFactorMantissa;

      symbols.forEach((symbol) => {
        if (CTokens[symbol] === address) {
          collateralFactors[symbol] = Big(x);
          console.log(`Fetch: ${symbol} collateral factor set to ${x.toFixed(0)}`);
        }
      });
    })
    .on('error', console.log);
}

// const borrowers: ICompoundBorrower[] = [];
// addressesList.forEach(address => {
//   cTokens.cBAT.getAccountSnapshot
// });

start();

symbols.forEach((symbol) => {
  const accrueInterestEmitter = cTokens[symbol].bindTo(provider).subscribeTo.AccrueInterest('latest');

  accrueInterestEmitter
    // .on('connected', (id: string) => console.log(`Connected ${symbol} at ${id}`))
    // .on('data', console.log)
    .on('changed', console.log);
  // .on('error', console.log);
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

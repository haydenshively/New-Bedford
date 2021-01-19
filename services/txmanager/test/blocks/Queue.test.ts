import { expect } from 'chai';
const ganache = require('ganache-cli');
import Transport from 'winston-transport';
import Web3 from 'web3';
import winston from 'winston';

import Big from '../../src/blocks/types/big';
import TxQueue from '../../src/blocks/Queue';
import Wallet from '../../src/blocks/Wallet';
import { providerFor } from '../../src/blocks/Providers';

require('dotenv-safe').config({
  example: process.env.CI ? '.env.ci.example' : '.env.example',
});

// Fake winston transport to verify certain behaviors that get logged
class TestTransport extends Transport {
  public logs: string[];

  constructor(opts?: Transport.TransportStreamOptions) {
    super(opts);
    this.logs = [];
  }

  log(info: any, _callback: () => void) {
    this.logs.push(info.message);
  }
}

// Apply fake transport globally
const logger = new TestTransport();
winston.configure({
  transports: [logger],
});

describe('Queue Test', () => {
  let mainnetProvider: Web3;
  let ganacheProvider: Web3;
  let wallet: Wallet;
  let queue: TxQueue;

  before(() => {
    mainnetProvider = providerFor('mainnet', {
      type: 'WS_Infura',
      envKeyID: 'PROVIDER_INFURA_ID',
    });
    ganacheProvider = new Web3(
      ganache.provider({
        fork: mainnetProvider,
        accounts: [
          {
            balance: '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
            secretKey: '0x' + process.env.ACCOUNT_SECRET_TEST,
          },
        ],
      }),
    );
    wallet = new Wallet(ganacheProvider, 'ACCOUNT_ADDRESS_TEST', 'ACCOUNT_SECRET_TEST');
    queue = new TxQueue(wallet);
  });

  after(() => {
    // @ts-expect-error
    ganacheProvider.eth.clearSubscriptions();
    // @ts-expect-error
    mainnetProvider.eth.clearSubscriptions();
    if (
      mainnetProvider.currentProvider !== null &&
      (mainnetProvider.currentProvider.constructor.name === 'WebsocketProvider' ||
        mainnetProvider.currentProvider.constructor.name === 'IpcProvider')
    )
      try {
        // @ts-ignore
        mainnetProvider.currentProvider.connection.close();
      } catch {
        // @ts-ignore
        mainnetProvider.currentProvider.connection.destroy();
      }
  });

  it('should initialize and rebase', async () => {
    await queue.init();
    await queue.rebase();
    expect(logger.logs.length).to.equal(1);
    expect(logger.logs[0].includes('*Rebase* jumped forward')).to.be.true;
  }).timeout(4000);

  it('should map nonces to indices', async () => {
    [0, 1, 2, 3, 4, 5, 6].forEach((i) => {
      expect(queue.idx(queue.nonce(i))).to.equal(i);
      expect(queue.nonce(i)).to.equal(queue.nonce(0) + i);
    });
  });

  it('should append and dump a transaction', async () => {
    const tx = wallet.emptyTx;
    const gasPrice = Big('30000000000');
    tx.gasPrice = gasPrice;
    tx.gasLimit = tx.gasLimit.mul('3');

    // test append
    queue.append({ ...tx });
    expect(queue.length).to.equal(1);
    expect(queue.tx(0).gasPrice.eq(tx.gasPrice)).to.be.true;

    // test replace
    tx.gasPrice = tx.gasPrice.minus('1000000000');
    queue.replace(0, { ...tx }, 'clip');
    expect(queue.length).to.equal(1);
    expect(queue.tx(0).gasPrice.eq(gasPrice.mul(1.12))).to.be.true;

    // test dump
    queue.dump(0);
    expect(queue.length).to.equal(1);
    expect(queue.tx(0).gasLimit.eq('21000')).to.be.true;

    await new Promise<void>((resolve) => {
      const check = () => {
        if (queue.length === 0) resolve();
        else setTimeout(check, 100);
      };
      setTimeout(check, 100);
    });
  }).timeout(6000);
});

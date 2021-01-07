// test dependenices -----------------------------------------------
const expect = require('chai').expect;
import Wallet from '../../src/blocks/Wallet';
// -----------------------------------------------------------------
// web3 dependencies -----------------------------------------------
require('dotenv-safe').config({
  example: process.env.CI ? '.env.ci.example' : '.env.example',
});

const ganache = require('ganache-cli');
import Web3Utils from 'web3-utils';
import Web3 from 'web3';

import { ProviderFor } from '../../src/blocks/Providers';
// -----------------------------------------------------------------
// math dependencies -----------------------------------------------
import Big from 'big.js';
Big.DP = 40;
Big.RM = 0;
// -----------------------------------------------------------------

describe('Wallet Test', () => {
  let mainnetProvider: Web3;
  let ganacheProvider: Web3;
  let wallet: Wallet;

  before(() => {
    mainnetProvider = ProviderFor('mainnet', {
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
          { balance: '0x0' },
          { balance: '0x0' },
          { balance: '0x0' },
        ],
      }),
    );
    wallet = new Wallet(ganacheProvider, 'ACCOUNT_ADDRESS_TEST', 'ACCOUNT_SECRET_TEST');
  });

  after(() => {
    ganacheProvider.eth.clearSubscriptions(() => {});
    mainnetProvider.eth.clearSubscriptions(() => {});
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

  it('should retrieve lowest unconfirmed nonce', async () => {
    const nonce = await wallet.getLowestLiquidNonce();
    expect(typeof nonce).to.equal('number');
    expect(Number.isInteger(nonce)).to.be.true;
  });

  it('should sign transactions', () => {
    const tx = {
      nonce: Web3Utils.toHex('0'),
      gasPrice: Web3Utils.toHex('35000000000'),
      gasLimit: Web3Utils.toHex('21000'),
      to: '0x0123456789012345678901234567890123456789',
    };

    expect(typeof wallet['sign'](tx)).to.equal('string');
    expect(typeof wallet['sign']({ ...tx, value: '0x0' })).to.equal('string');
    expect(typeof wallet['sign']({ ...tx, data: Web3Utils.toHex('Hello World') })).to.equal('string');
  });

  it('should initialize chain opts', async () => {
    await wallet.init();
    expect(wallet['opts']).to.not.be.undefined;
  });

  it('should send a transaction', async () => {
    const nonce = await wallet.getLowestLiquidNonce();
    const tx = wallet.emptyTx;
    tx.gasPrice = Big(await ganacheProvider.eth.getGasPrice());
    const sentTx = wallet.signAndSend(tx, nonce);

    const receipt = Object(await sentTx);

    expect(receipt.status).to.be.true;
    expect(receipt.to).to.equal(wallet.address.toLowerCase());
    expect(receipt.to).to.equal(receipt.from);
    expect(receipt.gasUsed).to.equal(21000);
  });

  it('should estimate gas', async () => {
    const nonce = await wallet.getLowestLiquidNonce();
    const tx = wallet.emptyTx;
    tx.gasLimit = tx.gasLimit.mul('5');

    const gas = await wallet.estimateGas(tx, nonce);
    expect(gas).to.equal(21000);
  });
});

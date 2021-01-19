import { expect } from 'chai';
const ganache = require('ganache-cli');
import Web3Utils from 'web3-utils';
import Web3 from 'web3';

import Big from '../../src/blocks/types/big';
import { providerFor } from '../../src/blocks/Providers';
import treasury from '../../src/contracts/Treasury';

require('dotenv-safe').config({
  example: process.env.CI ? '.env.ci.example' : '.env.example',
});

describe('Treasury Test', () => {
  let mainnetProvider: Web3;
  let ganacheProvider: Web3;
  let caller: string;

  before(() => {
    mainnetProvider = providerFor('mainnet', {
      type: 'WS_Infura',
      envKeyID: 'PROVIDER_INFURA_ID',
    });
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

  it('should retrieve caller', async () => {
    caller = await treasury.caller()(mainnetProvider);
    expect(Web3Utils.isAddress(caller)).to.be.true;
  });

  it('should retrieve caller allowance', async () => {
    const callerAllowance = await treasury.callerAllowance()(mainnetProvider);
    expect(callerAllowance).to.equal(Web3Utils.toWei('2', 'ether'));
  });

  it('should retrieve liquidator wrapper', async () => {
    const liquidatorWrapper = await treasury.liquidatorWrapper()(mainnetProvider);
    expect(Web3Utils.isAddress(liquidatorWrapper)).to.be.true;
  });

  it('should refill caller', async () => {
    ganacheProvider = new Web3(
      ganache.provider({
        fork: mainnetProvider,
        unlocked_accounts: [caller],
      }),
    );

    const tx = treasury.refillCaller(caller);
    const receipt = await ganacheProvider.eth.sendTransaction({
      from: caller,
      to: tx.to,
      value: tx.value,
      gas: Number(tx.gasLimit),
      data: tx.data,
    });
    expect(receipt.status).to.be.true;
  }).timeout(20000);

  it('should change identity', async () => {
    const currentEOABalance = await ganacheProvider.eth.getBalance(caller);
    const newEOA = ganacheProvider.eth.accounts.create().address;
    const gasPrice = new Big(Web3Utils.toWei('30', 'gwei'));

    const tx = treasury.changeIdentity(newEOA, Big(currentEOABalance), gasPrice);
    const receipt = await ganacheProvider.eth.sendTransaction({
      from: caller,
      to: tx.to,
      value: tx.value,
      gas: Number(tx.gasLimit),
      gasPrice: Number(tx.gasPrice),
      data: tx.data,
    });
    expect(receipt.status).to.be.true;

    const oldEOABalance = Number(await ganacheProvider.eth.getBalance(caller));
    const newEOABalance = Number(await ganacheProvider.eth.getBalance(newEOA));

    expect(oldEOABalance).to.be.lessThan(Number(Web3Utils.toWei('0.01', 'ether')));
    expect(newEOABalance).to.be.greaterThan(0);
  }).timeout(20000);
});

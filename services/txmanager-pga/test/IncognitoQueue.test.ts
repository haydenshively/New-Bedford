import { expect } from 'chai';
const ganache = require('ganache-cli');
import { BlockHeader } from 'web3-eth';
import Web3Utils from 'web3-utils';
import Web3 from 'web3';

import { Big, Wallet, providerFor } from '@goldenagellc/web3-blocks';

import IncognitoQueue from '../src/IncognitoQueue';
import Treasury from '../src/contracts/Treasury';

require('dotenv-safe').config({
  example: process.env.CI ? '.env.ci.example' : '.env.example',
});

class TestCallbacks {
  public callCount = 0;

  onTransition(): void {
    this.callCount++;
  }
}

describe('IncognitoQueue Test', function () {
  this.timeout(30000);

  let mainnetProvider: Web3;
  let ganacheProvider: Web3;
  let initialWallet: Wallet;
  let incognito: IncognitoQueue;
  let callbacks: TestCallbacks = new TestCallbacks();

  it('should initialize without error', async () => {
    const caller = await Treasury.latest.caller()(ganacheProvider);
    expect(caller).to.equal(initialWallet.address);

    incognito = new IncognitoQueue(initialWallet);
    return incognito.queue.init();
  });

  it('should register callback', () => {
    const id = incognito.registerTransitionCallback(callbacks.onTransition.bind(callbacks));
    expect(id).to.equal(0);
  });

  it('should begin transition', () => {
    expect(incognito.transitioning).to.be.false;
    incognito.beginTransition(Big('9000000000'));
    expect(incognito.transitioning).to.be.true;
  });

  it('should not overwrite staged', () => {
    const stagedA = incognito['staged']!.wallet.address;
    incognito.beginTransition(Big('8000000000'));
    const stagedB = incognito['staged']!.wallet.address;
    expect(stagedA).to.equal(stagedB);
  });

  it('should send transaction on new block', async () => {
    await incognito.onNewBlock({} as BlockHeader, ganacheProvider);
    expect(incognito.queue.length).to.equal(1);
  });

  it('should finish transition', async () => {
    // @ts-expect-error Extended Web3
    await ganacheProvider.mineImmediately();

    await incognito.onNewBlock({} as BlockHeader, ganacheProvider);
    expect(incognito.queue.length).to.equal(0);
    expect(callbacks.callCount).to.equal(1);
    expect(incognito.queue.wallet.address).to.not.equal(initialWallet.address);

    const balance = await incognito.queue.wallet.getBalance();
    const allowance = await Treasury.latest.callerAllowance()(ganacheProvider);
    expect(Big(balance).eq(allowance)).to.be.true;
  });

  it('should remove test callback', () => {
    incognito.removeTransitionCallback(0);
  });

  before(async () => {
    mainnetProvider = providerFor('mainnet', {
      type: 'WS_Infura',
      envKeyID: 'PROVIDER_INFURA_ID',
    });

    // Setup initial wallet at random address that has 10 ETH
    const a = mainnetProvider.eth.accounts.create();
    ganacheProvider = new Web3(
      ganache.provider({
        fork: mainnetProvider,
        accounts: [{ secretKey: a.privateKey, balance: '0x56bc75e2d63100000' }], // 100 ETH
      }),
    );
    initialWallet = new Wallet(ganacheProvider, a.address, a.privateKey.slice(2));

    // Add functionality specific to ganache
    ganacheProvider.extend({
      methods: [
        {
          name: 'mineImmediately',
          call: 'evm_mine',
        },
        {
          name: 'unlockUnknownAccount',
          call: 'evm_unlockUnknownAccount',
          params: 1,
        },
      ],
    });

    const caller = await Treasury.latest.caller()(mainnetProvider);
    // Make sure caller has some funds
    await initialWallet.signAndSend(
      {
        to: caller,
        value: Web3Utils.toHex(`1${'0'.repeat(18)}`), // 1 ETH
        gasPrice: new Big('9000000000'),
        gasLimit: new Big('21000'),
      },
      0,
    );
    // Make initial wallet the caller
    const tx = Treasury.latest.changeIdentity(initialWallet.address, new Big('0'), Big('9000000000'));
    // @ts-expect-error Extended Web3
    await ganacheProvider.unlockUnknownAccount(caller);
    await ganacheProvider.eth.sendTransaction({
      from: caller,
      to: tx.to,
      value: tx.value,
      data: tx.data,
      gas: tx.gasLimit.toFixed(0),
      gasPrice: '9000000000',
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
});

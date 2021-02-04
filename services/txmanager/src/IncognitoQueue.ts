import { TransactionReceipt as ITxReceipt } from 'web3-core';
import { BlockHeader } from 'web3-eth';
import Web3Utils from 'web3-utils';
import Web3 from 'web3';
import { Big, ITx, TxQueue, Wallet } from '@goldenagellc/web3-blocks';

import Treasury from './contracts/Treasury';
import IEthSubscriptionConsumer from './types/IEthSubscriptionConsumer';

/* eslint-disable @typescript-eslint/no-var-requires */
const winston = require('winston');
/* eslint-enable @typescript-eslint/no-var-requires */

export default class IncognitoQueue implements IEthSubscriptionConsumer {
  private readonly burned: TxQueue[];
  private active: TxQueue;
  private staged: TxQueue | null;
  private gasPrice: Big;

  constructor(initialWallet: Wallet) {
    this.burned = [];
    this.active = new TxQueue(initialWallet);
    this.staged = null;

    this.gasPrice = Big('0');
  }

  public get transitioning(): boolean {
    return this.staged !== null;
  }

  public async onNewBlock(_header: BlockHeader, provider: Web3): Promise<void> {
    if (this.transitioning) {
      // *Must* rebase, even if only because `finishTransition` expects it. If omitted,
      // `finishTransition` may accidentally copy confirmed txns to new queue. Here it
      // has the welcome side-effect of making the `if else` case trigger accurately
      await this.active.rebase();

      // Check [again] that we are transitioning because of async/await and see if
      // on-chain caller matches staged address
      // @ts-expect-error: `this.staged` is known to be non-null because of `this.transitioning`
      if (this.transitioning && (await Treasury.latest.caller()(provider)) === this.staged.wallet.address) {
        // Transition was successful:
        // - update local state
        // - send one final transaction to clean ETH crumbs from old wallet (see further below)
        this.finishTransition();
      } else if (this.active.length === 0) {
        // Transition (1) hasn't started (2) failed or (3) was replaced by other tx:
        // - start it / try again

        // TODO other options available on this append transition -- could set this up
        // so that we test latency on every transition (since tx speed isn't as
        // crucial on these, it's fine to send with Infura to test latency)
        const balance = Big(await this.active.wallet.getBalance());
        // @ts-expect-error: `this.staged` is known to be non-null because of `this.transitioning`
        const tx = Treasury.latest.changeIdentity(this.staged.wallet.address, balance, this.gasPrice);
        this.active.append(tx);
      }
    }

    this.burned.forEach((q, i) => {
      q.wallet.getBalance().then((res) => {
        const balance = Big(res);
        if (balance.eq('0')) {
          this.burned.splice(i, 1);
          return;
        }

        const tx = q.wallet.emptyTx;
        tx.gasPrice = this.gasPrice;

        // TODO assumes value will be poitive

        let value = balance.minus(tx.gasPrice.mul(tx.gasLimit));
        tx.value = Web3Utils.toHex(value.toFixed());
        if (q.length > 0) {
          q.replace(0, tx, 'min');
          // Do everything again in case queue jacked up the gas price on us
          let value = balance.minus(tx.gasPrice.mul(tx.gasLimit));
          tx.value = Web3Utils.toHex(value.toFixed());
          q.replace(0, tx, 'as_is');
        } else q.append(tx);
      });
    });
  }

  onNewTxHash(_hash: string, _provider: Web3): void {
    // Intentionally left blank
  }

  public async beginTransition(gasPrice: Big): Promise<void> {
    // Ensure we're not already transitioning. It would be dangerous to stage multiple
    // new queues, as we may have successfully transitioned to stagedA on-chain and
    // not know it yet locally. Overwriting stagedA with some new stagedB would then
    // create a mismatch between our expectations and what has happened on-chain.
    if (this.transitioning) {
      winston.debug('beginTransition() called while transition in progress');
      return;
    }
    this.staged = this.createPeer();
    this.gasPrice = gasPrice;
  }

  private finishTransition() {
    // CAUTION: txns moved from one queue to another in this manner will lose their callback
    //    hooks and connection usage settings. Since these advanced options are only really
    //    really used for LatencyTester in New-Bedford, this should be ok, but be aware.
    for (let idx = 0; idx < this.active.length; idx++) this.staged?.append(this.active.tx(idx));

    // update state
    this.burned.push(this.active);
    this.active = this.staged as TxQueue;
    this.staged = null;
  }

  public async beginCleanup(): Promise<void> {}

  private createPeer(): TxQueue {
    const account = this.active.wallet.createPeer();
    winston.debug('Staged new account:');
    winston.debug(account.wallet.address);
    winston.debug(account.privateKey);

    return new TxQueue(account.wallet);
  }

  /*
  Goal:
  At some point in time, the current queue will contain 0 or more transactions.
  At this point in time, we may want to begin transitioning to another queue.
  
  In order to transition to a new queue, we must do the following:
  1) generate the new wallet/queue combo
  2) create a new tx on *the current queue* that calls appropriate transition function
  3) as soon as transition function is confirmed, copy all higher nonce txns from old queue to new queue
  4) send one final tx from the old queue that makes sure its balance is 0 (to new queue or treasury)

  step 2 can have multiple modes:
  - insertion modes (essentially choose whether transition function is `replaced` (and where) or simply appended):
    - immediate (gets sent at lowest liquid nonce, replacing existing if necessary)
    - end (gets appended to end of queue)
  - completion mode
    - "lazy": the transition function tx will always be at the end of the queue (both appending and replacing bump it up a nonce)
    - "aggressive": the transition function cannot be replaced

  Note: the immediate insertion mode and aggressive completion mode may be cool to have, but probably wouldn't get much use
  in the context of New Bedford. For now I'm just going to implement "end" and "lazy"
  */
}

import { Big, ITx, TxQueue } from '@goldenagellc/web3-blocks';
import { BlockHeader } from 'web3-eth';
import Web3 from 'web3';
import winston from 'winston';

import IncognitoQueue from './IncognitoQueue';
import LatencyInterpreter from './LatencyInterpreter';
import IEthSubscriptionConsumer from './types/IEthSubscriptionConsumer';
import ILiquidationCandidate from './types/ILiquidationCandidate';

import CandidatePool from './CandidatePool';
import liquidators from './contracts/Liquidator';
import treasuries from './contracts/Treasury';

// JSON
import competitors from './_competitors.json';

const competitorsFrom = new Set(competitors.from as string[]);
const competitorsTo = new Set(competitors.to as string[]);

const INITIAL_GAS_PRICE: Big = new Big('100000000000');
const DEADLINE_CUSHION = 9000;

export default class TxManager extends CandidatePool implements IEthSubscriptionConsumer {
  private readonly incognito: IncognitoQueue;

  private readonly latency: LatencyInterpreter;

  private readonly provider: Web3;

  private tx: ITx | null = null;

  private gasPriceMax: Big = new Big('0');

  private liquidatorWrapper: string | null = null;

  private didSeeCompetitors = false;

  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(incognito: IncognitoQueue, latency: LatencyInterpreter, provider: Web3) {
    super();

    this.incognito = incognito;
    this.latency = latency;
    this.provider = provider;
  }

  private get queue(): TxQueue {
    return this.incognito.queue;
  }

  private get didStartBidding(): boolean {
    return this.incognito.queue.length !== 0;
  }

  public async init(shouldTransitionIncognito: boolean = false): Promise<void> {
    await this.queue.init();
    await this.queue.rebase();

    await this.updateLiquidationWrapper();
    this.incognito.registerTransitionCallback(this.updateLiquidationWrapper.bind(this));
    if (shouldTransitionIncognito) {
      const gasPrice = new Big(await this.provider.eth.getGasPrice());
      this.incognito.beginTransition(gasPrice);
    }

    // TODO: subscribe to liquidation events. If we successfully liquidate somebody,
    // initiate transition on this.incognito
  }

  private async updateLiquidationWrapper() {
    this.liquidatorWrapper = await treasuries.latest.liquidatorWrapper()(this.provider);
    winston.info(`♼ Liquidator is wrapped at ${this.liquidatorWrapper}`);
  }

  public addLiquidationCandidate(candidate: ILiquidationCandidate) {
    super.addLiquidationCandidate(candidate);
    this.schedulePeriodic();
  }

  private schedulePeriodic(): void {
    const period = Math.random() * 20 + 80; // Jitter to make bid-time unpredictable
    this.intervalHandle = setTimeout(this.periodic.bind(this), period);
  }

  private periodic(): void {
    if (!this.isActive) {
      this.tx = null;
      if (this.queue.length > 0) this.queue.dump(0);
      return; // Break out of periodic loop (no immediate reschedule)
    }

    // To save gas, include no more than 4 targets in tx calldata
    const targets = this.candidates.slice(0, 4);
    // Since `this.isActive === true`, targets.length > 0, and targets[0] will
    // have highest expected revenue (it's a sorted array). Set that to be primary target
    let primaryIdx = 0;

    if (!this.didStartBidding && this.didSeeCompetitors) {
      const numCandidates = targets.length;
      // We know we don't have the best latency, so if competitors exist we stand down...
      if (numCandidates === 1) {
        this.tx = null;
        this.schedulePeriodic();
        winston.info(`⚖️ *Standing down* due to competitors`);
        return;
      }
      // ...but if alternative targets exist, we can simply set one of them as our primary
      primaryIdx = 1;

      // TODO in this for loop, we could check to make sure that our alternative candidate
      // is liquidatable using the best candidate's prices (or newer prices) since those
      // will probably get posted earlier in the block than our transaction...
      // for (let i = 1; i < numCandidates; i++) {}
    }

    const tx = liquidators.latest.liquidate(
      targets[primaryIdx].pricesToReport.messages,
      targets[primaryIdx].pricesToReport.signatures,
      targets[primaryIdx].pricesToReport.symbols,
      targets.map((target) => target.address),
      targets.map((target) => target.repayCToken),
      targets.map((target) => target.seizeCToken),
      true,
    );
    tx.to = this.liquidatorWrapper!;

    // Assume expectedRevenue is just plain ETH (no extra zeros or anything)
    this.gasPriceMax = new Big(targets[primaryIdx].expectedRevenue * 1e18).mul(2).div(tx.gasLimit);
    this.tx = tx;
    this.resetGasPrice();
    this.sendIfDeadlineIsApproaching(this.tx);

    this.schedulePeriodic();
  }

  public onNewTxHash(hash: string, provider: Web3): void {
    if (!this.isActive || this.tx === null) return;

    provider.eth.getTransaction(hash, (err, tx) => {
      if (err !== null || tx === undefined || tx === null) return;
      if (tx.gas === 21000) return; // Eth transfer
      if (tx.to === null) return; // Contract creation
      if (tx.from === this.queue.wallet.address) return; // Self
      if (!(competitorsTo.has(tx.to) || competitorsFrom.has(tx.from))) return;

      const gasPrice = new Big(tx.gasPrice);
      if (gasPrice.lt(this.tx!.gasPrice)) return;
      if (gasPrice.gte(this.gasPriceMax)) return;

      this.tx!.gasPrice = gasPrice.plus(1);

      winston.info(
        `🦞 *Bid* raised to ${this.tx!.gasPrice.div(1e9).toFixed(0)} gwei because of ${tx.from.slice(0, 6)}`,
      );

      this.didSeeCompetitors = true;
      if (this.didStartBidding) this.sendAtFirstPossibleNonce(this.tx!);
    });
  }

  public onNewBlock(block: BlockHeader, _provider: Web3): void {
    this.didSeeCompetitors = false;
    this.resetGasPrice();

    if (block.number % 480 === 0) winston.info(this.latency.summaryText);
  }

  private sendIfDeadlineIsApproaching(tx: ITx) {
    const deadline = this.latency.nextDeadline(90);
    if (deadline === null) return;
    const end = deadline[1];

    if (end - Date.now() <= DEADLINE_CUSHION) {
      this.sendAtFirstPossibleNonce(tx);
      if (!this.didStartBidding)
        winston.info(`⏱ Entering auction with ~${(end - Date.now()) / 1000} seconds remaining`);
    }
  }

  /**
   * Sends the transaction as-is if the queue is empty or if we haven't yet seen any competitors.
   * If we *have* seen competitors, this will automatically raise our bid (if it hasn't been
   * raised already). It will stop raising the bid when it reaches this.gasPriceMax.
   *
   * @param tx The transaction which may get sent
   */
  private sendAtFirstPossibleNonce(tx: ITx) {
    if (!this.didStartBidding) {
      this.queue.append(tx);
      return;
    }
    if (this.didSeeCompetitors) {
      this.queue.replace(0, tx, 'clip', this.gasPriceMax.times('1'));
      return;
    }
    this.queue.replace(0, tx, 'as_is', undefined, undefined, 0, false);
  }

  /**
   * Assumes that this.tx is non-null and sets its gas price to the INITIAL_GAS_PRICE
   * or this.gasPriceMax, whichever is smaller
   */
  private resetGasPrice() {
    if (this.tx !== null)
      this.tx.gasPrice = this.gasPriceMax.gte(INITIAL_GAS_PRICE) ? INITIAL_GAS_PRICE : this.gasPriceMax;
  }

  /**
   * Dumps all transactions via `dumpAll()`, then cancels the periodic bidding function.
   * Should be called before exiting the program
   */
  public stop(): void {
    if (this.intervalHandle !== null) clearInterval(this.intervalHandle);
    for (let i = 0; i < this.queue.length; i += 1) this.queue.dump(i);
  }
}

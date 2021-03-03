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

const INITIAL_GAS_PRICE: Big = Big('100000000000');
const DEADLINE_CUSHION = 500;

export default class TxManager extends CandidatePool implements IEthSubscriptionConsumer {
  private readonly incognito: IncognitoQueue;

  private readonly latency: LatencyInterpreter;

  private readonly provider: Web3;

  private tx: ITx | null = null;

  private gasPriceMax: Big = Big('0');

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

  public async init(): Promise<void> {
    await this.queue.init();
    await this.queue.rebase();

    await this.updateLiquidationWrapper();
    this.incognito.registerTransitionCallback(this.updateLiquidationWrapper.bind(this));

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
    if (!this.isActive) return; // Break out of periodic loop (no immediate reschedule)

    let target = this.candidates[0];
    if (!this.didStartBidding && this.didSeeCompetitors) {
      const numCandidates = this.candidates.length;
      // We know we don't have the best latency, so if competitors exist we stand down...
      if (numCandidates === 1) {
        this.tx = null;
        this.schedulePeriodic();
        return;
      }
      // ...but if alternative targets exist, we may as well try them

      // TODO in this for loop, we could check to make sure that our alternative candidate
      // is liquidatable using the best candidate's prices (or newer prices)
      // for (let i = 1; i < numCandidates; i++) {}
      target = this.candidates[1];
    }

    const tx = liquidators.latest.liquidate(
      target.pricesToReport.messages,
      target.pricesToReport.signatures,
      target.pricesToReport.symbols,
      [target.address],
      [target.repayCToken],
      [target.seizeCToken],
      true,
    );
    tx.to = this.liquidatorWrapper!;

    // Assume expectedRevenue is just plain ETH (no extra zeros or anything)
    this.gasPriceMax = Big(target.expectedRevenue * 1e18).div(tx.gasLimit);
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
      if (!(competitorsTo.has(tx.to.slice(2)) || competitorsFrom.has(tx.from.slice(2)))) return;

      const gasPrice = Big(tx.gasPrice);
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
      this.queue.replace(0, tx, 'clip', this.gasPriceMax);
      return;
    }
    this.queue.replace(0, tx, 'as_is');
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

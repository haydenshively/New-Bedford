import { Big, ITx, Wallet } from '@goldenagellc/web3-blocks';
import { BlockHeader } from 'web3-eth';
import Web3 from 'web3';
import winston from 'winston';

import IEthSubscriptionConsumer from './types/IEthSubscriptionConsumer';
import ILiquidationCandidate from './types/ILiquidationCandidate';

import CandidatePool from './CandidatePool';
import liquidators, { Liquidator } from './contracts/Liquidator';

export default class TxManager extends CandidatePool implements IEthSubscriptionConsumer {
  private readonly flashbots: Wallet;

  private tx: ITx | null = null;

  private target: string = '';

  private nonce: number | null = null;

  private block: BlockHeader | null = null;

  constructor(flashbots: Wallet) {
    super();

    this.flashbots = flashbots;
  }

  public async init(): Promise<void> {
    await this.flashbots.init();
    this.nonce = await this.flashbots.getLowestLiquidNonce();
  }

  public addLiquidationCandidate(candidate: ILiquidationCandidate) {
    super.addLiquidationCandidate(candidate);
    this.updateTx();
  }

  public removeLiquidationCandidate(candidateAddress: string): void {
    super.removeLiquidationCandidate(candidateAddress);
    this.updateTx();
  }

  private async updateTx(): Promise<void> {
    if (!this.isActive) {
      this.tx = null;
      return;
    }

    const target = this.candidates[0];
    if (target.address === this.target) return;

    const toMiner = target.expectedRevenue > 0.2 ? 4000 + Math.floor(Math.random() ** 2 * 5000) : 9900;

    const tx = liquidators.latest.liquidate(
      target.pricesToReport.messages,
      target.pricesToReport.signatures,
      target.pricesToReport.symbols,
      target.address,
      target.repayCToken,
      target.seizeCToken,
      toMiner,
      target.expectedRevenue > 1.0,
    );
    tx.gasPrice = new Big('0');

    this.tx = tx;
    this.target = target.address;
    winston.log('info', `📦 MEV bundle updated to target ${target.address.slice(0, 6)}`);

    this.send(this.tx, 1);
    this.send(this.tx, 2);
    this.send(this.tx, 3);
    await this.attemptToSetGasLimit(this.tx, true);
    this.send(this.tx, 1);
    this.send(this.tx, 2);
    this.send(this.tx, 3);
  }

  public onNewTxHash(_hash: string, _provider: Web3): void {}

  public async onNewBlock(block: BlockHeader, _provider: Web3): Promise<void> {
    this.block = block;

    const nonce = await this.flashbots.getLowestLiquidNonce();
    if (nonce > this.nonce!) winston.log('info', 'MEV TxManager succeeded');
    this.nonce = nonce;

    if (this.tx !== null) {
      this.tx.gasLimit = Liquidator.gasLimit;
      await this.attemptToSetGasLimit(this.tx, false);
      this.send(this.tx, 1);
    }
  }

  private async attemptToSetGasLimit(tx: ITx, logging = false) {
    try {
      const sim = await this.simulate(tx);
      tx.gasLimit = new Big(sim.results[0].gasUsed.toFixed(0)).times('1.05'); // 5% gas buffer
      if (logging)
        winston.log(
          'info',
          `⛽️ MEV bundle equivalent gas price is ${new Big(sim.bundleGasPrice).div('1e+9').toFixed(2)}`,
        );
    } catch (e) {
      if (logging) winston.log('info', '🆘 MEV gas usage simulation failed when adding a candidate. Using default');
    }
  }

  private async simulate(tx: ITx) {
    return this.flashbots.simulateMEVBundle(
      [tx],
      [this.nonce ?? 1 - 1],
      1,
      this.block!.number + 1,
      Number(this.block!.timestamp),
    );
  }

  private async send(tx: ITx, blocksAhead = 1) {
    return this.flashbots.signAndSendMEVBundle([tx], [this.nonce ?? 0], 1, this.block!.number + blocksAhead);
  }
}

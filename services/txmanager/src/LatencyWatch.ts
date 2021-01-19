import { BlockHeader } from 'web3-eth';
import Web3 from 'web3';

import LatencyInterpreter from './LatencyInterpreter';

export default class LatencyWatch extends LatencyInterpreter {
  protected provider: Web3;

  constructor(provider: Web3) {
    super();

    this.provider = provider;

    // this._wallet = wallet;
    // this._txnTests = {};
  }

  init(): void {
    const s1 = this.provider.eth.subscribe('newBlockHeaders');
    s1.on('data', (block) => this.onNewBlock(block));

    const s2 = this.provider.eth.subscribe('pendingTransactions');
    s2.on('data', (hash) => this.onNewTxHash(hash));
  }

  protected async onNewBlock(header: BlockHeader): Promise<void> {
    if (header.number <= Number(this.blockPrev.number)) return;

    // Fetch block before making any modifications to state
    // to avoid weird asynchronous data mismatches
    // NOTE: In case of conflicts, existing data wins
    const block = {
      ...(await this.provider.eth.getBlock(header.hash)),
      ...header,
    };

    // Save block's identity
    this.blockCurr.number = block.number;
    this.blockCurr.hash = block.hash;

    // Save block's temporal data
    const t_collation = new Date(0);
    t_collation.setUTCSeconds(Number(block.timestamp));
    this.blockCurr.tCollation = t_collation;
    this.blockCurr.tReception = new Date();

    this.analyze(block);
    this.step();
  }

  protected onNewTxHash(hash: string): void {
    this.blockCurr.pending[hash] = new Date();
  }

  getSummaryText(): string {
    return `Block Time: ${Number(this.meanBlockTime) / 1000}\nBlock Latency: ${
      Number(this.meanBlockLatency) / 1000
    }\nCollation Duration: ${Number(this.meanApproxCollationDuration) / 1000}`;
  }

  // async testTxnLatency(multiplier = 5) {
  //   if (this._wallet === null) return;

  //   const nonce = await this._wallet.getLowestLiquidNonce();
  //   const mgp = await this._wallet._provider.eth.getGasPrice();
  //   const tx = { ...this._wallet.emptyTx };
  //   tx.gasPrice = Big(mgp).mul(multiplier);

  //   const timestamp = new Date();
  //   const sentTx = this._wallet.signAndSend(tx, nonce);
  //   // After receiving the transaction hash, log it to list of tests
  //   sentTx.on('transactionHash', (hash) => {
  //     this.txnTests[hash] = timestamp;
  //   });
  //   // Log errors
  //   sentTx.on('error', (err, receipt) => console.error(String(err)));
  // }
}

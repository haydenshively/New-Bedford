import { BlockHeader } from 'web3-eth';
import Web3 from 'web3';

import LatencyInterpreter from './LatencyInterpreter';

export default class LatencyTester {
  public readonly interpreter: LatencyInterpreter;

  constructor(interpreter: LatencyInterpreter) {
    this.interpreter = interpreter;
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

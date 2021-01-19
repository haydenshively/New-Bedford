import { TransactionReceipt as ITxReceipt } from 'web3-core';

import ITx from './blocks/types/ITx';
import LatencyInterpreter from './LatencyInterpreter';
import TxQueue from './blocks/Queue';

export default class LatencyTester {
  public readonly interpreter: LatencyInterpreter;

  constructor(interpreter: LatencyInterpreter) {
    this.interpreter = interpreter;
  }

  /**
   * Appends a transaction to a queue and sets up listeners that give the
   * LatencyInterpreter enough information to estimate network latency.
   * Note that the queue's wallet must have a ProviderGroup with at least
   * 2 connections.
   *
   * @param queue: the queue to which the tx should be appended
   * @param tx an object describing the transaction
   * @param callback yields receipt when available, or null if off-chain error
   * @param mainConnectionIdx index of the non-primary connection to use for testing.
   *    Should be different from the connection that EthSubscriber is using
   */
  public execute(
    queue: TxQueue,
    tx: ITx,
    callback: (receipt: ITxReceipt | null) => void = () => {},
    mainConnectionIdx = 1
  ): void {
    const timestamp = new Date();
    const sentTx = queue.append(tx, callback, mainConnectionIdx, false);
    sentTx.on('transactionHash', (hash) => {
      this.interpreter.storeHash(hash, timestamp);
    });
  }
}

import { PromiEvent, TransactionReceipt as ITxReceipt } from 'web3-core';
import { QueueSafePromiEvent } from './QueueSafePromiEvent';

import Big from './types/big';
import ITx from './types/ITx';
import Wallet from './Wallet';

const winston = require('winston');

export default class TxQueue {
  private wallet: Wallet;

  private lowestLiquidNonce: number;

  private readonly queue: ITx[];

  constructor(wallet: Wallet) {
    this.wallet = wallet;

    this.lowestLiquidNonce = 0;
    this.queue = [];
  }

  public async init(): Promise<void> {
    return this.wallet.init();
  }

  /**
   * The number of transactions being managed by this queue
   *
   * @returns queue length
   */
  public get length(): number {
    return this.queue.length;
  }

  /**
   * Gets the most recent transaction at a given index
   *
   * @param idx a queue index
   * @returns an object describing the transaction
   */
  public tx(idx: number): ITx {
    return this.queue[idx];
  }

  /**
   * The nonce corresponding to the given queue index
   *
   * @param idx a queue index
   */
  public nonce(idx: number): number {
    return this.lowestLiquidNonce + idx;
  }

  /**
   * The queue index corresponding to the given nonce.
   * CAUTION: May return an index that's not yet in the queue
   *
   * @param nonce a nonce
   */
  public idx(nonce: number): number {
    return nonce - this.lowestLiquidNonce;
  }

  /**
   * Asks network what the account's next unconfirmed nonce is and
   * updates `this.lowestLiquidNonce`
   *
   * If the nonce has increased, `rebase()` will remove confirmed
   * transactions from the queue
   *
   * @returns the number of nonces confirmed since last call
   */
  public async rebase(): Promise<number> {
    const diff = (await this.wallet.getLowestLiquidNonce()) - this.lowestLiquidNonce;
    this.queue.splice(0, diff); // Could log confirmed txs via returned array slice
    this.lowestLiquidNonce += diff;

    if (diff !== 0) winston.info(`⚡️ *Rebase* jumped forward ${diff} nonce(s) on ${this.wallet.label}`);
    return diff;
  }

  /**
   * Estimates the gas necessary to send a given transaction
   *
   * @param tx an object describing the transaction
   * @param idx a queue index, defaults to 0
   * @returns estimated amount of gas that the tx will require
   *
   */
  public estimateGas(tx: ITx, idx = 0): Promise<number> {
    return this.wallet.estimateGas(tx, this.nonce(idx));
  }

  /**
   * Add a transaction to the queue. Gas price must be specified.
   *
   * @param tx an object describing the transaction
   * @param callback yields receipt when available, or null if off-chain error
   *
   * @example
   * // Send the following tx
   * const tx = {
   *  gasPrice: Big("21000000000"),
   *  gasLimit: '0x2710',
   *  to: '0x0000...',
   *  value: '0x00',
   *  data: '0x7f74657374320...',
   * };
   * txQueue.append(tx);
   */
  public append(tx: ITx, callback: (receipt: ITxReceipt | null) => void = () => {}): PromiEvent<ITxReceipt> {
    const idx = this.queue.push(tx) - 1;
    return this.broadcast(idx, callback);
  }

  /**
   * Replace an existing transaction with a new one
   *
   * @param idx a queue index
   * @param tx an object describing the transaction
   * @param gasPriceMode how to update the gas price:
   *    `"as_is"`: use gas price specified in the `tx` arg
   *    `"clip"`: `Math.max(minGasPrice, tx.gasPrice)`
   *    `"min"`: use minimum gas price needed to replace existing txs
   * @param maxGasPrice default null; if specified, the "clip"
   *    mode will enforce this maxGasPrice as well as the min
   * @param callback yields receipt when available, or null if off-chain error
   *
   * @example
   * // Replace the proximal tx with the following
   * const tx = {
   *  gasLimit: '0x2710',
   *  to: '0x0000...',
   *  value: '0x00',
   *  data: '0x7f74657374320...',
   * };
   * txQueue.replace(0, tx, "min");
   */
  public replace(
    idx: number,
    tx: ITx,
    gasPriceMode: 'as_is' | 'clip' | 'min',
    maxGasPrice: Big | null = null,
    callback: (receipt: ITxReceipt | null) => void = () => {},
  ): PromiEvent<ITxReceipt> {
    switch (gasPriceMode) {
      case 'as_is':
        break;
      case 'clip':
        if (maxGasPrice !== null && tx.gasPrice.gt(maxGasPrice)) {
          tx.gasPrice = maxGasPrice;
          break;
        }
        const minGasPrice = this.wallet.minGasPriceFor(this.nonce(idx));
        if (tx.gasPrice.gt(minGasPrice)) break;
      case 'min':
        // @ts-ignore: itentional fallthrough and use of minGasPrice
        tx.gasPrice = minGasPrice;
    }

    this.queue[idx] = tx;
    return this.broadcast(idx, callback);
  }

  /**
   * Set the given index to an empty transaction. Raises the gas price
   * as little as possible.
   *
   * @param idx a queue index
   * @param callback yields receipt when available, or null if off-chain error
   */
  public dump(idx: number, callback: (receipt: ITxReceipt | null) => void = () => {}): PromiEvent<ITxReceipt> {
    this.queue[idx] = this.wallet.emptyTx;
    this.queue[idx].gasPrice = this.wallet.minGasPriceFor(this.nonce(idx));
    return this.broadcast(idx, callback);
  }

  private broadcast(idx: number, callback: (receipt: ITxReceipt | null) => void): PromiEvent<ITxReceipt> {
    const tx = this.queue[idx];
    const nonce = this.nonce(idx);
    const sentTx = this.wallet.signAndSend(tx, nonce);

    return this.setupTxEvents(sentTx, callback);
  }

  private setupTxEvents(
    sentTx: PromiEvent<ITxReceipt>,
    callback: (receipt: ITxReceipt | null) => void,
  ): PromiEvent<ITxReceipt> {
    // After receiving receipt, log success and rebase
    sentTx.on('receipt', (receipt) => {
      // @ts-ignore: I know the removeAllListeners function works
      sentTx.removeAllListeners();
      this.onTxReceipt(receipt);
      callback(receipt);
    });
    // After receiving an error, check if it occurred on or off chain
    // @ts-ignore: I know the (Error, ITxReceipt | undefined) callback type works
    sentTx.on('error', (err: Error, receipt: ITxReceipt | undefined) => {
      // @ts-ignore: I know the removeAllListeners function works
      sentTx.removeAllListeners();

      if (receipt !== undefined) {
        this.onTxReceipt(receipt);
        callback(receipt);
      } else {
        this.onTxError(err);
        callback(null);
      }
    });

    // Return a version of the PromiEvent in which the 'receipt' and 'error'
    // listeners can't be overwritten
    return QueueSafePromiEvent(sentTx);
  }

  private onTxReceipt(receipt: ITxReceipt): void {
    this.rebase();
    // Logging
    const label = `💸 *Transaction* ${this.wallet.label}:${receipt.transactionHash.slice(0, 6)} was `;
    const linkText = receipt.status ? 'successful!' : 'reverted';
    winston.info(`${label}was <https://etherscan.io/tx/${receipt.transactionHash}|${linkText}>`);
  }

  private onTxError(err: Error): void {
    const responses: any = {
      'nonce too low': 'rebase',
      'not mined within': 'ignore',
      // 'replacement transaction underpriced': 'ignore',
      // 'already known': 'ignore',
    };

    for (const text in responses) {
      if (err.message.includes(text)) {
        switch (responses[text]) {
          case 'rebase':
            this.rebase();
            break;
          case 'ignore':
            break;
        }
        return;
      }
    }

    winston.info(`${err.name} ${err.message}`);
  }
}

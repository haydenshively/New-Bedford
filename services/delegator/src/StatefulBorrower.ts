import { EventData } from 'web3-eth-contract';
import Web3 from 'web3';
import winston from 'winston';

import { Big } from '@goldenagellc/web3-blocks';

import { CTokenReversed, CTokenSymbol, cTokenSymbols } from './types/CTokens';
import { CToken } from './contracts/CToken';
import Borrower, { IBorrowerPosition } from './Borrower';

export default class StatefulBorrower extends Borrower {
  protected readonly fetchBlock: number = 0;
  private _didInit: boolean = false;

  constructor(address: string, fetchBlock: number) {
    super(address);
    this.fetchBlock = fetchBlock;
  }

  public get didInit(): boolean {
    return this._didInit;
  }

  public async init(provider: Web3, cTokens: { [_ in CTokenSymbol]: CToken }): Promise<void> {
    if (this._didInit) {
      console.warn('Already initialized borrower. Aborting!');
      return;
    }

    let didInit = true;
    for (let symbol of cTokenSymbols) {
      const snapshot = await cTokens[symbol].getAccountSnapshot(this.address)(provider, this.fetchBlock);
      if (snapshot.error !== '0') {
        didInit = false;
        continue;
      }

      const position = this.positions[symbol];
      position.supply = position.supply.plus(snapshot.cTokenBalance);
      position.borrow = position.borrow.plus(snapshot.borrowBalance);

      const borrowIndex = await cTokens[symbol].borrowIndex()(provider, this.fetchBlock);
      if (borrowIndex.gt(position.borrowIndex)) position.borrowIndex = borrowIndex;
    }
    this._didInit = didInit;
  }

  public onMint(event: EventData, undo = false): void {
    if (event.blockNumber <= this.fetchBlock) return;

    const symbol = this.getSymbolFor(event.address);
    if (symbol === null) return;
    const position = this.positions[symbol];

    if (undo) {
      position.supply = position.supply.minus(event.returnValues.mintTokens);
      winston.info(`🪙 *${symbol} Mint* by ${this.address.slice(2, 8)} removed from chain`);
    } else {
      position.supply = position.supply.plus(event.returnValues.mintTokens);
      winston.info(`🪙 *${symbol} Mint* by ${this.address.slice(2, 8)}`);
    }
  }

  public onRedeem(event: EventData, undo = false): void {
    if (event.blockNumber <= this.fetchBlock) return;

    const symbol = this.getSymbolFor(event.address);
    if (symbol === null) return;
    const position = this.positions[symbol];

    if (undo) {
      position.supply = position.supply.plus(event.returnValues.redeemTokens);
      winston.info(`🪙 *${symbol} Redeem* by ${this.address.slice(2, 8)} removed from chain`);
    } else {
      position.supply = position.supply.minus(event.returnValues.redeemTokens);
      winston.info(`🪙 *${symbol} Redeem* by ${this.address.slice(2, 8)}`);
    }
  }

  public onBorrow(event: EventData, undo = false, currentBorrowIndex: Big): void {
    if (event.blockNumber <= this.fetchBlock) return;

    const symbol = this.getSymbolFor(event.address);
    if (symbol === null) return;
    const position = this.positions[symbol];

    if (undo) {
      position.borrow = position.borrow.minus(event.returnValues.borrowAmount);
      winston.info(`🪙 *${symbol} Borrow* by ${this.address.slice(2, 8)} removed from chain`);
    } else {
      position.borrow = new Big(event.returnValues.accountBorrows);
      position.borrowIndex = currentBorrowIndex;
      winston.info(`🪙 *${symbol} Borrow* by ${this.address.slice(2, 8)}`);
    }
  }

  public onRepayBorrow(event: EventData, undo = false, currentBorrowIndex: Big): void {
    if (event.blockNumber <= this.fetchBlock) return;

    const symbol = this.getSymbolFor(event.address);
    if (symbol === null) return;
    const position = this.positions[symbol];

    if (undo) {
      position.borrow = position.borrow.plus(event.returnValues.repayAmount);
      winston.info(`🪙 *${symbol} Repay* by ${this.address.slice(2, 8)} removed from chain`);
    } else {
      position.borrow = new Big(event.returnValues.accountBorrows);
      position.borrowIndex = currentBorrowIndex;
      winston.info(`🪙 *${symbol} Repay* by ${this.address.slice(2, 8)}`);
    }
  }

  public onLiquidateBorrow(event: EventData, undo = false): void {
    if (event.blockNumber <= this.fetchBlock) return;

    const symbolA = this.getSymbolFor(event.address);
    if (symbolA === null) return;
    const positionA = this.positions[symbolA];
    const symbolB = this.getSymbolFor(event.returnValues.cTokenCollateral);
    if (symbolB === null) return;
    const positionB = this.positions[symbolB];
    if (positionA === null || positionB === null) return;

    if (undo) {
      positionA.borrow = positionA.borrow.plus(event.returnValues.repayAmount);
      positionB.supply = positionB.supply.plus(event.returnValues.seizeTokens);
      winston.info(`💦 Liquidation ${event.transactionHash.slice(0, 10)} removed from chain`);
    } else {
      positionA.borrow = positionA.borrow.minus(event.returnValues.repayAmount);
      positionB.supply = positionB.supply.minus(event.returnValues.seizeTokens);
      winston.info(`💦 ${this.address.slice(2, 8)} had their *${symbolA} liquidated* and ${symbolB} seized`);
    }
  }

  public onTransfer(event: EventData, undo = false): void {
    if (event.blockNumber <= this.fetchBlock) return;

    const symbol = this.getSymbolFor(event.address);
    if (symbol === null) return;
    const position = this.positions[symbol];

    const shouldAdd = this.address === event.returnValues.to;
    if (shouldAdd) {
      if (undo) position.supply = position.supply.minus(event.returnValues.amount);
      else position.supply = position.supply.plus(event.returnValues.amount);
    } else {
      if (undo) position.supply = position.supply.plus(event.returnValues.amount);
      else position.supply = position.supply.minus(event.returnValues.amount);
    }
  }

  private getSymbolFor(address: string): CTokenSymbol | null {
    const symbol = CTokenReversed[address];
    if (symbol === undefined) {
      console.warn(`Address ${address} wasn't found in reverse lookup table!`);
      return null;
    }
    return symbol;
  }
}

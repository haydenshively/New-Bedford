import { EventData } from 'web3-eth-contract';
import Web3 from 'web3';

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

    const position = this.getPositionFor(event.address);
    if (position === null) return;

    if (undo) position.supply = position.supply.minus(event.returnValues.mintTokens);
    else position.supply = position.supply.plus(event.returnValues.mintTokens);
  }

  public onRedeem(event: EventData, undo = false): void {
    if (event.blockNumber <= this.fetchBlock) return;

    const position = this.getPositionFor(event.address);
    if (position === null) return;

    if (undo) position.supply = position.supply.plus(event.returnValues.redeemTokens);
    else position.supply = position.supply.minus(event.returnValues.redeemTokens);
  }

  public onBorrow(event: EventData, undo = false, currentBorrowIndex: Big): void {
    if (event.blockNumber <= this.fetchBlock) return;

    const position = this.getPositionFor(event.address);
    if (position === null) return;

    if (undo) {
      position.borrow = position.borrow.minus(event.returnValues.borrowAmount);
    } else {
      position.borrow = new Big(event.returnValues.accountBorrows);
      position.borrowIndex = currentBorrowIndex;
    }
  }

  public onRepayBorrow(event: EventData, undo = false, currentBorrowIndex: Big): void {
    if (event.blockNumber <= this.fetchBlock) return;

    const position = this.getPositionFor(event.address);
    if (position === null) return;

    if (undo) {
      position.borrow = position.borrow.plus(event.returnValues.repayAmount);
    } else {
      position.borrow = new Big(event.returnValues.accountBorrows);
      position.borrowIndex = currentBorrowIndex;
    }
  }

  public onLiquidateBorrow(event: EventData, undo = false): void {
    if (event.blockNumber <= this.fetchBlock) return;

    const positionA = this.getPositionFor(event.address);
    const positionB = this.getPositionFor(event.returnValues.cTokenCollateral);
    if (positionA === null || positionB === null) return;

    if (undo) {
      positionA.borrow = positionA.borrow.plus(event.returnValues.repayAmount);
      positionB.supply = positionB.supply.plus(event.returnValues.seizeTokens);
    } else {
      positionA.borrow = positionA.borrow.minus(event.returnValues.repayAmount);
      positionB.supply = positionB.supply.minus(event.returnValues.seizeTokens);
    }
  }

  public onTransfer(event: EventData, undo = false): void {
    if (event.blockNumber <= this.fetchBlock) return;

    const position = this.getPositionFor(event.address);
    if (position === null) return;

    const shouldAdd = this.address === event.returnValues.to;
    if (shouldAdd) {
      if (undo) position.supply = position.supply.minus(event.returnValues.amount);
      else position.supply = position.supply.plus(event.returnValues.amount);
    } else {
      if (undo) position.supply = position.supply.plus(event.returnValues.amount);
      else position.supply = position.supply.minus(event.returnValues.amount);
    }
  }

  private getPositionFor(address: string): IBorrowerPosition | null {
    const symbol = CTokenReversed[address];
    if (symbol === undefined) {
      console.warn(`Address ${address} wasn't found in reverse lookup table!`);
      return null;
    }
    return this.positions[symbol];
  }
}

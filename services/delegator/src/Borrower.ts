import { Big } from '@goldenagellc/web3-blocks';
import { EventData } from 'web3-eth-contract';
import Web3 from 'web3';
import cTokens from './contracts/CToken';

import { CTokenReversed, CTokenSymbol, cTokenSymbols } from './types/CTokens';

type BorrowIndex = {
  value: BigInt;
  block: number;
  logIndex: number;
};

interface IBorrowerPosition {
  supply: Big;
  borrow: Big;
  borrowIndices: BorrowIndex[];
}

export default class Borrower {
  private readonly address: string;
  private readonly positions: { readonly [_ in CTokenSymbol]: IBorrowerPosition };
  private readonly fetchBlock: number;
  private didInit: boolean = false;

  constructor(address: string, fetchBlock: number) {
    this.address = address;
    this.positions = Object.fromEntries(
      cTokenSymbols.map((symbol) => [symbol, { supply: Big('0'), borrow: Big('0'), borrowIndices: <BorrowIndex[]>[] }]),
    ) as { [_ in CTokenSymbol]: IBorrowerPosition };
    this.fetchBlock = fetchBlock;
  }

  public seemsValid(): boolean {
    return this.didInit;
  }

  public async init(provider: Web3): Promise<void> {
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
    }

    this.didInit = didInit;
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
      this.removeBorrowIndex(position, event);
    } else {
      position.borrow = Big(event.returnValues.accountBorrows);
      this.storeBorrowIndex(position, event, currentBorrowIndex);
    }
  }

  public onRepayBorrow(event: EventData, undo = false, currentBorrowIndex: Big): void {
    if (event.blockNumber <= this.fetchBlock) return;

    const position = this.getPositionFor(event.address);
    if (position === null) return;

    if (undo) {
      position.borrow = position.borrow.plus(event.returnValues.repayAmount);
      this.removeBorrowIndex(position, event);
    } else {
      position.borrow = Big(event.returnValues.accountBorrows);
      this.storeBorrowIndex(position, event, currentBorrowIndex);
    }
  }

  public onLiquidateBorrow(event: EventData): void {
    if (event.blockNumber <= this.fetchBlock) return;
    
    const positionA = this.getPositionFor(event.address);
    const positionB = this.getPositionFor(event.returnValues.cTokenCollateral);
    if (positionA === null || positionB === null) return;
    positionA.borrow = positionA.borrow.minus(event.returnValues.repayAmount);
    positionB.supply = positionB.supply.minus(event.returnValues.seizeTokens);
  }

  private storeBorrowIndex(position: IBorrowerPosition, event: EventData, borrowIndex: Big): void {
    // ** PROCESS IS SIMILAR TO PRICES IN `StatefulPricesOnChain` **
    position.borrowIndices.push({
      value: borrowIndex,
      block: event.blockNumber,
      logIndex: event.logIndex,
    });
    // Sort in-place, most recent block first (in case events come out-of-order)
    position.borrowIndices.sort((a, b) => b.block - a.block);
    // Assume chain won't reorder more than 12 blocks, and trim prices array accordingly...
    // BUT always maintain at least 2 items in the array (new price and 1 other price)
    // in case the new price gets removed from the chain later on (need fallback)
    const idx = position.borrowIndices.findIndex((i) => event.blockNumber - i.block > 12);
    if (idx !== -1) position.borrowIndices.splice(Math.max(idx, 2));
  }

  private removeBorrowIndex(position: IBorrowerPosition, event: EventData): void {
    const idx = position.borrowIndices.findIndex((i) => i.block === event.blockNumber && i.logIndex === event.logIndex);
    if (idx !== -1) position.borrowIndices.splice(idx, 1);
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

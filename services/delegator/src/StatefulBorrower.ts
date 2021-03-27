import { EventData } from 'web3-eth-contract';
import Web3 from 'web3';
import winston from 'winston';

import { CTokensReversed, CTokenSymbol, cTokenSymbols } from './types/CTokens';
import { CToken } from './contracts/CToken';
import Borrower from './Borrower';

export default class StatefulBorrower extends Borrower {
  private readonly provider: Web3;
  private readonly cTokens: { [_ in CTokenSymbol]: CToken };

  constructor(address: string, provider: Web3, cTokens: { [_ in CTokenSymbol]: CToken }) {
    super(address);
    this.provider = provider;
    this.cTokens = cTokens;
  }

  public fetchAll(block: number): Promise<void>[] {
    return cTokenSymbols.map((symbol) => this.fetch(symbol, block));
  }

  public async fetch(symbol: CTokenSymbol, block: number): Promise<void> {
    const snapshot = await this.cTokens[symbol].getAccountSnapshot(this.address)(this.provider, block);
    if (snapshot.error !== '0') return;

    const borrowIndex = await this.cTokens[symbol].borrowIndex()(this.provider, block);

    const position = this.positions[symbol];
    position.supply = snapshot.cTokenBalance;
    position.borrow = snapshot.borrowBalance;
    position.borrowIndex = borrowIndex;
  }

  public onMint(event: EventData): Promise<void> | void {
    const symbol = this.getSymbolFor(event.address);
    if (symbol === null) return;

    winston.log('debug', `🟢 *${symbol} Mint* by ${this.address.slice(0, 6)}`);
    return this.fetch(symbol, event.blockNumber);
  }

  public onRedeem(event: EventData): Promise<void> | void {
    const symbol = this.getSymbolFor(event.address);
    if (symbol === null) return;

    winston.log('debug', `🟢 *${symbol} Redeem* by ${this.address.slice(0, 6)}`);
    return this.fetch(symbol, event.blockNumber);
  }

  public onBorrow(event: EventData): Promise<void> | void {
    const symbol = this.getSymbolFor(event.address);
    if (symbol === null) return;

    winston.log('debug', `🔵 *${symbol} Borrow* by ${this.address.slice(0, 6)}`);
    return this.fetch(symbol, event.blockNumber);
  }

  public onRepayBorrow(event: EventData): Promise<void> | void {
    const symbol = this.getSymbolFor(event.address);
    if (symbol === null) return;

    winston.log('debug', `🔵 *${symbol} Repay* by ${this.address.slice(0, 6)}`);
    return this.fetch(symbol, event.blockNumber);
  }

  public onLiquidateBorrow(event: EventData, undo = false): Promise<void[]> | void {
    const symbolRepay = this.getSymbolFor(event.address);
    const symbolSeize = this.getSymbolFor(event.returnValues.cTokenCollateral);
    if (symbolRepay === null || symbolSeize === null) return;

    winston.info(
      `🎣 ${this.address.slice(
        0,
        6,
      )} had their *${symbolRepay} liquidated* and ${symbolSeize} seized by <https://etherscan.io/address/${
        event.returnValues.liquidator
      }|${event.returnValues.liquidator.slice(0, 6)}>`,
    );
    return Promise.all([this.fetch(symbolRepay, event.blockNumber), this.fetch(symbolSeize, event.blockNumber)]);
  }

  public onTransfer(event: EventData): Promise<void> | void {
    const symbol = this.getSymbolFor(event.address);
    if (symbol === null) return;

    return this.fetch(symbol, event.blockNumber);
  }

  private getSymbolFor(address: string): CTokenSymbol | null {
    const symbol = CTokensReversed[address];
    if (symbol === undefined) {
      console.warn(`Address ${address} wasn't found in reverse lookup table!`);
      return null;
    }
    return symbol;
  }
}

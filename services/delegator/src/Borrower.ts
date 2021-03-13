import Web3 from 'web3';

import { Big } from '@goldenagellc/web3-blocks';

import { CTokenSymbol, cTokenSymbols } from './types/CTokens';
import { CToken } from './contracts/CToken';
import PriceLedger from './PriceLedger';
import StatefulComptroller from './StatefulComptroller';

export interface IBorrowerPosition {
  supply: Big;
  borrow: Big;
  borrowIndex: Big;
}

interface ILiquidity {
  liquidity: Big;
  shortfall: Big;
  symbols: CTokenSymbol[];
  edges: ('min' | 'max')[];
}

export default class Borrower {
  public readonly address: string;
  protected readonly positions: { readonly [_ in CTokenSymbol]: IBorrowerPosition };

  constructor(address: string) {
    this.address = address;
    this.positions = Object.fromEntries(
      cTokenSymbols.map((symbol) => [symbol, { supply: new Big('0'), borrow: Big('0'), borrowIndex: Big('0') }]),
    ) as { [_ in CTokenSymbol]: IBorrowerPosition };
  }

  public async verify(
    provider: Web3,
    cTokens: { [_ in CTokenSymbol]: CToken },
    borrowIndices: { [_ in CTokenSymbol]: Big },
    threshold: number,
  ): Promise<boolean> {
    for (let symbol of cTokenSymbols) {
      const snapshot = await cTokens[symbol].getAccountSnapshot(this.address)(provider);
      if (snapshot.error !== '0') {
        console.error(`Failed to get account snapshot for ${this.address}: ${snapshot.error}`);
        return false;
      }
      
      const position = this.positions[symbol];
      if (position.borrowIndex.eq('0')) {
        console.error(`${this.address} invalud due to 0 borrow index`);
        return false;
      }
      const supply = position.supply;
      const borrow = position.borrow.times(borrowIndices[symbol]).div(position.borrowIndex);

      if (supply.eq('0')) {
        if (!snapshot.cTokenBalance.eq('0')) {
          console.error(`${this.address} invalid due to 0 supply mismatch`);
          return false;
        }
      } else {
        const supplyError = supply.minus(snapshot.cTokenBalance).div(snapshot.cTokenBalance).abs();
        if (supplyError.toNumber() > threshold) {
          console.error(`${this.address} invalid due to high supply error (${supplyError.toFixed(5)})`);
          return false;
        }
      }

      if (borrow.eq('0')) {
        if (!snapshot.borrowBalance.eq('0')) {
          console.error(`${this.address} invalid due to 0 borrow mismatch`);
          return false;
        }
      } else {
        const borrowError = borrow.minus(snapshot.borrowBalance).div(snapshot.borrowBalance).abs();
        if (borrowError.toNumber() > threshold) {
          console.error(`${this.address} invalid due to high borrow error (${borrowError.toFixed(5)})`);
          return false;
        }
      }
    }
    return true;
  }

  public liquidity(
    comptroller: StatefulComptroller,
    priceLedger: PriceLedger,
    exchangeRates: { [_ in CTokenSymbol]: Big },
    borrowIndices: { [_ in CTokenSymbol]: Big },
  ): ILiquidity | null {
    let collat: Big = new Big('0');
    let borrow: Big = new Big('0');
    const symbols: CTokenSymbol[] = [];
    const edges: ('min' | 'max')[] = [];

    for (let symbol of cTokenSymbols) {
      const position = this.positions[symbol];
      if (position.supply.eq('0') || position.borrow.eq('0') || position.borrowIndex.eq('0')) continue;

      const collateralFactor = comptroller.getCollateralFactor(symbol);
      const pricesUSD = priceLedger.getPrices(symbol);
      if (collateralFactor === null || pricesUSD.min === null || pricesUSD.max === null) return null;

      const edge: 'min' | 'max' = position.supply.gt('0') ? 'min' : 'max';
      collat = collat.plus(
        position.supply
          .times(exchangeRates[symbol])
          .div('1e+18')
          .times(collateralFactor)
          .div('1e+18')
          .times(pricesUSD[edge]!),
      );
      borrow = borrow.plus(
        position.borrow.times(borrowIndices[symbol]).div(position.borrowIndex).times(pricesUSD[edge]!),
      );
      symbols.push(symbol);
      edges.push(edge);
    }

    let liquidity: Big;
    let shortfall: Big;
    if (collat.gt(borrow)) {
      liquidity = collat.minus(borrow);
      shortfall = new Big('0');
    } else {
      liquidity = new Big('0');
      shortfall = borrow.minus(collat);
    }

    return {
      liquidity: liquidity,
      shortfall: shortfall,
      symbols: symbols,
      edges: edges,
    };
  }
}

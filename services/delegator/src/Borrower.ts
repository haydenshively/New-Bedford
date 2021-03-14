import Web3 from 'web3';

import { Big } from '@goldenagellc/web3-blocks';

import { CTokens, CTokenSymbol, cTokenSymbols, CTokenVersion, CTokenVersions } from './types/CTokens';
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
        console.error(`${this.address} invalid due to 0 borrow index`);
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
    let supply: Big = new Big('0');
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
      supply = supply.plus(
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
    if (supply.gt(borrow)) {
      liquidity = supply.minus(borrow);
      shortfall = new Big('0');
    } else {
      liquidity = new Big('0');
      shortfall = borrow.minus(supply);
    }

    return {
      liquidity: liquidity,
      shortfall: shortfall,
      symbols: symbols,
      edges: edges,
    };
  }

  public expectedRevenue(
    comptroller: StatefulComptroller,
    priceLedger: PriceLedger,
    exchangeRates: { [_ in CTokenSymbol]: Big },
    borrowIndices: { [_ in CTokenSymbol]: Big },
  ): any | null {
    const closeFactor = comptroller.getCloseFactor();
    const liquidationIncentive = comptroller.getLiquidationIncentive();
    if (closeFactor === null || liquidationIncentive === null) return null;

    let supplyTotal: Big = new Big('0'); // total available borrow
    let borrowTotal: Big = new Big('0'); // utilized borrow
    const symbols: CTokenSymbol[] = [];
    const edges: ('min' | 'max')[] = [];

    // top2_____Assets will contain symbols.
    // idx 0 is the best, and idx 1 is the second best
    let top2RepayAssets: (CTokenSymbol | null)[] = [null, null];
    let top2SeizeAssets: (CTokenSymbol | null)[] = [null, null];
    // top2_____Assets will contain amounts (in USD) corresponding
    // to the top2_____Assets
    let top2RepayAmounts: Big[] = [new Big('0'), new Big('0')];
    let top2SeizeAmounts: Big[] = [new Big('0'), new Big('0')];

    for (let symbol of cTokenSymbols) {
      // retrieve position and ensure everything is non-zero
      const position = this.positions[symbol];
      if (position.supply.eq('0') || position.borrow.eq('0') || position.borrowIndex.eq('0')) continue;

      // retrieve collateral factor, min price, and max price for this symbol
      const collateralFactor = comptroller.getCollateralFactor(symbol);
      const pricesUSD = priceLedger.getPrices(symbol);
      if (collateralFactor === null || pricesUSD.min === null || pricesUSD.max === null) return null;

      // liquidity calculations
      const edge: 'min' | 'max' = position.supply.gt('0') ? 'min' : 'max';
      const supply = position.supply
        .times(exchangeRates[symbol]) // 18 extra
        .div('1e+18') // 0 extra (now in units of underlying)
        .times(collateralFactor) // 18 extra
        .div('1e+18') // 0 extra (still in units of underlying)
        .times(pricesUSD[edge]!);
      const borrow = position.borrow.times(borrowIndices[symbol]).div(position.borrowIndex).times(pricesUSD[edge]!);

      // revenue calculations
      const seize = supply.div(liquidationIncentive).times('1e+18');
      const repay = borrow.times(closeFactor).div('1e+18');

      // update outer liquidity variables
      supplyTotal = supplyTotal.plus(supply);
      borrowTotal = borrowTotal.plus(borrow);
      symbols.push(symbol);
      edges.push(edge);

      // update outer revenue variables...
      // ...repay
      if (top2RepayAmounts[0].lt(repay)) {
        top2RepayAmounts = [repay, top2RepayAmounts[0]];
        top2RepayAssets = [symbol, top2RepayAssets[0]];
      } else if (top2RepayAmounts[1].lt(repay)) {
        top2RepayAmounts[1] = repay;
        top2RepayAssets[1] = symbol;
      }
      // ...seize
      if (top2SeizeAmounts[0].lt(seize)) {
        top2SeizeAmounts = [seize, top2SeizeAmounts[0]];
        top2SeizeAssets = [symbol, top2SeizeAssets[0]];
      } else if (top2SeizeAmounts[1].lt(seize)) {
        top2SeizeAmounts[1] = seize;
        top2SeizeAssets[1] = symbol;
      }
    }

    let repayCToken: CTokens | null = null;
    let seizeCToken: CTokens | null = null;
    let revenue = new Big('0');

    if (top2RepayAssets[0] !== null && top2SeizeAssets[0] !== null) {
      const ableToPickBest =
        top2RepayAssets[0] !== top2SeizeAssets[0] || CTokenVersions[top2RepayAssets[0]] === CTokenVersion.V2;
      
      const repayIdx = Number(!ableToPickBest && top2RepayAmounts[1].gt(top2SeizeAmounts[1]));
      const seizeIdx = Number(ableToPickBest ? false : !repayIdx);

      if (top2RepayAssets[repayIdx] !== null && top2SeizeAssets[seizeIdx] !== null) {
        repayCToken = CTokens[top2RepayAssets[repayIdx]!];
        seizeCToken = CTokens[top2SeizeAssets[seizeIdx]!];
        const repayAmount = top2RepayAmounts[repayIdx];
        const seizeAmount = top2SeizeAmounts[seizeIdx];

        if (repayAmount.lt(seizeAmount)) {
          revenue = repayAmount.times(liquidationIncentive.minus('1e+18')).div('1e+18');
        } else {
          revenue = seizeAmount.times(liquidationIncentive.minus('1e+18')).div('1e+18');
        }
      }
    }

    let liquidity: Big;
    let shortfall: Big;
    if (supplyTotal.gt(borrowTotal)) {
      liquidity = supplyTotal.minus(borrowTotal);
      shortfall = new Big('0');
    } else {
      liquidity = new Big('0');
      shortfall = borrowTotal.minus(supplyTotal);
    }

    return {
      liquidity: liquidity,
      shortfall: shortfall,
      symbols: symbols,
      edges: edges,
      repayCToken: repayCToken,
      seizeCToken: seizeCToken,
      expectedRevenue: revenue,
    };
  }
}

import { Big } from '@goldenagellc/web3-blocks';

import {
  CTokens,
  CTokenSymbol,
  cTokenSymbols,
  CTokenVersion,
  cTokenVersions,
  cTokenUnderlyingDecimals as decimals,
} from './types/CTokens';
import PriceLedger from './PriceLedger';
import StatefulComptroller from './StatefulComptroller';

export interface IBorrowerPosition {
  supply: Big;
  borrow: Big;
  borrowIndex: Big;
}

interface ILiquidationInformation {
  health: Big;
  repayCToken: CTokens;
  seizeCToken: CTokens;
  revenueETH: Big;
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

  public expectedRevenue(
    comptroller: StatefulComptroller,
    priceLedger: PriceLedger,
    exchangeRates: { [_ in CTokenSymbol]: Big },
    borrowIndices: { [_ in CTokenSymbol]: Big },
  ): ILiquidationInformation | null {
    const closeFactor = comptroller.getCloseFactor();
    const liquidationIncentive = comptroller.getLiquidationIncentive();
    if (closeFactor === null || liquidationIncentive === null) {
      console.log('Borrower computation error: closeFactor|liquidationIncentive === null');
      return null;
    }

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
      // retrieve position and ensure it's valid
      const position = this.positions[symbol];
      if (position.supply.eq('0') && position.borrow.eq('0')) continue;
      if (position.borrow.gt('0') && position.borrowIndex.eq('0')) continue;

      // retrieve collateral factor, min price, and max price for this symbol
      const collateralFactor = comptroller.getCollateralFactor(symbol);
      const pricesUSD = priceLedger.getPrices(symbol);
      if (collateralFactor === null || pricesUSD.min === null || pricesUSD.max === null) {
        console.log('Borrower computation error: collateralFactor|price.min|price.max === null');
        return null;
      }

      // liquidity calculations
      const edge: 'min' | 'max' = position.supply.gt('0') ? 'min' : 'max';
      const supply = position.supply.gt('0')
        ? position.supply
            .times(exchangeRates[symbol]) // 18 extra
            .div('1e+18') // 0 extra (now in units of underlying)
            .times(collateralFactor) // 18 extra
            .div('1e+18') // 0 extra (still in units of underlying)
            .times(pricesUSD[edge]!) // now in USD, with (6 + N) decimals
            .div(`1e+${decimals[symbol]}`)
        : new Big('0');
      const borrow = position.borrow.gt('0')
        ? position.borrow
            .times(borrowIndices[symbol])
            .div(position.borrowIndex)
            .times(pricesUSD[edge]!)
            .div(`1e+${decimals[symbol]}`)
        : new Big('0');

      // revenue calculations
      const seize = supply.times('1e+18').div(liquidationIncentive);
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
        top2RepayAssets[0] !== top2SeizeAssets[0] || cTokenVersions[top2RepayAssets[0]] === CTokenVersion.V2;

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

        const priceETH = priceLedger.getPrices('cETH').min;
        return {
          health: supplyTotal.div(borrowTotal),
          repayCToken: repayCToken,
          seizeCToken: seizeCToken,
          revenueETH: priceETH === null ? new Big('0') : revenue.times('1e+6').div(priceETH),
          symbols: symbols,
          edges: edges,
        };
      } else {
        // console.log(`Borrower computation error: ${this.address.slice(2, 8)} only has one asset and not v2`);
        return null;
      }
    } else {
      // console.log(`Borrower computation error: ${this.address.slice(2, 8)} repay or seize is null`);
      return null;
    }
  }
}

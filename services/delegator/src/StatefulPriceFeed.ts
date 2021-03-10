import { EventData } from 'web3-eth-contract';
import Web3 from 'web3';

import { Big } from '@goldenagellc/web3-blocks';

import { OpenOraclePriceData } from './contracts/OpenOraclePriceData';
import { UniswapAnchoredView } from './contracts/UniswapAnchoredView';
import { CoinbaseKey, coinbaseKeyMap } from './types/CoinbaseKeys';
import { CTokens, CTokenSymbol, cTokenSymbols, CTokenUnderlyingDecimals as decimals } from './types/CTokens';
import IPrice from './types/IPrice';

interface IOnChainPrice extends IPrice {
  block: number;
  logIndex: number;
}

export default class StatefulPriceFeed {
  private readonly provider: Web3;
  private readonly openOraclePriceData: OpenOraclePriceData;
  private readonly uniswapAnchoredView: UniswapAnchoredView;

  private prices: { [_ in CTokenSymbol]: IOnChainPrice[] } = {
    cBAT: [],
    cCOMP: [],
    cDAI: [],
    cETH: [],
    cREP: [],
    cSAI: [],
    cUNI: [],
    cUSDC: [],
    cUSDT: [],
    cWBTC: [],
    cZRX: [],
  };

  constructor(provider: Web3, openOraclePriceData: OpenOraclePriceData, uniswapAnchoredView: UniswapAnchoredView) {
    this.provider = provider;
    this.openOraclePriceData = openOraclePriceData;
    this.uniswapAnchoredView = uniswapAnchoredView;
  }

  public async init(): Promise<void> {
    const block = await this.provider.eth.getBlockNumber();
    await Promise.all(this.fetchPrices(block));

    this.subscribeToPrices(block);
  }

  public getPrice(symbol: CTokenSymbol): IOnChainPrice {
    return this.prices[symbol][0];
  }

  private fetchPrices(block: number): Promise<void>[] {
    return cTokenSymbols.map(async (symbol) => {
      const price = await this.uniswapAnchoredView.getUnderlyingPrice(CTokens[symbol])(this.provider, block);
      this.prices[symbol].push({
        value: price.div(`1e+${(36 - 6 - decimals[symbol]).toFixed(0)}`),
        timestamp: '0',
        block: block,
        logIndex: 0,
      });
    });
  }

  private subscribeToPrices(block: number): void {
    this.openOraclePriceData
      .bindTo(this.provider)
      .subscribeTo.Write(block)
      .on('connected', (id: string) => {
        console.log(`StatefulPriceFeed: Bound prices to ${id}`);
      })
      .on('data', (ev: EventData) => {
        if (!Object.keys(coinbaseKeyMap).includes(ev.returnValues.key)) return;
        const symbol = coinbaseKeyMap[ev.returnValues.key as CoinbaseKey];

        // Store the new price
        const newPrice = {
          value: Big(ev.returnValues.value),
          timestamp: ev.returnValues.timestamp,
          block: ev.blockNumber,
          logIndex: ev.logIndex,
        };
        this.prices[symbol].push(newPrice);
        // Sort in-place, most recent block first (in case events come out-of-order)
        this.prices[symbol].sort((a, b) => b.block - a.block);
        // Assume chain won't reorder more than 12 blocks, and trim prices array accordingly...
        // BUT always maintain at least 2 items in the array (new price and 1 other price)
        // in case the new price gets removed from the chain later on (need fallback)
        const idx = this.prices[symbol].findIndex((p) => newPrice.block - p.block > 12);
        if (idx !== -1) this.prices[symbol].splice(Math.max(idx, 2));

        console.log(`${symbol} price is now at $${newPrice.value.div('1e+6').toFixed(2)}`);
        console.log(`${symbol} price array has length ${this.prices[symbol].length}`);
      })
      .on('changed', (ev: EventData) => {
        if (!Object.keys(coinbaseKeyMap).includes(ev.returnValues.key)) return;
        const symbol = coinbaseKeyMap[ev.returnValues.key as CoinbaseKey];

        const idx = this.prices[symbol].findIndex((p) => p.block === ev.blockNumber && p.logIndex === ev.logIndex);
        if (idx !== -1) this.prices[symbol].splice(idx, 1);

        console.log(`${symbol} price data was changed by chain reordering`);
      })
      .on('error', console.log);
  }
}

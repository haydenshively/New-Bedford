import { EventData } from 'web3-eth-contract';
import Web3 from 'web3';

import { Big } from '@goldenagellc/web3-blocks';

import { PriceData } from './contracts/PriceData';
import { PriceFeed } from './contracts/PriceFeed';
import { CTokens, CTokenUnderlyingDecimals as decimals, symbols } from './types/CTokens';

const KEY_SYMBOL: { [i: string]: keyof typeof CTokens } = {
  BAT: 'cBAT',
  COMP: 'cCOMP',
  DAI: 'cDAI',
  ETH: 'cETH',
  REP: 'cREP',
  SAI: 'cSAI',
  UNI: 'cUNI',
  USDC: 'cUSDC',
  USDT: 'cUSDT',
  BTC: 'cWBTC',
  ZRX: 'cZRX',
};

interface Price {
  value: Big;
  timestamp: number;
  block: number;
  logIndex: number;
}

export default class StatefulPriceFeed {
  private readonly provider: Web3;
  private readonly priceData: PriceData;
  private readonly priceFeed: PriceFeed;

  private prices: { -readonly [_ in keyof typeof CTokens]: Price[] } = {
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

  constructor(provider: Web3, priceData: PriceData, priceFeed: PriceFeed) {
    this.provider = provider;
    this.priceData = priceData;
    this.priceFeed = priceFeed;
  }

  public async init(): Promise<void> {
    const block = await this.provider.eth.getBlockNumber();
    await Promise.all(this.fetchPrices(block));

    this.subscribeToPrices(block);
  }

  public getPrice(symbol: keyof typeof CTokens): Price {
    return this.prices[symbol][0];
  }

  private fetchPrices(block: number): Promise<void>[] {
    return symbols.map(async (symbol) => {
      const price = await this.priceFeed.getUnderlyingPrice(CTokens[symbol])(this.provider, block);
      this.prices[symbol].push({
        value: price.div(`1e+${(36 - 6 - decimals[symbol]).toFixed(0)}`),
        timestamp: 0,
        block: block,
        logIndex: 0,
      });
    });
  }

  private subscribeToPrices(block: number): void {
    this.priceData
      .bindTo(this.provider)
      .subscribeTo.Write(block)
      .on('connected', (id: string) => {
        console.log(`StatefulPriceFeed: Bound prices to ${id}`);
      })
      .on('data', (ev: EventData) => {
        if (!Object.keys(KEY_SYMBOL).includes(ev.returnValues.key)) return;
        const symbol = KEY_SYMBOL[ev.returnValues.key];

        // Store the new price
        const newPrice = {
          value: Big(ev.returnValues.value),
          timestamp: Number(ev.returnValues.timestamp),
          block: ev.blockNumber,
          logIndex: ev.logIndex,
        };
        this.prices[symbol].push(newPrice);
        // Sort in-place, most recent timestamp first (in case events come out-of-order)
        this.prices[symbol].sort((a, b) => b.timestamp - a.timestamp);
        // Assume chain won't reorder more than 12 blocks, and trim prices array accordingly...
        // BUT always maintain at least 2 items in the array (new price and 1 other price)
        // in case the new price gets removed from the chain later on (need fallback)
        const idx = this.prices[symbol].findIndex((p) => newPrice.block - p.block > 12);
        if (idx !== -1) this.prices[symbol].splice(Math.max(idx, 2));

        console.log(`${symbol} price is now at $${newPrice.value.div('1e+6').toFixed(0)}`);
        console.log(`${symbol} price array has length ${this.prices[symbol].length}`);
      })
      .on('changed', (ev: EventData) => {
        if (!Object.keys(KEY_SYMBOL).includes(ev.returnValues.key)) return;
        const symbol = KEY_SYMBOL[ev.returnValues.key];

        const idx = this.prices[symbol].findIndex((p) => p.block === ev.blockNumber && p.logIndex === ev.logIndex);
        if (idx !== -1) this.prices[symbol].splice(idx, 1);

        console.log(`${symbol} price data was changed by chain reordering`);
      })
      .on('error', console.log);
  }
}

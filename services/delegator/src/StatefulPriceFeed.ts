import { EventData } from 'web3-eth-contract';
import Web3 from 'web3';

import { Big } from '@goldenagellc/web3-blocks';

import { PriceFeed } from './contracts/PriceFeed';
import { CTokens, symbols } from './types/CTokens';

interface Price {
  value: Big;
  valueOld: Big;
  timestamp: number;
  block: number;
  logIndex: number;
}

export default class StatefulPriceFeed {
  private readonly provider: Web3;
  private readonly priceFeed: PriceFeed;

  private anchorPeriod: Big | null;
  private lowerBoundAnchorRatio: Big | null;
  private upperBoundAnchorRatio: Big | null;
  private prices: { -readonly [_ in keyof typeof CTokens]: Price | null } = {
    cBAT: null,
    cCOMP: null,
    cDAI: null,
    cETH: null,
    cREP: null,
    cSAI: null,
    cUNI: null,
    cUSDC: null,
    cUSDT: null,
    cWBTC: null,
    cZRX: null,
  };

  constructor(provider: Web3, priceFeed: PriceFeed) {
    this.provider = provider;
    this.priceFeed = priceFeed;
  }

  public getAnchorPeriod(): Big | null {
    return this.anchorPeriod;
  }

  public getLowerBoundAnchorRatio(): Big | null {
    return this.lowerBoundAnchorRatio;
  }

  public getUpperBoundAnchorRatio(): Big | null {
    return this.upperBoundAnchorRatio;
  }

  public async init(): Promise<void> {
    const block = await this.provider.eth.getBlockNumber();

    this.anchorPeriod = await this.priceFeed.anchorPeriod()(this.provider, block);
    this.lowerBoundAnchorRatio = await this.priceFeed.lowerBoundAnchorRatio()(this.provider, block);
    this.upperBoundAnchorRatio = await this.priceFeed.upperBoundAnchorRatio()(this.provider, block);

    await Promise.all(this.fetchPrices(block));

    this.subscribeToPrices(block);
  }

  private fetchPrices(block: number): Promise<void>[] {
    return symbols.map(async (symbol) => {
      const price = await this.priceFeed.getUnderlyingPrice(CTokens[symbol])(this.provider, block);
      this.prices[symbol] = {
        value: price,
        valueOld: price,
        timestamp: 0,
        block: block,
        logIndex: 0,
      };
    });
  }

  private static shouldAllowData(ev: EventData, price: Price): boolean {
    return ev.blockNumber > price.block || (ev.blockNumber == price.block && ev.logIndex > price.logIndex);
  }

  private static shouldAllowDataChange(ev: EventData, price: Price): boolean {
    return ev.blockNumber < price.block || (ev.blockNumber == price.block && ev.logIndex < price.logIndex);
  }

  private subscribeToPrices(block: number): void {
    this.priceFeed
      .bindTo(this.provider)
      .subscribeTo.PriceUpdated(block)
      .on('connected', (id: string) => {
        console.log(`StatefulPriceFeed: Bound prices to ${id}`);
      })
      .on('data', (ev: EventData) => {
        if (!Object.keys(this.prices).includes(ev.returnValues.symbol)) return;

        const symbol: keyof typeof CTokens = ev.returnValues.symbol;
        const price = this.prices[symbol]!;
        if (!StatefulPriceFeed.shouldAllowData(ev, price)) return;

        price.valueOld = price!.value;
        price.value = Big(ev.returnValues.price);
        price.timestamp = 0;
        price.block = ev.blockNumber;
        price.logIndex = ev.logIndex;
      })
      .on('changed', (ev: EventData) => {
        if (!Object.keys(this.prices).includes(ev.returnValues.symbol)) return;

        const symbol: keyof typeof CTokens = ev.returnValues.symbol;
        const price = this.prices[symbol]!;
        if (!StatefulPriceFeed.shouldAllowDataChange(ev, price)) return;

        price.value = price.valueOld;
        price.block = ev.blockNumber;
        price.logIndex = ev.logIndex;
      })
      .on('error', console.log);
  }
}

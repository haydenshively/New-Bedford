import { Big } from '@goldenagellc/web3-blocks';

import { CoinbaseKey } from './types/CoinbaseKeys';
import { CTokenSymbol, cTokenCoinbaseKeys } from './types/CTokens';
import IPostablePriceFormat from './types/IPostablePriceFormat';
import IPrice from './types/IPrice';
import IPriceRange from './types/IPriceRange';

interface PostableDatum {
  key: CoinbaseKey;
  message: string;
  signature: string;
}

type TimestampMap = { [i: string]: PostableDatum };

const USD_VALUE: Big = new Big('1000000');
const SAI_PER_ETH = '0.005285';

export default class PriceLedger {
  private readonly prices: { [_ in CoinbaseKey]: IPriceRange | null } = {
    BAT: null,
    COMP: null,
    DAI: null,
    ETH: null,
    REP: null,
    UNI: null,
    BTC: null,
    ZRX: null,
  };
  private readonly priceHistories: { readonly [_ in CoinbaseKey]: IPrice[] } = {
    BAT: [],
    COMP: [],
    DAI: [],
    ETH: [],
    REP: [],
    UNI: [],
    BTC: [],
    ZRX: [],
  };
  private readonly postableData: { readonly [_ in CoinbaseKey]: TimestampMap } = {
    BAT: {},
    COMP: {},
    DAI: {},
    ETH: {},
    REP: {},
    UNI: {},
    BTC: {},
    ZRX: {},
  };

  public get summaryText(): string {
    return this.summaryTextForAll(Object.keys(this.prices) as CoinbaseKey[]);
  }

  public summaryTextForAll(keys: CoinbaseKey[]): string {
    const texts: string[] = [];
    keys.forEach((key) => {
      const text = this.summaryTextFor(key);
      if (text !== null) texts.push(text);
    });
    return texts.join('\n');
  }

  public summaryTextFor(key: CoinbaseKey): string | null {
    const price = this.prices[key];
    if (price === null) return null;

    const min = price.min.value.div('1e+6').toFixed(2);
    const max = price.max.value.div('1e+6').toFixed(2);

    const now = Date.now() / 1000;
    const minAge = ((now - Number(price.min.timestamp)) / 60).toFixed(0);
    const maxAge = ((now - Number(price.max.timestamp)) / 60).toFixed(0);

    return `*${key}:*\n\tmin: $${min} (${minAge} min ago)\n\tmax: $${max} (${maxAge} min ago)`;
  }

  public getPostableFormat(symbols: CTokenSymbol[], edges: ('min' | 'max')[]): IPostablePriceFormat | null {
    let didFindNull = false;

    const formatted: IPostablePriceFormat = {
      messages: [],
      signatures: [],
      symbols: [],
    };

    symbols.forEach((symbol, i) => {
      const key = cTokenCoinbaseKeys[symbol];
      if (key === null) return;

      const prices = this.prices[key];
      if (prices === null) {
        didFindNull = true;
        return;
      }

      const timestamp = prices[edges[i]].timestamp;
      const postableData = this.postableData[key][timestamp];

      formatted.messages.push(postableData.message);
      formatted.signatures.push(postableData.signature);
      formatted.symbols.push(postableData.key); // should equal local `key`
    });

    if (didFindNull) return null;
    return formatted;
  }

  public getPrices(symbol: CTokenSymbol): { min: Big | null; max: Big | null } {
    switch (symbol) {
      case 'cBAT':
        return {
          min: this.prices.BAT?.min.value || null,
          max: this.prices.BAT?.max.value || null,
        };
      case 'cCOMP':
        return {
          min: this.prices.COMP?.min.value || null,
          max: this.prices.COMP?.max.value || null,
        };
      case 'cDAI':
        return {
          min: this.prices.DAI?.min.value || null,
          max: this.prices.DAI?.max.value || null,
        };
      case 'cETH':
        return {
          min: this.prices.ETH?.min.value || null,
          max: this.prices.ETH?.max.value || null,
        };
      case 'cREP':
        return {
          min: this.prices.REP?.min.value || null,
          max: this.prices.REP?.max.value || null,
        };
      case 'cSAI':
        return {
          min: this.prices.ETH?.min.value.mul(SAI_PER_ETH) || null,
          max: this.prices.ETH?.max.value.mul(SAI_PER_ETH) || null,
        };
      case 'cUNI':
        return {
          min: this.prices.UNI?.min.value || null,
          max: this.prices.UNI?.max.value || null,
        };
      case 'cUSDC':
      case 'cUSDT':
        return {
          min: USD_VALUE,
          max: USD_VALUE,
        };
      case 'cWBTC':
      case 'cWBTC2':
        return {
          min: this.prices.BTC?.min.value || null,
          max: this.prices.BTC?.max.value || null,
        };
      case 'cZRX':
        return {
          min: this.prices.ZRX?.min.value || null,
          max: this.prices.ZRX?.max.value || null,
        };
    }
  }

  public append(key: CoinbaseKey, price: IPrice, message: string, signature: string): boolean {
    // Check to make sure price is actually new
    const len = this.priceHistories[key].length;
    if (len > 0 && this.priceHistories[key][len - 1].timestamp === price.timestamp) return false;

    this.priceHistories[key].push(price);
    this.postableData[key][price.timestamp!] = {
      key: key,
      message: message,
      signature: signature,
    };

    return this.updateMinMax(key, price);
  }

  private updateMinMax(key: CoinbaseKey, price: IPrice): boolean {
    let didUpdate = false;

    const priceOld = this.prices[key];
    if (priceOld === null) {
      this.prices[key] = {
        min: price,
        max: price,
      };
      didUpdate = true;
    } else if (price.value.lte(priceOld.min.value)) {
      this.prices[key]!.min = price;
      didUpdate = true;
    } else if (price.value.gte(priceOld.max.value)) {
      this.prices[key]!.max = price;
      didUpdate = true;
    }

    return didUpdate;
  }

  private resetPrices(key: CoinbaseKey, maskToTimestamp: string): void {
    this.prices[key] = null;
    this.priceHistories[key].forEach((price) => {
      if (Number(price.timestamp) < Number(maskToTimestamp)) return;
      this.updateMinMax(key, price);
    });
  }

  public cleanHistory(key: CoinbaseKey, delToTimestamp: string, maskToTimestamp: string): void {
    let i: number;
    for (i = 0; i < this.priceHistories[key].length; i += 1) {
      const ts = this.priceHistories[key][i].timestamp;
      if (Number(ts) >= Number(delToTimestamp)) break;

      delete this.postableData[key][delToTimestamp];
    }
    this.priceHistories[key].splice(0, i);

    this.resetPrices(key, maskToTimestamp);
  }
}

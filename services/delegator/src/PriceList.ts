import { CoinbaseKey } from './types/CoinbaseKeys';
import IPrice from './types/IPrice';
import IPriceRange from './types/IPriceRange';

interface PostableDatum {
  key: CoinbaseKey;
  message: string;
  signature: string;
}

type TimestampMap = { [i: string]: PostableDatum };

export default class PriceList {
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

  private resetPrices(key: CoinbaseKey): void {
    this.prices[key] = null;
    this.priceHistories[key].forEach((price) => this.updateMinMax(key, price));
  }

  private trimHistoryUpTo(key: CoinbaseKey, timestamp: string): void {
    let i: number;
    for (i = 0; i < this.priceHistories[key].length; i += 1) {
      const ts = this.priceHistories[key][i].timestamp;
      if (Number(ts) >= Number(timestamp)) break;

      delete this.postableData[key][timestamp];
    }
    this.priceHistories[key].splice(0, i);

    this.resetPrices(key);
  }
}

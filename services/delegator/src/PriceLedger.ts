import { Big } from '@goldenagellc/web3-blocks';

import { CoinbaseKey } from './types/CoinbaseKeys';
import IPrice from './types/IPrice';
import IPriceRange from './types/IPriceRange';

interface PostableDatum {
  key: CoinbaseKey;
  message: string;
  signature: string;
}

type TimestampMap = { [i: string]: PostableDatum };

const USD_VALUE: Big = Big('1000000');
const SAI_PER_ETH = 0.005285;

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

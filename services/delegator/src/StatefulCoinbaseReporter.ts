import nfetch, { FetchError } from 'node-fetch';

import { Big } from '@goldenagellc/web3-blocks';

import CoinbaseReporter from './CoinbaseReporter';
import { CoinbaseKey, coinbaseKeyMap } from './types/CoinbaseKeys';
import { CTokens, CTokenSymbol, cTokenSymbols } from './types/CTokens';

interface PostableDatum {
  key: CoinbaseKey;
  message: string;
  signature: string;
}

type TimestampMap = { [i: string]: PostableDatum };

interface Price {
  value: Big;
  timestamp: string;
}

interface PriceRange {
  min: Price;
  max: Price;
}

const UPDATE_FREQUENCY = 120000;
const USD_VALUE: Big = Big('1000000');
const SAI_PER_ETH = 0.005285;

export default class StatefulCoinbaseReporter extends CoinbaseReporter {
  private readonly prices: { [_ in CoinbaseKey]: PriceRange | null } = {
    BAT: null,
    COMP: null,
    DAI: null,
    ETH: null,
    REP: null,
    UNI: null,
    BTC: null,
    ZRX: null,
  };
  private readonly priceHistories: { readonly [_ in CoinbaseKey]: Price[] } = {
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

  public async init(): Promise<void> {
    await this.update();
    setInterval(this.update.bind(this), UPDATE_FREQUENCY);
  }

  private async update(): Promise<void> {
    const updatedKeys = await this.fetch();

    updatedKeys.forEach((key) => {
      const min = this.prices[key]!.min.value.div('1e+6').toFixed(2);
      const max = this.prices[key]!.max.value.div('1e+6').toFixed(2);
      const timespan = Math.abs(Number(this.prices[key]!.max.timestamp) - Number(this.prices[key]!.min.timestamp));
      console.log(`${key} | $${min} <-> $${max} over the past ${(timespan / 3600).toFixed(2)} hours`);
    });

    // TODO: trigger callbacks
  }

  private async fetch(): Promise<CoinbaseKey[]> {
    try {
      const updatedKeys: CoinbaseKey[] = [];

      const report = await this.fetchCoinbasePrices();
      for (let i = 0; i < report.messages.length; i += 1) {
        const message = report.messages[i];
        const signature = report.signatures[i];
        const { timestamp, key, price: value } = StatefulCoinbaseReporter.decode(message);

        // Skip if symbol is unknown
        if (!Object.keys(coinbaseKeyMap).includes(key)) continue;
        const knownKey = key as CoinbaseKey;

        // Skip if price has already been stored
        const len = this.priceHistories[knownKey].length;
        if (len > 0 && this.priceHistories[knownKey][len - 1].timestamp === timestamp) continue;

        // Store
        const price: Price = { value: Big(value), timestamp: timestamp };
        this.store(knownKey, price, message, signature);
        if (this.updatePrices(knownKey, price)) updatedKeys.push(knownKey);
      }
      return updatedKeys;
    } catch (e) {
      if (e instanceof FetchError) console.log('Coinbase fetch failed. Connection probably timed out');
      else console.log(e);
      return [];
    }
  }

  private store(key: CoinbaseKey, price: Price, message: string, signature: string): void {
    this.priceHistories[key].push(price);
    this.postableData[key][price.timestamp!] = {
      key: key,
      message: message,
      signature: signature,
    };
  }

  private updatePrices(key: CoinbaseKey, price: Price): boolean {
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
    this.priceHistories[key].forEach((price) => this.updatePrices(key, price));
  }

  private trimHistoryUpToAndIncluding(key: CoinbaseKey, timestamp: string): void {
    let i: number;
    for (i = 0; i < this.priceHistories[key].length; i += 1) {
      const ts = this.priceHistories[key][i].timestamp;
      if (Number(ts) > Number(timestamp)) break;

      delete this.postableData[key][timestamp];
    }
    this.priceHistories[key].splice(0, i);

    this.resetPrices(key);
  }
}

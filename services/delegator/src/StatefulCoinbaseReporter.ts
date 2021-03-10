import { FetchError } from 'node-fetch';

import { Big } from '@goldenagellc/web3-blocks';

import CoinbaseReporter from './CoinbaseReporter';
import { CoinbaseKey, coinbaseKeyMap } from './types/CoinbaseKeys';
import IPrice from './types/IPrice';
import IPriceRange from './types/IPriceRange';
import PriceList from './PriceList';

interface PostableDatum {
  key: CoinbaseKey;
  message: string;
  signature: string;
}

type TimestampMap = { [i: string]: PostableDatum };

const UPDATE_FREQUENCY = 120000;
const USD_VALUE: Big = Big('1000000');
const SAI_PER_ETH = 0.005285;

export default class StatefulCoinbaseReporter extends CoinbaseReporter {
  private readonly bag: PriceList;
  private readonly fetchInterval: number;

  constructor(bag: PriceList, fetchInterval: number, coinbaseEndpoint: string, coinbaseKey: string, coinbaseSecret: string, coinbasePassphrase: string) {
    super(coinbaseEndpoint, coinbaseKey, coinbaseSecret, coinbasePassphrase);
    this.bag = bag;
    this.fetchInterval = fetchInterval;
  }

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

        // Store
        const price: IPrice = { value: Big(value), timestamp: timestamp };
        if (this.bag.append(knownKey, price, message, signature)) updatedKeys.push(knownKey);
      }
      return updatedKeys;
    } catch (e) {
      if (e instanceof FetchError) console.log('Coinbase fetch failed. Connection probably timed out');
      else console.log(e);
      return [];
    }
  }
}

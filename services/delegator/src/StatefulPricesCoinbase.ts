import { FetchError } from 'node-fetch';

import { Big } from '@goldenagellc/web3-blocks';

import { CoinbaseKey, coinbaseKeyMap } from './types/CoinbaseKeys';
import IPrice from './types/IPrice';
import CoinbaseReporter from './CoinbaseReporter';
import PriceLedger from './PriceLedger';

export default class StatefulCoinbaseReporter extends CoinbaseReporter {
  private readonly ledger: PriceLedger;
  private fetchHandle: NodeJS.Timeout | null = null;

  constructor(ledger: PriceLedger, coinbaseEndpoint: string, coinbaseKey: string, coinbaseSecret: string, coinbasePassphrase: string) {
    super(coinbaseEndpoint, coinbaseKey, coinbaseSecret, coinbasePassphrase);
    this.ledger = ledger;
  }

  public async init(fetchInterval = 120000): Promise<void> {
    await this.update();
    if (this.fetchHandle !== null) clearInterval(this.fetchHandle);
    this.fetchHandle = setInterval(this.update.bind(this), fetchInterval);
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
        if (this.ledger.append(knownKey, price, message, signature)) updatedKeys.push(knownKey);
      }
      return updatedKeys;
    } catch (e) {
      if (e instanceof FetchError) console.log('Coinbase fetch failed. Connection probably timed out');
      else console.log(e);
      return [];
    }
  }
}

import { FetchError } from 'node-fetch';

import { Big } from '@goldenagellc/web3-blocks';

import { CoinbaseKey, coinbaseKeyMap } from './types/CoinbaseKeys';
import IPrice from './types/IPrice';
import CoinbaseReporter from './CoinbaseReporter';
import PriceLedger from './PriceLedger';

export default class StatefulPricesCoinbase extends CoinbaseReporter {
  private readonly ledger: PriceLedger;
  private fetchHandle: NodeJS.Timeout | null = null;
  
  private consumers: (() => Promise<void> | void)[] = [];

  constructor(
    ledger: PriceLedger,
    coinbaseEndpoint: string,
    coinbaseKey: string,
    coinbaseSecret: string,
    coinbasePassphrase: string,
  ) {
    super(coinbaseEndpoint, coinbaseKey, coinbaseSecret, coinbasePassphrase);
    this.ledger = ledger;
  }

  public async init(fetchInterval = 120000): Promise<void> {
    await this.update();
    if (this.fetchHandle !== null) clearInterval(this.fetchHandle);
    this.fetchHandle = setInterval(this.update.bind(this), fetchInterval);
  }

  public register(consumer: () => Promise<void> | void): number {
    return this.consumers.push(consumer) - 1
  }

  public remove(consumerId: number): void {
    this.consumers.splice(consumerId, 1);
  }

  private async update(): Promise<void> {
    const updatedKeys = await this.fetch();
    if (updatedKeys.length > 0) {
      this.consumers.forEach((consumer) => consumer());
    }
  }

  private async fetch(): Promise<CoinbaseKey[]> {
    try {
      const updatedKeys: CoinbaseKey[] = [];

      const report = await this.fetchCoinbasePrices();
      if (report.message === 'request timestamp expired') {
        console.warn('Coinbase fetch failed -- request timestamp outdated');
        return [];
      }
      for (let i = 0; i < report.messages.length; i += 1) {
        const message = report.messages[i];
        const signature = report.signatures[i];
        const { timestamp, key, price: value } = StatefulPricesCoinbase.decode(message);

        // Skip if symbol is unknown
        if (!Object.keys(coinbaseKeyMap).includes(key)) continue;
        const knownKey = key as CoinbaseKey;

        // Store
        const price: IPrice = { value: new Big(value), timestamp: timestamp };
        if (this.ledger.append(knownKey, price, message, signature)) updatedKeys.push(knownKey);
      }
      return updatedKeys;
    } catch (e) {
      if (e instanceof FetchError) console.warn('Coinbase fetch failed -- probably lost internet');
      else console.warn(e);
      return [];
    }
  }

  public stop(): void {
    if (this.fetchHandle !== null) clearInterval(this.fetchHandle);
  }
}

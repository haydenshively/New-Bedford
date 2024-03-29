import { EventData } from 'web3-eth-contract';
import Web3 from 'web3';
import winston from 'winston';

import { Big } from '@goldenagellc/web3-blocks';

import { OpenOraclePriceData } from './contracts/OpenOraclePriceData';
import { UniswapAnchoredView } from './contracts/UniswapAnchoredView';
import { CoinbaseKey, coinbaseKeyMap } from './types/CoinbaseKeys';
import { CTokens, cTokenUnderlyingDecimals as decimals } from './types/CTokens';
import IPrice from './types/IPrice';
import PriceLedger from './PriceLedger';

interface IOnChainPrice extends IPrice {
  block: number;
  logIndex: number;
}

export default class StatefulPricesOnChain {
  private readonly provider: Web3;
  private readonly ledger: PriceLedger;
  private readonly openOraclePriceData: OpenOraclePriceData;
  private readonly uniswapAnchoredView: UniswapAnchoredView;

  private prices: { [_ in CoinbaseKey]: IOnChainPrice[] } = {
    BAT: [],
    COMP: [],
    DAI: [],
    ETH: [],
    REP: [],
    UNI: [],
    BTC: [],
    ZRX: [],
    LINK: [],
  };

  constructor(
    provider: Web3,
    ledger: PriceLedger,
    openOraclePriceData: OpenOraclePriceData,
    uniswapAnchoredView: UniswapAnchoredView,
  ) {
    this.provider = provider;
    this.ledger = ledger;
    this.openOraclePriceData = openOraclePriceData;
    this.uniswapAnchoredView = uniswapAnchoredView;
  }

  public async init(): Promise<void> {
    const block = await this.provider.eth.getBlockNumber();
    await Promise.all(this.fetchPrices(block));

    this.subscribeToPrices(block);
  }

  private fetchPrices(block: number): Promise<void>[] {
    return Object.keys(coinbaseKeyMap).map(async (key) => {
      const knownKey = key as CoinbaseKey;
      const symbol = coinbaseKeyMap[knownKey];

      const price = await this.uniswapAnchoredView.getUnderlyingPrice(CTokens[symbol])(this.provider, block);
      this.prices[knownKey].push({
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
        const knownKey = ev.returnValues.key as CoinbaseKey;

        // Store the new price
        const newPrice = {
          value: new Big(ev.returnValues.value),
          timestamp: ev.returnValues.timestamp,
          block: ev.blockNumber,
          logIndex: ev.logIndex,
        };
        this.prices[knownKey].push(newPrice);
        // Sort in-place, most recent block first (in case events come out-of-order)
        this.prices[knownKey].sort((a, b) => b.block - a.block);
        // Assume chain won't reorder more than 12 blocks, and trim prices array accordingly...
        // BUT always maintain at least 2 items in the array (new price and 1 other price)
        // in case the new price gets removed from the chain later on (need fallback)
        const idx = this.prices[knownKey].findIndex((p) => newPrice.block - p.block > 12);
        if (idx !== -1) this.prices[knownKey].splice(Math.max(idx, 2));

        const summaryBefore = this.ledger.summaryTextFor(knownKey)?.replace(knownKey, 'Before');
        this.propogateToLedger(knownKey);
        const summaryAfter = this.ledger.summaryTextFor(knownKey)?.replace(knownKey, 'After');
        winston.info(`📈 ${knownKey} price posted to chain!\n${summaryBefore}\n${summaryAfter}`);
      })
      .on('changed', (ev: EventData) => {
        if (!Object.keys(coinbaseKeyMap).includes(ev.returnValues.key)) return;
        const knownKey = ev.returnValues.key as CoinbaseKey;

        const idx = this.prices[knownKey].findIndex((p) => p.block === ev.blockNumber && p.logIndex === ev.logIndex);
        if (idx !== -1) this.prices[knownKey].splice(idx, 1);

        const summaryBefore = this.ledger.summaryTextFor(knownKey)?.replace(knownKey, 'Before');
        this.propogateToLedger(knownKey);
        const summaryAfter = this.ledger.summaryTextFor(knownKey)?.replace(knownKey, 'After');
        winston.info(`⚠️ ${knownKey} price suffered chain reorganization!\n${summaryBefore}\n${summaryAfter}`);
      })
      .on('error', console.error);
  }

  private propogateToLedger(key: CoinbaseKey): void {
    const len = this.prices[key].length;
    const ledgerIsEmpty = this.ledger.cleanHistory(
      key,
      this.prices[key][len - 1].timestamp, // delete anything older than prices in oldest block
      this.prices[key][0].timestamp, // mask anything older than prices in newest block (don't delete; reorg possible)
    );

    if (ledgerIsEmpty)
      this.ledger.append(
        key,
        {
          value: this.prices[key][0].value,
          timestamp: '0',
        },
        '',
        '',
      );
  }
}

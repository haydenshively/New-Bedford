import { EventData } from 'web3-eth-contract';
import Web3 from 'web3';

import { Big } from '@goldenagellc/web3-blocks';

import { CTokenSymbol, cTokenSymbols } from './types/CTokens';
import { CToken } from './contracts/CToken';
import StatefulBorrower from './StatefulBorrower';
import StatefulComptroller from './StatefulComptroller';
import PriceLedger from './PriceLedger';
import ILiquidationCandidate from './types/ILiquidationCandidate';

export default class StatefulBorrowers {
  private readonly provider: Web3;
  private readonly cTokens: { [_ in CTokenSymbol]: CToken };

  private readonly borrowers: { [address: string]: StatefulBorrower } = {};
  private readonly borrowIndices: { -readonly [_ in CTokenSymbol]: Big } = {
    cBAT: new Big('0'),
    cCOMP: new Big('0'),
    cDAI: new Big('0'),
    cETH: new Big('0'),
    cREP: new Big('0'),
    cSAI: new Big('0'),
    cUNI: new Big('0'),
    cUSDC: new Big('0'),
    cUSDT: new Big('0'),
    cWBTC: new Big('0'),
    cWBTC2: new Big('0'),
    cZRX: new Big('0'),
  };

  constructor(provider: Web3, cTokens: { [_ in CTokenSymbol]: CToken }) {
    this.provider = provider;
    this.cTokens = cTokens;
  }

  public async init(): Promise<void> {
    const block = await this.provider.eth.getBlockNumber();
    await Promise.all(this.fetchBorrowIndices(block));
    this.subscribe(block);
  }

  public async push(addresses: string[]): Promise<void[]> {
    const block = await this.provider.eth.getBlockNumber();
    const promises = <Promise<void>[]>[];
    addresses.forEach((address) => {
      this.borrowers[address] = new StatefulBorrower(address, this.provider, this.cTokens);
      promises.push(...this.borrowers[address].fetchAll(block));
    });
    return Promise.all(promises);
  }

  public async scan(comptroller: StatefulComptroller, priceLedger: PriceLedger): Promise<ILiquidationCandidate[]> {
    const exchangeRateArray = await Promise.all(this.fetchExchangeRates());
    const exchangeRates = Object.fromEntries(cTokenSymbols.map((symbol, i) => [symbol, exchangeRateArray[i]])) as {
      [_ in CTokenSymbol]: Big;
    };

    const candidates: ILiquidationCandidate[] = [];

    Object.keys(this.borrowers).forEach((address) => {
      const borrower = this.borrowers[address];
      const info = borrower.expectedRevenue(comptroller, priceLedger, exchangeRates, this.borrowIndices);

      if (info !== null && info.health.lt('1')) {
        const postable = priceLedger.getPostableFormat(info.symbols, info.edges);
        if (postable === null) return;
        candidates.push({
          address: address,
          repayCToken: info.repayCToken,
          seizeCToken: info.seizeCToken,
          pricesToReport: postable,
          expectedRevenue: info.revenueETH.div('1e+6').toNumber(),
        });
      }
    });

    return candidates;
  }

  private fetchBorrowIndices(block: number): Promise<void>[] {
    return cTokenSymbols.map(async (symbol) => {
      this.borrowIndices[symbol] = await this.cTokens[symbol].borrowIndex()(this.provider, block);
    });
  }

  private fetchExchangeRates(): Promise<Big>[] {
    return cTokenSymbols.map((symbol) => this.cTokens[symbol].exchangeRateStored()(this.provider));
  }

  private subscribe(block: number): void {
    cTokenSymbols.forEach((symbol) => {
      const subscribeTo = this.cTokens[symbol].bindTo(this.provider).subscribeTo;

      const respondToMint = (ev: EventData) => {
        const minter: string = ev.returnValues.minter;
        if (minter in this.borrowers) this.borrowers[minter].onMint(ev);
      };
      const respondToRedeem = (ev: EventData) => {
        const redeemer: string = ev.returnValues.redeemer;
        if (redeemer in this.borrowers) this.borrowers[redeemer].onRedeem(ev);
      };
      const respondToBorrow = (ev: EventData) => {
        const borrower: string = ev.returnValues.borrower;
        if (borrower in this.borrowers) this.borrowers[borrower].onBorrow(ev);
      };
      const respondToRepay = (ev: EventData) => {
        const borrower: string = ev.returnValues.borrower;
        if (borrower in this.borrowers) this.borrowers[borrower].onRepayBorrow(ev);
      };
      const respondToLiquidate = (ev: EventData) => {
        const borrower: string = ev.returnValues.borrower;
        if (borrower in this.borrowers) this.borrowers[borrower].onLiquidateBorrow(ev);
      };
      const respondToTransfer = (ev: EventData) => {
        const from: string = ev.returnValues.from;
        if (from in this.borrowers) this.borrowers[from].onTransfer(ev);
        const to: string = ev.returnValues.to;
        if (to in this.borrowers) this.borrowers[to].onTransfer(ev);
      };

      subscribeTo.Mint(block).on('data', respondToMint).on('changed', respondToMint).on('error', console.error);
      subscribeTo.Redeem(block).on('data', respondToRedeem).on('changed', respondToRedeem).on('error', console.error);
      subscribeTo.Borrow(block).on('data', respondToBorrow).on('changed', respondToBorrow).on('error', console.error);
      subscribeTo
        .RepayBorrow(block)
        .on('data', respondToRepay)
        .on('changed', respondToRepay)
        .on('error', console.error);
      subscribeTo
        .LiquidateBorrow(block)
        .on('data', respondToLiquidate)
        .on('changed', respondToLiquidate)
        .on('error', console.error);
      subscribeTo
        .Transfer(block)
        .on('data', respondToTransfer)
        .on('changed', respondToTransfer)
        .on('error', console.error);
      subscribeTo
        .AccrueInterest(block)
        .on('data', (ev: EventData) => {
          this.borrowIndices[symbol] = new Big(ev.returnValues.borrowIndex);
        })
        .on('error', console.error);
    });
  }
}

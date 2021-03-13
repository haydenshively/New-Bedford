import { EventData } from 'web3-eth-contract';
import Web3 from 'web3';

import { Big } from '@goldenagellc/web3-blocks';

import { CTokenSymbol, cTokenSymbols } from './types/CTokens';
import { CToken } from './contracts/CToken';
import StatefulBorrower from './StatefulBorrower';

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

  public async push(addresses: string[]): Promise<void> {
    const block = await this.provider.eth.getBlockNumber();
    addresses.forEach((address) => {
      this.borrowers[address] = new StatefulBorrower(address, block);
      this.borrowers[address].init(this.provider, this.cTokens);
    });
  }

  public async randomCheck(): Promise<void> {
    const keys = Object.keys(this.borrowers);
    const borrower = this.borrowers[keys[(keys.length * Math.random()) << 0]];
    if (!borrower.didInit) {
      console.log(`${borrower.address} hasn't been initialized yet`);
    } else {
      const valid = await borrower.verify(this.provider, this.cTokens, this.borrowIndices, 0.01);
      if (!valid) console.log(`${borrower.address} has invalid state`);
    }
  }

  private fetchBorrowIndices(block: number): Promise<void>[] {
    return cTokenSymbols.map(async (symbol) => {
      this.borrowIndices[symbol] = await this.cTokens[symbol].borrowIndex()(this.provider, block);
    });
  }

  private subscribe(block: number): void {
    cTokenSymbols.forEach((symbol) => {
      const subscribeTo = this.cTokens[symbol].bindTo(this.provider).subscribeTo;

      subscribeTo
        .AccrueInterest(block)
        .on('data', (ev: EventData) => {
          this.borrowIndices[symbol] = new Big(ev.returnValues.borrowIndex);
        })
        .on('error', console.log);

      subscribeTo
        .Mint(block)
        .on('data', (ev: EventData) => {
          const minter: string = ev.returnValues.minter;
          if (minter in this.borrowers) this.borrowers[minter].onMint(ev);
        })
        .on('changed', (ev: EventData) => {
          const minter: string = ev.returnValues.minter;
          if (minter in this.borrowers) this.borrowers[minter].onMint(ev, true);
        })
        .on('error', console.log);

      subscribeTo
        .Redeem(block)
        .on('data', (ev: EventData) => {
          const redeemer: string = ev.returnValues.redeemer;
          if (redeemer in this.borrowers) this.borrowers[redeemer].onRedeem(ev);
        })
        .on('changed', (ev: EventData) => {
          const redeemer: string = ev.returnValues.redeemer;
          if (redeemer in this.borrowers) this.borrowers[redeemer].onRedeem(ev, true);
        })
        .on('error', console.log);

      subscribeTo
        .Borrow(block)
        .on('data', (ev: EventData) => {
          const borrower: string = ev.returnValues.borrower;
          if (borrower in this.borrowers) this.borrowers[borrower].onBorrow(ev, false, this.borrowIndices[symbol]);
        })
        .on('changed', (ev: EventData) => {
          const borrower: string = ev.returnValues.borrower;
          if (borrower in this.borrowers) this.borrowers[borrower].onBorrow(ev, true, this.borrowIndices[symbol]);
        })
        .on('error', console.log);

      subscribeTo
        .RepayBorrow(block)
        .on('data', (ev: EventData) => {
          const borrower: string = ev.returnValues.borrower;
          if (borrower in this.borrowers) this.borrowers[borrower].onRepayBorrow(ev, false, this.borrowIndices[symbol]);
        })
        .on('changed', (ev: EventData) => {
          const borrower: string = ev.returnValues.borrower;
          if (borrower in this.borrowers) this.borrowers[borrower].onRepayBorrow(ev, true, this.borrowIndices[symbol]);
        })
        .on('error', console.log);

      subscribeTo
        .LiquidateBorrow(block)
        .on('data', (ev: EventData) => {
          const borrower: string = ev.returnValues.borrower;
          if (borrower in this.borrowers) this.borrowers[borrower].onLiquidateBorrow(ev);
        })
        .on('changed', (ev: EventData) => {
          const borrower: string = ev.returnValues.borrower;
          if (borrower in this.borrowers) this.borrowers[borrower].onLiquidateBorrow(ev, true);
        })
        .on('error', console.log);

      subscribeTo
        .Transfer(block)
        .on('data', (ev: EventData) => {
          const from: string = ev.returnValues.from;
          if (from in this.borrowers) this.borrowers[from].onTransfer(ev);
          const to: string = ev.returnValues.to;
          if (to in this.borrowers) this.borrowers[to].onTransfer(ev);
        })
        .on('changed', (ev: EventData) => {
          const from: string = ev.returnValues.from;
          if (from in this.borrowers) this.borrowers[from].onTransfer(ev, true);
          const to: string = ev.returnValues.to;
          if (to in this.borrowers) this.borrowers[to].onTransfer(ev, true);
        })
        .on('error', console.log);
    });
  }
}

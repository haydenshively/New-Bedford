import { CTokenSymbol, cTokenSymbols } from './types/CTokens';
import { EventData } from 'web3-eth-contract';
import Web3 from 'web3';
import { CToken } from './contracts/CToken';
import Borrower from './Borrower';
import { Big } from '@goldenagellc/web3-blocks';

export default class StatefulBorrowers {
  private readonly provider: Web3;
  private readonly cTokens: { [_ in CTokenSymbol]: CToken };

  private readonly borrowers: { [address: string]: Borrower } = {};
  private readonly borrowIndices: { -readonly [_ in CTokenSymbol]: Big } = {
    cBAT: Big('0'),
    cCOMP: Big('0'),
    cDAI: Big('0'),
    cETH: Big('0'),
    cREP: Big('0'),
    cSAI: Big('0'),
    cUNI: Big('0'),
    cUSDC: Big('0'),
    cUSDT: Big('0'),
    cWBTC: Big('0'),
    cZRX: Big('0'),
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
          this.borrowIndices[symbol] = Big(ev.returnValues.borrowIndex);
        })
        .on('error', console.log);

      subscribeTo
        .Mint(block)
        .on('data', (ev: EventData) => {
          const minter: string = ev.returnValues.minter;
          if (!(minter in this.borrowers)) return;
          this.borrowers[minter].onMint(ev);
        })
        .on('changed', (ev: EventData) => {
          const minter: string = ev.returnValues.minter;
          if (!(minter in this.borrowers)) return;
          this.borrowers[minter].onMint(ev, true);
        })
        .on('error', console.log);

      subscribeTo
        .Redeem(block)
        .on('data', (ev: EventData) => {
          const redeemer: string = ev.returnValues.redeemer;
          if (!(redeemer in this.borrowers)) return;
          this.borrowers[redeemer].onRedeem(ev);
        })
        .on('changed', (ev: EventData) => {
          const redeemer: string = ev.returnValues.redeemer;
          if (!(redeemer in this.borrowers)) return;
          this.borrowers[redeemer].onRedeem(ev, true);
        })
        .on('error', console.log);

      subscribeTo
        .Borrow(block)
        .on('data', (ev: EventData) => {
          const redeemer: string = ev.returnValues.redeemer;
          if (!(redeemer in this.borrowers)) return;
          this.borrowers[redeemer].onRedeem(ev);
        })
        .on('changed', (ev: EventData) => {
          const redeemer: string = ev.returnValues.redeemer;
          if (!(redeemer in this.borrowers)) return;
          this.borrowers[redeemer].onRedeem(ev, true);
        })
        .on('error', console.log);
    });
  }
}

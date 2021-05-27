import { EventData } from 'web3-eth-contract';
import Web3 from 'web3';

import { Big } from '@goldenagellc/web3-blocks';

import { Comptroller } from './contracts/Comptroller';
import { CTokens, CTokenSymbol, cTokenSymbols } from './types/CTokens';

interface BlockchainNumber {
  value: Big;
  block: number;
  logIndex: number;
}

export default class StatefulComptroller {
  private readonly provider: Web3;
  private readonly comptroller: Comptroller;

  private closeFactor: BlockchainNumber | null = null;
  private liquidationIncentive: BlockchainNumber | null = null;
  private collateralFactors: { -readonly [_ in CTokenSymbol]: BlockchainNumber | null } = {
    cBAT: null,
    cCOMP: null,
    cDAI: null,
    cETH: null,
    cREP: null,
    cSAI: null,
    cUNI: null,
    cUSDC: null,
    cUSDT: null,
    cLINK: null,
    cTUSD: null,
    cWBTC: null,
    cWBTC2: null,
    cZRX: null,
  };

  constructor(provider: Web3, comptroller: Comptroller) {
    this.provider = provider;
    this.comptroller = comptroller;
  }

  public async init(): Promise<void> {
    const block = await this.provider.eth.getBlockNumber();

    const promises: Promise<void>[] = [];
    promises.push(
      ...this.fetchCollateralFactors(block),
      this.fetchCloseFactor(block),
      this.fetchLiquidationIncentive(block),
    );
    await Promise.all(promises);

    this.subscribeToCloseFactor(block);
    this.subscribeToLiquidationIncentive(block);
    this.subscribeToCollateralFactors(block);
  }

  public getCloseFactor(): Big | null {
    return this.closeFactor?.value || null;
  }

  public getLiquidationIncentive(): Big | null {
    return this.liquidationIncentive?.value || null;
  }

  public getCollateralFactor(symbol: CTokenSymbol): Big | null {
    return this.collateralFactors[symbol]?.value || null;
  }

  private async fetchCloseFactor(block: number): Promise<void> {
    this.closeFactor = {
      value: await this.comptroller.closeFactor()(this.provider, block),
      block: block,
      logIndex: 0,
    };
  }

  private async fetchLiquidationIncentive(block: number): Promise<void> {
    this.liquidationIncentive = {
      value: await this.comptroller.liquidationIncentive()(this.provider, block),
      block: block,
      logIndex: 0,
    };
  }

  private fetchCollateralFactors(block: number): Promise<void>[] {
    return cTokenSymbols.map(async (symbol) => {
      this.collateralFactors[symbol] = {
        value: await this.comptroller.collateralFactorOf(CTokens[symbol])(this.provider, block),
        block: block,
        logIndex: 0,
      };
    });
  }

  private static shouldAllowData(ev: EventData, prop: BlockchainNumber): boolean {
    return ev.blockNumber > prop.block || (ev.blockNumber == prop.block && ev.logIndex > prop.logIndex);
  }

  private static shouldAllowDataChange(ev: EventData, prop: BlockchainNumber): boolean {
    return ev.blockNumber < prop.block || (ev.blockNumber == prop.block && ev.logIndex < prop.logIndex);
  }

  private subscribeToCloseFactor(block: number): void {
    this.comptroller
      .bindTo(this.provider)
      .subscribeTo.NewCloseFactor(block)
      .on('connected', (id: string) => {
        console.log(`StatefulComptroller: Bound close factor to ${id}`);
      })
      .on('data', (ev: EventData) => {
        if (!StatefulComptroller.shouldAllowData(ev, this.closeFactor!)) return;

        this.closeFactor = {
          value: new Big(ev.returnValues.newCloseFactorMantissa),
          block: ev.blockNumber,
          logIndex: ev.logIndex,
        };
      })
      .on('changed', (ev: EventData) => {
        if (!StatefulComptroller.shouldAllowDataChange(ev, this.closeFactor!)) return;

        this.closeFactor = {
          value: new Big(ev.returnValues.oldCloseFactorMantissa),
          block: ev.blockNumber,
          logIndex: ev.logIndex,
        };
      })
      .on('error', console.error);
  }

  private subscribeToLiquidationIncentive(block: number): void {
    this.comptroller
      .bindTo(this.provider)
      .subscribeTo.NewLiquidationIncentive(block)
      .on('connected', (id: string) => {
        console.log(`StatefulComptroller: Bound liquidation incentive to ${id}`);
      })
      .on('data', (ev: EventData) => {
        if (!StatefulComptroller.shouldAllowData(ev, this.liquidationIncentive!)) return;

        this.liquidationIncentive = {
          value: new Big(ev.returnValues.newLiquidationIncentiveMantissa),
          block: ev.blockNumber,
          logIndex: ev.logIndex,
        };
      })
      .on('changed', (ev: EventData) => {
        if (!StatefulComptroller.shouldAllowDataChange(ev, this.liquidationIncentive!)) return;

        this.liquidationIncentive = {
          value: new Big(ev.returnValues.oldLiquidationIncentiveMantissa),
          block: ev.blockNumber,
          logIndex: ev.logIndex,
        };
      })
      .on('error', console.error);
  }

  private subscribeToCollateralFactors(block: number): void {
    this.comptroller
      .bindTo(this.provider)
      .subscribeTo.NewCollateralFactor(block)
      .on('connected', (id: string) => {
        console.log(`StatefulComptroller: Bound collateral factors to ${id}`);
      })
      .on('data', (ev: EventData) => {
        const address: string = ev.returnValues.cToken;

        cTokenSymbols.forEach((symbol) => {
          if (CTokens[symbol] === address) {
            const collateralFactor = this.collateralFactors[symbol]!;
            if (!StatefulComptroller.shouldAllowData(ev, collateralFactor)) return;

            collateralFactor.value = new Big(ev.returnValues.newCollateralFactorMantissa);
            collateralFactor.block = ev.blockNumber;
            collateralFactor.logIndex = ev.logIndex;
          }
        });
      })
      .on('changed', (ev: EventData) => {
        const address: string = ev.returnValues.cToken;

        cTokenSymbols.forEach((symbol) => {
          if (CTokens[symbol] === address) {
            const collateralFactor = this.collateralFactors[symbol]!;
            if (!StatefulComptroller.shouldAllowDataChange(ev, collateralFactor)) return;

            collateralFactor.value = new Big(ev.returnValues.oldCollateralFactorMantissa);
            collateralFactor.block = ev.blockNumber;
            collateralFactor.logIndex = ev.logIndex;
          }
        });
      })
      .on('error', console.error);
  }
}

import { EventEmitter } from 'events';
import { Contract as IWeb3Contract } from 'web3-eth-contract';
import { BlockNumber } from 'web3-core';
import Web3Utils from 'web3-utils';
import Web3 from 'web3';

import { Big, Contract } from '@goldenagellc/web3-blocks';

import { CTokens, CTokenCreationBlocks } from '../types/CTokens';
import { CTokenEvents } from '../types/CTokenEvents';

import abiEth from './abis/cether.json';
import abiV1 from './abis/ctokenv1.json';
import abiV2 from './abis/ctokenv2.json';

type ProviderlessWeb3Caller<T> = (provider: Web3, block?: string | undefined) => Promise<T>;

type InstanceMap<T> = { [d in keyof typeof CTokens]: T };
type SubscriptionMap = { [d in keyof typeof CTokenEvents]: (fromBlock: BlockNumber) => EventEmitter };

interface AccountSnapshot {
  error: string;
  cTokenBalance: Big;
  borrowBalance: Big;
  exchangeRate: Big;
}

interface ConnectedContract {
  subscribeTo: SubscriptionMap;
}

export class CToken extends Contract {
  private readonly creationBlock: number;
  private readonly subscriptionMap: SubscriptionMap = {
    AccrueInterest: (fromBlock) => this.subscribeTo(CTokenEvents.AccrueInterest, fromBlock),
    Mint: (fromBlock) => this.subscribeTo(CTokenEvents.Mint, fromBlock),
    Redeem: (fromBlock) => this.subscribeTo(CTokenEvents.Redeem, fromBlock),
    Borrow: (fromBlock) => this.subscribeTo(CTokenEvents.Borrow, fromBlock),
    RepayBorrow: (fromBlock) => this.subscribeTo(CTokenEvents.RepayBorrow, fromBlock),
    LiquidateBorrow: (fromBlock) => this.subscribeTo(CTokenEvents.LiquidateBorrow, fromBlock),
    Transfer: (fromBlock) => this.subscribeTo(CTokenEvents.Transfer, fromBlock),
  };
  private connectedInner: IWeb3Contract | null = null;

  constructor(address: string, abi: any, creationBlock: number) {
    super(address, abi as Web3Utils.AbiItem[]);
    this.creationBlock = creationBlock;
  }

  public exchangeRateStored(): ProviderlessWeb3Caller<Big> {
    const method = this.inner.methods.exchangeRateStored();
    return this.callerForUint256(method);
  }

  public balanceOf(account: string): ProviderlessWeb3Caller<Big> {
    const method = this.inner.methods.balanceOf(account);
    return this.callerForUint256(method);
  }

  public borrowBalanceStored(account: string): ProviderlessWeb3Caller<Big> {
    const method = this.inner.methods.borrowBalanceStored(account);
    return this.callerForUint256(method);
  }

  public getAccountSnapshot(account: string): ProviderlessWeb3Caller<AccountSnapshot> {
    const method = this.inner.methods.getAccountSnapshot(account);
    return this.callerFor(method, ['uint256', 'uint256', 'uint256', 'uint256'], (x) => {
      return {
        error: x['0'],
        cTokenBalance: Big(x['1']),
        borrowBalance: Big(x['2']),
        exchangeRate: Big(x['3']),
      } as AccountSnapshot;
    });
  }

  public connectTo(provider: Web3): ConnectedContract {
    if (this.connectedInner === null) this.connectedInner = new provider.eth.Contract(this.abi, this.address);
    this.connectedInner.events.Borrow();
    return { subscribeTo: this.subscriptionMap };
  }

  private subscribeTo(event: CTokenEvents, fromBlock: BlockNumber): EventEmitter {
    return this.connectedInner!.events[event]({ fromBlock: fromBlock === 'earliest' ? this.creationBlock : fromBlock });
  }
}

const cTokens: InstanceMap<CToken> = {
  cBAT: new CToken(CTokens.cBAT, abiV1, CTokenCreationBlocks.cBAT),
  cCOMP: new CToken(CTokens.cCOMP, abiV2, CTokenCreationBlocks.cCOMP),
  cDAI: new CToken(CTokens.cDAI, abiV2, CTokenCreationBlocks.cDAI),
  cETH: new CToken(CTokens.cETH, abiEth, CTokenCreationBlocks.cETH),
  cREP: new CToken(CTokens.cREP, abiV1, CTokenCreationBlocks.cREP),
  cSAI: new CToken(CTokens.cSAI, abiV1, CTokenCreationBlocks.cSAI),
  cUNI: new CToken(CTokens.cUNI, abiV2, CTokenCreationBlocks.cUNI),
  cUSDC: new CToken(CTokens.cUSDC, abiV1, CTokenCreationBlocks.cUSDC),
  cUSDT: new CToken(CTokens.cUSDT, abiV2, CTokenCreationBlocks.cUSDT),
  cWBTC: new CToken(CTokens.cWBTC, abiV1, CTokenCreationBlocks.cWBTC),
  cZRX: new CToken(CTokens.cZRX, abiV1, CTokenCreationBlocks.cZRX),
};

export default cTokens;

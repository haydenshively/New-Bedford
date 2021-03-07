import { EventEmitter } from 'events';
import { Contract as IWeb3Contract } from 'web3-eth-contract';
import { BlockNumber } from 'web3-core';
import Web3Utils from 'web3-utils';
import Web3 from 'web3';

import { Big, Contract } from '@goldenagellc/web3-blocks';

import { CTokens } from '../types/CTokens';
import { ComptrollerEvents } from '../types/ComptrollerEvents';

import abi from './abis/comptroller.json';

type ProviderlessWeb3Caller<T> = (provider: Web3, block?: string | undefined) => Promise<T>;

type SubscriptionMap = { [d in keyof typeof ComptrollerEvents]: (fromBlock: BlockNumber) => EventEmitter };

interface ConnectedContract {
  subscribeTo: SubscriptionMap;
}

export class Comptroller extends Contract {
  private readonly creationBlock: number;
  private readonly subscriptionMap: SubscriptionMap = {
    MarketEntered: (fromBlock) => this.subscribeTo(ComptrollerEvents.MarketEntered, fromBlock),
    MarketExited: (fromBlock) => this.subscribeTo(ComptrollerEvents.MarketExited, fromBlock),
    MarketListed: (fromBlock) => this.subscribeTo(ComptrollerEvents.MarketListed, fromBlock),
    NewCloseFactor: (fromBlock) => this.subscribeTo(ComptrollerEvents.NewCloseFactor, fromBlock),
    NewCollateralFactor: (fromBlock) => this.subscribeTo(ComptrollerEvents.NewCollateralFactor, fromBlock),
    NewLiquidationIncentive: (fromBlock) => this.subscribeTo(ComptrollerEvents.NewLiquidationIncentive, fromBlock),
  };
  private connectedInner: IWeb3Contract | null = null;

  constructor(address: string, creationBlock: number) {
    super(address, abi as Web3Utils.AbiItem[]);
    this.creationBlock = creationBlock;
  }

  public closeFactor(): ProviderlessWeb3Caller<Big> {
    const method = this.inner.methods.closeFactorMantissa();
    return this.callerForUint256(method);
  }

  public liquidationIncentive(): ProviderlessWeb3Caller<Big> {
    const method = this.inner.methods.liquidationIncentiveMantissa();
    return this.callerForUint256(method);
  }

  public collateralFactorOf(cToken: CTokens): ProviderlessWeb3Caller<Big> {
    const method = this.inner.methods.markets(cToken);
    return this.callerFor(method, ['bool', 'uint256', 'bool'], (x) => Big(x['1']));
  }

  public getAssetsIn(account: string): ProviderlessWeb3Caller<string[]> {
    const method = this.inner.methods.getAssetsIn(account);
    return this.callerFor(method, ['address[]']);
  }

  public connectTo(provider: Web3): ConnectedContract {
    if (this.connectedInner === null) this.connectedInner = new provider.eth.Contract(this.abi, this.address);
    return { subscribeTo: this.subscriptionMap };
  }

  private subscribeTo(event: ComptrollerEvents, fromBlock: BlockNumber): EventEmitter {
    return this.connectedInner!.events[event]({ fromBlock: fromBlock === 'earliest' ? this.creationBlock : fromBlock });
  }
}

const comptroller = new Comptroller('0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B', 7710671);

export default comptroller;

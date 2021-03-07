import { EventEmitter } from 'events';
import { Contract as IWeb3Contract } from 'web3-eth-contract';
import { BlockNumber } from 'web3-core';
import Web3Utils from 'web3-utils';
import Web3 from 'web3';

import { Big, Contract } from '@goldenagellc/web3-blocks';

import { CTokens } from '../types/CTokens';
import { PriceFeedEvents } from '../types/PriceFeedEvents';

import abi from './abis/uniswapanchoredview.json';

type ProviderlessWeb3Caller<T> = (provider: Web3, block?: string | undefined) => Promise<T>;

type SubscriptionMap = { [d in keyof typeof PriceFeedEvents]: (fromBlock: BlockNumber) => EventEmitter };

interface ConnectedContract {
  subscribeTo: SubscriptionMap;
}

export class PriceFeed extends Contract {
  private readonly creationBlock: number;
  private readonly subscriptionMap: SubscriptionMap = {
    AnchorPriceUpdated: (fromBlock) => this.subscribeTo(PriceFeedEvents.AnchorPriceUpdated, fromBlock),
    PriceUpdated: (fromBlock) => this.subscribeTo(PriceFeedEvents.PriceUpdated, fromBlock),
    UniswapWindowUpdated: (fromBlock) => this.subscribeTo(PriceFeedEvents.UniswapWindowUpdated, fromBlock),
  };
  private connectedInner: IWeb3Contract | null = null;

  constructor(address: string, creationBlock: number) {
    super(address, abi as Web3Utils.AbiItem[]);
    this.creationBlock = creationBlock;
  }

  public anchorPeriod(): ProviderlessWeb3Caller<Big> {
    const method = this.inner.methods.anchorPeriod();
    return this.callerForUint256(method);
  }

  public lowerBoundAnchorRatio(): ProviderlessWeb3Caller<Big> {
    const method = this.inner.methods.lowerBoundAnchorRatio();
    return this.callerForUint256(method);
  }

  public upperBoundAnchorRatio(): ProviderlessWeb3Caller<Big> {
    const method = this.inner.methods.upperBoundAnchorRatio();
    return this.callerForUint256(method);
  }

  public getUnderlyingPrice(cToken: CTokens): ProviderlessWeb3Caller<Big> {
    const method = this.inner.methods.getUnderlyingPrice(cToken);
    return this.callerForUint256(method);
  }

  public connectTo(provider: Web3): ConnectedContract {
    if (this.connectedInner === null) this.connectedInner = new provider.eth.Contract(this.abi, this.address);
    return { subscribeTo: this.subscriptionMap };
  }

  private subscribeTo(event: PriceFeedEvents, fromBlock: BlockNumber): EventEmitter {
    return this.connectedInner!.events[event]({ fromBlock: fromBlock === 'earliest' ? this.creationBlock : fromBlock });
  }
}

const priceFeed = new PriceFeed('0x922018674c12a7F0D394ebEEf9B58F186CdE13c1', 10921522);

export default priceFeed;

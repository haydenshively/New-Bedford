import Web3Utils from 'web3-utils';

import { Big, BindableContract, ContractCaller } from '@goldenagellc/web3-blocks';

import { CTokens } from '../types/CTokens';

import abi from './abis/uniswapanchoredview.json';

export enum UniswapAnchoredViewEvents {
  AnchorPriceUpdated = 'AnchorPriceUpdated',
  PriceUpdated = 'PriceUpdated',
  UniswapWindowUpdated = 'UniswapWindowUpdated',
}

export class UniswapAnchoredView extends BindableContract<typeof UniswapAnchoredViewEvents> {
  constructor(address: string, creationBlock: number) {
    super(address, abi as Web3Utils.AbiItem[], UniswapAnchoredViewEvents, creationBlock);
  }

  public anchorPeriod(): ContractCaller<Big> {
    const method = this.inner.methods.anchorPeriod();
    return this.callerForUint256(method);
  }

  public lowerBoundAnchorRatio(): ContractCaller<Big> {
    const method = this.inner.methods.lowerBoundAnchorRatio();
    return this.callerForUint256(method);
  }

  public upperBoundAnchorRatio(): ContractCaller<Big> {
    const method = this.inner.methods.upperBoundAnchorRatio();
    return this.callerForUint256(method);
  }

  public getUnderlyingPrice(cToken: CTokens): ContractCaller<Big> {
    const method = this.inner.methods.getUnderlyingPrice(cToken);
    return this.callerForUint256(method);
  }
}

const uniswapAnchoredView = new UniswapAnchoredView('0x922018674c12a7F0D394ebEEf9B58F186CdE13c1', 10921522);

export default uniswapAnchoredView;

import { Eth } from 'web3-eth';

import IProviderGroupEth from './IProviderGroupEth';

export default interface IProviderGroup {
  // `eth` will have all methods from both IProviderGroupEth and Eth. Depending on
  // the implementation of IProviderGroupEth, there may be overlapping versions
  // of the same method, in which case a Proxy should be used to delegate calls
  // to the desired version.
  readonly eth: IProviderGroupEth & Eth;
}

import { chain as Chain } from 'web3-core';
import { Eth } from 'web3-eth';
import Web3 from 'web3';

import IConnectionSpec from './types/IConnectionSpec';
import IProviderGroup from './types/IProviderGroup';
import IProviderGroupEth, { IEthPartial } from './types/IProviderGroupEth';

import ProviderGroupEth from './ProviderGroupEth';
import { providersFor } from './Providers';

export default class ProviderGroup implements IProviderGroup {
  public readonly eth: IProviderGroupEth & Eth;

  constructor(...providers: Web3[]) {
    const partial = new ProviderGroupEth(...providers);
    this.eth = new Proxy(partial as IEthPartial, {
      get(target: IEthPartial, prop: keyof IEthPartial, _receiver: any) {
        if (Reflect.has(target, prop)) return Reflect.get(target, prop);
        return Reflect.get(providers[0].eth, prop);
      },
    }) as IProviderGroupEth & Eth;
  }

  static for(chain: Chain, specs: IConnectionSpec[]): ProviderGroup {
    return new ProviderGroup(...providersFor(chain, specs));
  }
}

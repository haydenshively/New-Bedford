import Web3Utils from 'web3-utils';
import Web3 from 'web3';

import { Big, Contract, ITx } from '@goldenagellc/web3-blocks';

import abi from './abis/treasury.json';

type ProviderlessWeb3Caller<T> = (provider: Web3, block?: string | undefined) => Promise<T>;

export class Treasury extends Contract {
  constructor(address: string) {
    super(address, abi as Web3Utils.AbiItem[]);
  }

  public caller(): ProviderlessWeb3Caller<string> {
    return this.storageAt('2', (x) => Web3Utils.toChecksumAddress(x.slice(-40)));
  }

  public callerAllowance(): ProviderlessWeb3Caller<string> {
    return this.storageAt('3', (x) => Web3Utils.hexToNumberString(x));
  }

  public liquidatorWrapper(): ProviderlessWeb3Caller<string> {
    const method = this.inner.methods.liquidatorWrapper();
    return this.callerFor(method, ['address'], (x) => x['0']);
  }

  public changeIdentity(newEOA: string, currentEOABalance: Big, gasPrice: Big): ITx {
    const gasLimit = new Big('400000');
    const maxTxFee = gasLimit.mul(gasPrice);

    const tx = this.txFor(this.inner.methods.changeIdentity(newEOA), gasLimit, gasPrice);
    const value = currentEOABalance.sub(maxTxFee);
    if (value.gt('0')) tx.value = Web3Utils.toHex(value.toFixed(0));
    return tx;
  }

  public refillCaller(currentEOA: string): ITx {
    return this.changeIdentity(currentEOA, new Big('0'), Big('0'));
  }
}

export enum Instances {
  // v1,
  // v2,
  // ...
  adam,
  latest,
}

type InstanceMap<T> = { [d in keyof typeof Instances]: T };

const treasuries: InstanceMap<Treasury> = {
  adam: new Treasury('0x6d21F25029A462B5aEEC2d4772de674fbD908d1e'),
  latest: new Treasury('0xbe11AC1a02DDfb6d8e8393218164f9Ece884fcE0'),
};

export default treasuries;

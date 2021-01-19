import Web3Utils from 'web3-utils';

import { Big, Contract } from '@goldenagellc/web3-blocks';

import abi from './abis/treasury.json';

export class Treasury extends Contract {
  constructor(address: string) {
    super(address, abi as Web3Utils.AbiItem[]);
  }

  public caller() {
    return this.storageAt('2', (x) => Web3Utils.toChecksumAddress(x.slice(-40)));
  }

  public callerAllowance() {
    return this.storageAt('3', (x) => Web3Utils.hexToNumberString(x));
  }

  public liquidatorWrapper() {
    const method = this.inner.methods.liquidatorWrapper();
    return this.callerFor(method, ['address'], (x) => x['0']);
  }

  public changeIdentity(newEOA: string, currentEOABalance: Big, gasPrice: Big) {
    const gasLimit = Big('400000');
    const maxTxFee = gasLimit.mul(gasPrice);

    const tx = this.txFor(this.inner.methods.changeIdentity(newEOA), gasLimit, gasPrice);
    tx.value = Web3Utils.toHex(currentEOABalance.sub(maxTxFee).toFixed(0));
    return tx;
  }

  public refillCaller(currentEOA: string) {
    return this.changeIdentity(currentEOA, Big('0'), Big('0'));
  }
}

export default new Treasury('0x6d21F25029A462B5aEEC2d4772de674fbD908d1e');

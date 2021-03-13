import Web3Utils from 'web3-utils';

import { Big, BindableContract, ContractCaller } from '@goldenagellc/web3-blocks';

import { CTokens } from '../types/CTokens';

import abi from './abis/comptroller.json';

export enum ComptrollerEvents {
  MarketEntered = 'MarketEntered',
  MarketExited = 'MarketExited',
  MarketListed = 'MarketListed',
  NewCloseFactor = 'NewCloseFactor',
  NewCollateralFactor = 'NewCollateralFactor',
  NewLiquidationIncentive = 'NewLiquidationIncentive',
}

export class Comptroller extends BindableContract<typeof ComptrollerEvents> {
  constructor(address: string, creationBlock: number) {
    super(address, abi as Web3Utils.AbiItem[], ComptrollerEvents, creationBlock);
  }

  public closeFactor(): ContractCaller<Big> {
    const method = this.inner.methods.closeFactorMantissa();
    return this.callerForUint256(method);
  }

  public liquidationIncentive(): ContractCaller<Big> {
    const method = this.inner.methods.liquidationIncentiveMantissa();
    return this.callerForUint256(method);
  }

  public collateralFactorOf(cToken: CTokens): ContractCaller<Big> {
    const method = this.inner.methods.markets(cToken);
    return this.callerFor<Big>(method, ['bool', 'uint256', 'bool'], (x) => new Big(x['1']));
  }

  public getAssetsIn(account: string): ContractCaller<string[]> {
    const method = this.inner.methods.getAssetsIn(account);
    return this.callerFor<string[]>(method, ['address[]'], (x) => x['0']);
  }
}

const comptroller = new Comptroller('0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B', 7710671);

export default comptroller;

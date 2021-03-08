import Web3Utils from 'web3-utils';

import { Big, BindableContract, ContractCaller } from '@goldenagellc/web3-blocks';

import { CTokens, CTokenCreationBlocks } from '../types/CTokens';

import abiEth from './abis/cether.json';
import abiV1 from './abis/ctokenv1.json';
import abiV2 from './abis/ctokenv2.json';

interface AccountSnapshot {
  error: string;
  cTokenBalance: Big;
  borrowBalance: Big;
  exchangeRate: Big;
}

export enum CTokenEvents {
  AccrueInterest = 'AccrueInterest',
  Mint = 'Mint',
  Redeem = 'Redeem',
  Borrow = 'Borrow',
  RepayBorrow = 'RepayBorrow',
  LiquidateBorrow = 'LiquidateBorrow',
  Transfer = 'Transfer',
}

export class CToken extends BindableContract<typeof CTokenEvents> {
  constructor(address: string, abi: any, creationBlock: number) {
    super(address, abi as Web3Utils.AbiItem[], CTokenEvents, creationBlock);
  }

  public exchangeRateStored(): ContractCaller<Big> {
    const method = this.inner.methods.exchangeRateStored();
    return this.callerForUint256(method);
  }

  public balanceOf(account: string): ContractCaller<Big> {
    const method = this.inner.methods.balanceOf(account);
    return this.callerForUint256(method);
  }

  public borrowBalanceStored(account: string): ContractCaller<Big> {
    const method = this.inner.methods.borrowBalanceStored(account);
    return this.callerForUint256(method);
  }

  public getAccountSnapshot(account: string): ContractCaller<AccountSnapshot> {
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
}

type InstanceMap<T> = { [d in keyof typeof CTokens]: T };

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

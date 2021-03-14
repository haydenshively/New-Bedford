import Web3Utils from 'web3-utils';

import { Big, BindableContract, ContractCaller } from '@goldenagellc/web3-blocks';

import { CTokens, CTokenSymbol, CTokenVersion, cTokenCreationBlocks, cTokenVersions } from '../types/CTokens';

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
  public readonly symbol: CTokenSymbol;
  public readonly version: CTokenVersion;

  constructor(symbol: CTokenSymbol) {
    let abi: Web3Utils.AbiItem[];
    switch (cTokenVersions[symbol]) {
      case CTokenVersion.V1:
        abi = abiV1 as Web3Utils.AbiItem[];
        break;
      case CTokenVersion.V2:
        abi = abiV2 as Web3Utils.AbiItem[];
        break;
      case CTokenVersion.ETH:
        abi = abiEth as Web3Utils.AbiItem[];
        break;
    }
    super(CTokens[symbol], abi, CTokenEvents, cTokenCreationBlocks[symbol]);
    this.symbol = symbol;
    this.version = cTokenVersions[symbol];
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

  public borrowIndex(): ContractCaller<Big> {
    const method = this.inner.methods.borrowIndex();
    return this.callerForUint256(method);
  }

  public getAccountSnapshot(account: string): ContractCaller<AccountSnapshot> {
    const method = this.inner.methods.getAccountSnapshot(account);
    return this.callerFor(method, ['uint256', 'uint256', 'uint256', 'uint256'], (x) => {
      return {
        error: x['0'],
        cTokenBalance: new Big(x['1']),
        borrowBalance: new Big(x['2']),
        exchangeRate: new Big(x['3']),
      } as AccountSnapshot;
    });
  }
}

type InstanceMap<T> = { [_ in CTokenSymbol]: T };

const cTokens: InstanceMap<CToken> = {
  cBAT: new CToken('cBAT'),
  cCOMP: new CToken('cCOMP'),
  cDAI: new CToken('cDAI'),
  cETH: new CToken('cETH'),
  cREP: new CToken('cREP'),
  cSAI: new CToken('cSAI'),
  cUNI: new CToken('cUNI'),
  cUSDC: new CToken('cUSDC'),
  cUSDT: new CToken('cUSDT'),
  cWBTC: new CToken('cWBTC'),
  cZRX: new CToken('cZRX'),
};

export default cTokens;

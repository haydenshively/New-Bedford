import Web3Utils from 'web3-utils';

import { Big, Contract } from '@goldenagellc/web3-blocks';

import { CTokens } from '../types/CTokens';

import abiEth from './abis/cether.json';
import abiV1 from './abis/ctokenv1.json';
import abiV2 from './abis/ctokenv2.json';

export class CToken extends Contract {
  constructor(address: string, abi: any) {
    super(address, abi as Web3Utils.AbiItem[]);
  }
}

type InstanceMap<T> = { [d in keyof typeof CTokens]: T };

const cTokens: InstanceMap<CToken> = {
  cBAT: new CToken(CTokens.cBAT, abiV1),
  cCOMP: new CToken(CTokens.cCOMP, abiV2),
  cDAI: new CToken(CTokens.cDAI, abiV2),
  cETH: new CToken(CTokens.cETH, abiEth),
  cREP: new CToken(CTokens.cREP, abiV1),
  cSAI: new CToken(CTokens.cSAI, abiV1),
  cUNI: new CToken(CTokens.cUNI, abiV2),
  cUSDC: new CToken(CTokens.cUSDC, abiV1),
  cUSDT: new CToken(CTokens.cUSDT, abiV2),
  cWBTC: new CToken(CTokens.cWBTC, abiV1),
  cZRX: new CToken(CTokens.cZRX, abiV1),
};

export default cTokens;

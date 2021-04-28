import Web3Utils from 'web3-utils';

import { Big, Contract, ITx } from '@goldenagellc/web3-blocks';

import abi from './abis/liquidator.json';

export class Liquidator extends Contract {
  static readonly gasLimit = new Big('2200000');

  constructor(address: string) {
    super(address, abi as Web3Utils.AbiItem[]);
  }

  public liquidate(
    messages: string[],
    signatures: string[],
    symbols: string[],
    borrower: string,
    repayCToken: string,
    seizeCToken: string,
    toMiner: number,
    chi = true,
  ): ITx {
    if (messages.length !== signatures.length || signatures.length !== symbols.length)
      throw new Error('When liquidating, messages, signatures, and symbols should have the same length');

    if (messages.length === 0) return this.liquidateS(borrower, repayCToken, seizeCToken, toMiner, chi);
    return this.liquidateSWithPrice(messages, signatures, symbols, borrower, repayCToken, seizeCToken, toMiner, chi);
  }

  private liquidateSWithPrice(
    messages: string[],
    signatures: string[],
    symbols: string[],
    borrower: string,
    repayCToken: string,
    seizeCToken: string,
    toMiner: number,
    chi = true,
  ) {
    const handle = chi ? this.inner.methods.liquidateSWithPriceChi : this.inner.methods.liquidateSWithPrice;
    const method = handle(messages, signatures, symbols, borrower, repayCToken, seizeCToken, toMiner.toFixed(0));

    return this.txFor(method, Liquidator.gasLimit);
  }

  private liquidateS(borrower: string, repayCToken: string, seizeCToken: string, toMiner: number, chi = true) {
    const handle = chi ? this.inner.methods.liquidateSChi : this.inner.methods.liquidateS;
    const method = handle(borrower, repayCToken, seizeCToken, toMiner.toFixed(0));

    return this.txFor(method, Liquidator.gasLimit);
  }
}

export enum Instances {
  // v1,
  // v2,
  // ...
  v1,
  latest,
}

type InstanceMap<T> = { [d in keyof typeof Instances]: T };

const liquidators: InstanceMap<Liquidator> = {
  v1: new Liquidator('0x0000000073aB64137E95dea458bAc6d7AA503636'),
  latest: new Liquidator('0x00000000000067afd7fa546d3f63d4e53cdb8fa4'),
};

export default liquidators;

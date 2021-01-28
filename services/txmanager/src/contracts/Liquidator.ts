import Web3Utils from 'web3-utils';

import { Big, Contract } from '@goldenagellc/web3-blocks';

import abi from './abis/liquidator.json';

export class Liquidator extends Contract {
  static readonly gasLimit = Big('2200000');

  constructor(address: string) {
    super(address, abi as Web3Utils.AbiItem[]);
  }

  public liquidate(
    messages: string[],
    signatures: string[],
    symbols: string[],
    borrowers: string[],
    repayCTokens: string[],
    seizeCTokens: string[],
    chi = true,
  ) {
    if (messages.length !== signatures.length || signatures.length !== symbols.length)
      throw new Error('When liquidating, messages, signatures, and symbols should have the same length');
    if (borrowers.length !== repayCTokens.length || repayCTokens.length !== seizeCTokens.length)
      throw new Error('When liquidating, borrowers, repayCTokens, and seizeCTokens should have the same length');

    if (messages.length === 0) {
      if (borrowers.length > 1) return this.liquidateSN(borrowers, repayCTokens, seizeCTokens, chi);
      return this.liquidateS(borrowers[0], repayCTokens[0], seizeCTokens[0], chi);
    }
    if (borrowers.length > 1)
      return this.liquidateSNWithPrice(messages, signatures, symbols, borrowers, repayCTokens, seizeCTokens, chi);
    return this.liquidateSWithPrice(messages, signatures, symbols, borrowers[0], repayCTokens[0], seizeCTokens[0], chi);
  }

  private liquidateSNWithPrice(
    messages: string[],
    signatures: string[],
    symbols: string[],
    borrowers: string[],
    repayCTokens: string[],
    seizeCTokens: string[],
    chi = true,
  ) {
    const cTokens = this.combineCTokens(repayCTokens, seizeCTokens);
    const handle = chi ? this.inner.methods.liquidateSNWithPriceChi : this.inner.methods.liquidateSNWithPrice;
    const method = handle(messages, signatures, symbols, borrowers, cTokens);

    // provide no more than 4400000 gas because we don't want to take up too much
    // of the block (miner's aren't fond of that)
    return this.txFor(method, Liquidator.gasLimit.mul(Math.min(borrowers.length, 2)));
  }

  private liquidateSWithPrice(
    messages: string[],
    signatures: string[],
    symbols: string[],
    borrower: string,
    repayCToken: string,
    seizeCToken: string,
    chi = true,
  ) {
    const handle = chi ? this.inner.methods.liquidateSWithPriceChi : this.inner.methods.liquidateSWithPrice;
    const method = handle(messages, signatures, symbols, borrower, repayCToken, seizeCToken);

    return this.txFor(method, Liquidator.gasLimit);
  }

  private liquidateSN(borrowers: string[], repayCTokens: string[], seizeCTokens: string[], chi = true) {
    const cTokens = this.combineCTokens(repayCTokens, seizeCTokens);
    const handle = chi ? this.inner.methods.liquidateSNChi : this.inner.methods.liquidateSN;
    const method = handle(borrowers, cTokens);

    // provide no more than 4400000 gas because we don't want to take up too much
    // of the block (miner's aren't fond of that)
    return this.txFor(method, Liquidator.gasLimit.mul(Math.min(borrowers.length, 2)));
  }

  private liquidateS(borrower: string, repayCToken: string, seizeCToken: string, chi = true) {
    const handle = chi ? this.inner.methods.liquidateSChi : this.inner.methods.liquidateS;
    const method = handle(borrower, repayCToken, seizeCToken);

    return this.txFor(method, Liquidator.gasLimit);
  }

  private combineCTokens(repay: string[], seize: string[]) {
    const cTokens = [];
    for (let i = 0; i < repay.length; i += 1) cTokens.push(repay[i], seize[i]);
    return cTokens;
  }
}

export enum Instances {
  // v1,
  // v2,
  // ...
  latest,
}

type InstanceMap<T> = { [d in keyof typeof Instances]: T };

const liquidators: InstanceMap<Liquidator> = {
  latest: new Liquidator('0x29FAe933BE0186605f0Aca29A2387AcDB9B5EECC'),
};

export default liquidators;

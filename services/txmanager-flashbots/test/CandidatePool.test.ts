import { expect } from 'chai';

import CandidatePool from '../src/CandidatePool';
import ILiquidationCandidate from '../src/types/ILiquidationCandidate';
import { CTokens } from '../src/types/CTokens';

class TestPool extends CandidatePool {
  public get size(): number {
    return this.candidates.length;
  }

  public get list(): ILiquidationCandidate[] {
    return this.candidates;
  }
}

describe('CandidatePool Test', function () {
  const candidatePool = new TestPool();
  const candidate1: ILiquidationCandidate = {
    address: '0x1234...',
    repayCToken: CTokens.cDAI,
    seizeCToken: CTokens.cCOMP,
    pricesToReport: {
      messages: ['0xabc'],
      signatures: ['signed by Coinbase'],
      symbols: ['DAI', 'COMP'],
    },
    expectedRevenue: 1.2,
  };
  const candidate2: ILiquidationCandidate = {
    address: '0x5678',
    repayCToken: CTokens.cETH,
    seizeCToken: CTokens.cWBTC,
    pricesToReport: {
      messages: [],
      signatures: [],
      symbols: [],
    },
    expectedRevenue: 0.2,
  };

  it('should add candidate', () => {
    candidatePool.addLiquidationCandidate(candidate1);
    expect(candidatePool.size).to.equal(1);
  });

  it('should update candidate', () => {
    candidate1.expectedRevenue = 1.3;
    candidatePool.addLiquidationCandidate(candidate1);
    expect(candidatePool.size).to.equal(1);
  });

  it('should sort candidates', () => {
    candidatePool.addLiquidationCandidate(candidate2);
    expect(candidatePool.size).to.equal(2);
    expect(candidatePool.list[0].address).to.equal(candidate1.address);
  });

  it('should sort candidates after update', () => {
    candidate2.expectedRevenue = 2.0;
    candidatePool.addLiquidationCandidate(candidate2);
    expect(candidatePool.size).to.equal(2);
    expect(candidatePool.list[0].address).to.equal(candidate2.address);
  })

  it('should remove candidates', () => {
    candidatePool.removeLiquidationCandidate(candidate1.address);
    expect(candidatePool.size).to.equal(1);

    candidatePool.removeLiquidationCandidate(candidate2.address);
    expect(candidatePool.size).to.equal(0);
  });

  it('should deal with non-existent candidate removal', () => {
    candidatePool.removeLiquidationCandidate('not there');
  });
});

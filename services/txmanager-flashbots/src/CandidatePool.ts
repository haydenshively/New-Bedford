import winston from 'winston';

import ILiquidationCandidate from './types/ILiquidationCandidate';

export default class CandidatePool {
  protected readonly candidates: ILiquidationCandidate[] = [];

  protected readonly candidateAddresses: Set<string> = new Set();

  protected get isActive(): boolean {
    return this.candidates.length !== 0;
  }

  public addLiquidationCandidate(candidate: ILiquidationCandidate): void {
    // Sanitize
    candidate.address = candidate.address.toLowerCase();
    // Insert
    if (!this.candidateAddresses.has(candidate.address)) {
      this.candidateAddresses.add(candidate.address);
      this.candidates.push(candidate);
      // Log
      winston.info(`🐳 MEV Added ${candidate.address.slice(0, 6)} for revenue of ${candidate.expectedRevenue} Eth`);
    } else {
      const idx = this.candidates.findIndex((c) => c.address === candidate.address);
      this.candidates[idx] = candidate;
    }
    // Sort
    this.sortCandidates();
  }

  public removeLiquidationCandidate(candidateAddress: string): void {
    // Sanitize
    candidateAddress = candidateAddress.toLowerCase();
    // Remove
    if (!this.candidateAddresses.delete(candidateAddress)) return;
    const idx = this.candidates.findIndex((c) => c.address === candidateAddress);
    this.candidates.splice(idx, 1);
    // Sort
    this.sortCandidates();
    // Log
    winston.info(`🧮 MEV Removed ${candidateAddress.slice(0, 6)}`);
  }

  // Descending insertion sort (candidates should never have more than ~10 elements)
  private sortCandidates() {
    for (let i = 1; i < this.candidates.length; i += 1) {
      const current = this.candidates[i];
      let j = i - 1;

      while (j >= 0 && this.candidates[j].expectedRevenue < current.expectedRevenue) {
        this.candidates[j + 1] = this.candidates[j];
        j -= 1;
      }

      this.candidates[j + 1] = current;
    }
  }
}

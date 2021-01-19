import { BlockTransactionString } from 'web3-eth';

function mean(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b) / arr.length;
}

function cutoff(arr: number[], percentile: number): number | null {
  if (arr.length === 0) return null;
  const idx = Math.floor(arr.length * (percentile / 100.0));
  return arr.sort((a, b) => a - b)[idx];
}

function trimTo(length: number, arr: number[]): void {
  if (arr.length > length) arr.splice(0, arr.length - length);
}

interface ITimedBlock {
  number?: number;
  hash?: string;
  tCollation?: Date;
  tReception?: Date;
  pending: { [key: string]: Date };
}

export default class LatencyWatchBase {
  private readonly maxArrLength: number;

  private readonly blockTimes: number[];

  private readonly blockLatencies: number[];

  private readonly approxCollationDurations: number[];

  private readonly txnLatencies: number[];

  private blockCurr: ITimedBlock;

  private blockPrev: ITimedBlock;

  private txnTests: { [key: string]: Date };

  constructor(maxArrLength = 100) {
    this.maxArrLength = maxArrLength;

    this.blockCurr = { pending: {} };
    this.blockPrev = { pending: {}, number: 0 };

    this.blockTimes = [];
    this.blockLatencies = [];
    this.approxCollationDurations = [];
    // Rather than hard coding these, should load
    // from txt file. Same goes for other values.
    this.txnLatencies = [100.5, 98, 117.5, 126];

    this.txnTests = {};
  }

  public get summaryText(): string {
    return `Block Time: ${Number(this.meanBlockTime) / 1000}\nBlock Latency: ${
      Number(this.meanBlockLatency) / 1000
    }\nCollation Duration: ${Number(this.meanApproxCollationDuration) / 1000}`;
  }

  public get blockNumber(): number {
    return Number(this.blockPrev.number);
  }

  public get meanBlockTime(): number | null {
    return mean(this.blockTimes);
  }

  public get meanBlockLatency(): number | null {
    return mean(this.blockLatencies);
  }

  public get meanApproxCollationDuration(): number | null {
    return mean(this.approxCollationDurations);
  }

  public get meanTxnLatency(): number | null {
    return mean(this.txnLatencies);
  }

  public blockTime(percentile: number): number | null {
    return cutoff(this.blockTimes, 100.0 - percentile);
  }

  public blockLatency(percentile: number): number | null {
    return cutoff(this.blockLatencies, percentile);
  }

  public approxCollationDuration(percentile: number): number | null {
    return cutoff(this.approxCollationDurations, 100.0 - percentile);
  }

  public txnLatency(percentile: number): number | null {
    return cutoff(this.txnLatencies, percentile);
  }

  public deadline(percentile: number, i = 0): number[] | null {
    const N = this.meanBlockTime;
    const L = this.blockLatency(percentile);
    const T = this.txnLatency(percentile);
    const d = this.meanApproxCollationDuration;

    if (N === null || L === null || T === null || d === null) return null;
    const D = d - T;

    const offset = N * i;
    // `start` corresponds to the time at which block collation
    // began from the miner's perspective
    if (this.blockPrev.tReception === undefined) return null;
    const start = this.blockPrev.tReception.getTime() - L + offset;
    // `start + D` is a prediction for when collation will end from
    // the miner's perspective. subtract T to get local perspective
    const end = start + D - T;

    return [start, end];
  }

  public nextDeadline(percentile: number, i = 0): number[] | null {
    const res = this.deadline(percentile, i);
    if (res === null) return null;

    if (res[1] - Date.now() > 0) return res;
    return this.nextDeadline(percentile, i + 1);
  }

  public blocksUntil(date: Date, percentile: number): number | null {
    const res = this.deadline(percentile, 0);
    if (res === null) return null;

    const diff = date.getTime() - res[1];
    const N = this.meanBlockTime;
    if (N === null) return null;

    return Math.ceil(diff / N);
  }

  public storeHash(hash: string): void {
    this.blockCurr.pending[hash] = new Date();
  }

  public storeBlock(block: BlockTransactionString): void {
    // Save block's identity
    this.blockCurr.number = block.number;
    this.blockCurr.hash = block.hash;

    // Save block's temporal data
    const t_collation = new Date(0);
    t_collation.setUTCSeconds(Number(block.timestamp));
    this.blockCurr.tCollation = t_collation;
    this.blockCurr.tReception = new Date();
  }

  public analyze(block: BlockTransactionString): void {
    if (this.blockPrev.tReception !== undefined) {
      // Number() and getTime() are equivalent, but using Number gets around TS complaints
      // about "possibly undefined"
      const l = this.blockPrev.tReception.getTime() - Number(this.blockCurr.tCollation);
      this.blockLatencies.push(l);
      const n = Number(this.blockCurr.tReception) - this.blockPrev.tReception.getTime();
      this.blockTimes.push(n);
    }

    if (this.blockTimes.length <= 3) return;

    const durations = [];

    for (const confirmedTxHash of block.transactions) {
      if (confirmedTxHash in this.blockCurr.pending) {
        // To get block latency later on:
        const c = this.blockCurr.pending[confirmedTxHash].getTime() - Number(this.blockCurr.tCollation);
        if (c === null || c === undefined) continue;
        durations.push(c);

        // To get txn latency:
        if (confirmedTxHash in this.txnTests) {
          const roundTrip =
            this.blockCurr.pending[confirmedTxHash].getTime() - this.txnTests[confirmedTxHash].getTime();
          this.txnLatencies.push(roundTrip / 2.0);

          delete this.txnTests[confirmedTxHash];
        }
      }
    }

    if (durations.length > 0) this.approxCollationDurations.push(Math.max(...durations));
  }

  public step(): void {
    this.blockPrev = { ...this.blockCurr };
    this.blockPrev.pending = {}; // Don't care about pending on previous block, just here for typing
    this.blockCurr = { pending: {} };

    trimTo(this.maxArrLength, this.blockTimes);
    trimTo(this.maxArrLength, this.blockLatencies);
    trimTo(this.maxArrLength, this.approxCollationDurations);
    trimTo(this.maxArrLength, this.txnLatencies);
  }
}

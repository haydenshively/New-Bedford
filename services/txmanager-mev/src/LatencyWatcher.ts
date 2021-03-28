import { BlockHeader } from 'web3-eth';
import Web3 from 'web3';

import IEthSubscriptionConsumer from './types/IEthSubscriptionConsumer';
import LatencyInterpreter from './LatencyInterpreter';

export default class LatencyWatcher implements IEthSubscriptionConsumer {
  public readonly interpreter: LatencyInterpreter;

  constructor(interpreter: LatencyInterpreter) {
    this.interpreter = interpreter;
  }

  public async onNewBlock(header: BlockHeader, provider: Web3): Promise<void> {
    if (header.number <= Number(this.interpreter.blockNumber)) return;

    // Fetch block before making any modifications to state
    // to avoid weird asynchronous data mismatches
    // NOTE: In case of conflicts, existing data wins
    const block = {
      ...(await provider.eth.getBlock(header.hash)),
      ...header,
    };

    this.interpreter.storeBlock(block);
    this.interpreter.analyze(block);
    this.interpreter.step();
  }

  public onNewTxHash(hash: string, _provider: Web3): void {
    this.interpreter.storeHash(hash);
  }
}

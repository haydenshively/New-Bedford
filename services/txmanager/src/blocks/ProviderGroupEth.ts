import { PromiEvent } from 'web3-core';
import { TransactionReceipt as ITxReceipt } from 'web3-eth';
import Web3 from 'web3';

import IProviderGroupEth from './types/IProviderGroupEth';

export default class ProviderGroupEth implements IProviderGroupEth {
  private readonly providers: Web3[];

  constructor(...providers: Web3[]) {
    this.providers = providers;
  }

  public clearSubscriptions(): void {
    // @ts-expect-error
    this.providers.forEach((p) => p.eth.clearSubscriptions());
  }

  public dispatchSignedTransaction(
    signedTx: string,
    mainConnectionIdx = 0,
    useAllConnections = true,
  ): PromiEvent<ITxReceipt> {
    if (useAllConnections) {
      const sentTxs = this.providers.map((provider) => provider.eth.sendSignedTransaction(signedTx));

      for (let i = 0; i < sentTxs.length; i += 1) {
        if (i === mainConnectionIdx) continue;
        sentTxs[i].on('error', (e: Error) => console.log(`${e.name} ${e.message}`));
      }
      return sentTxs[mainConnectionIdx];
    }

    return this.providers[mainConnectionIdx].eth.sendSignedTransaction(signedTx);
  }

  closeConnections(): void {
    this.providers.forEach((p) => {
      if (p.currentProvider === null) return;
      if (
        p.currentProvider.constructor.name === 'WebsocketProvider' ||
        p.currentProvider.constructor.name === 'IpcProvider'
      )
        try {
          // @ts-ignore: We already checked that type is valid
          p.currentProvider.connection.close();
        } catch {
          // @ts-ignore: We already checked that type is valid
          p.currentProvider.connection.destroy();
        }
    });
  }
}

import { BlockHeader } from 'web3-eth';
import Web3 from 'web3';
import IEthSubscriptionConsumer from './types/IEthSubscriptionConsumer';

export default class EthSubscriber {
  private readonly provider: Web3;
  private consumers: IEthSubscriptionConsumer[] = [];

  constructor(provider: Web3) {
    this.provider = provider;
  }

  public init(): void {
    this.provider.eth.subscribe('newBlockHeaders').on('data', (block) => this.onNewBlock(block));
    this.provider.eth.subscribe('pendingTransactions').on('data', (hash) => this.onNewTxHash(hash));
  }

  public register(consumer: IEthSubscriptionConsumer): number {
    return this.consumers.push(consumer) - 1;
  }

  public remove(consumerId: number): void {
    this.consumers.splice(consumerId, 1);
  }

  private onNewBlock(header: BlockHeader): void {
    this.consumers.forEach((consumer) => consumer.onNewBlock(header, this.provider));
  }

  private onNewTxHash(hash: string): void {
    this.consumers.forEach((consumer) => consumer.onNewTxHash(hash, this.provider));
  }
}

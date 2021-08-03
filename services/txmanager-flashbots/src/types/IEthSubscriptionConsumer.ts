import { BlockHeader } from 'web3-eth';
import Web3 from 'web3';

export default interface IEthSubscriptionConsumer {
  onNewBlock(header: BlockHeader, provider: Web3): void | Promise<void>;
  onNewTxHash(hash: string, provider: Web3): void | Promise<void>;
}

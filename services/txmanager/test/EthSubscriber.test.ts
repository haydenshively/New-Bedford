import { expect } from 'chai';
import Web3 from 'web3';
import { BlockHeader } from 'web3-eth';

import { providerFor } from '@goldenagellc/web3-blocks';
import EthSubscriber from '../src/EthSubscriber';
import IEthSubscriptionConsumer from '../src/types/IEthSubscriptionConsumer';

require('dotenv-safe').config({
  example: process.env.CI ? '.env.ci.example' : '.env.example',
});

class TestConsumer implements IEthSubscriptionConsumer {
  public didSeeBlock = false;
  public didSeeTx = false;

  onNewBlock(_header: BlockHeader, _provider: Web3): void | Promise<void> {
    this.didSeeBlock = true;
  }
  onNewTxHash(_hash: string, _provider: Web3): void | Promise<void> {
    this.didSeeTx = true;
  }
}

describe('EthSubscriber Test', function() {
  this.timeout(30000);

  let provider: Web3;
  let ethSubscriber: EthSubscriber;
  let consumer: TestConsumer;

  it('should initialize without error', () => {
    ethSubscriber.init();
  });

  it('should register consumer', () => {
    consumer = new TestConsumer();
    ethSubscriber.register(consumer);
  });

  it('should receive blocks and transactions', async () => {
    const res = await new Promise<boolean>((resolve) => {
      const check = () => {
        if (consumer.didSeeBlock && consumer.didSeeTx) resolve(true);
        else setTimeout(check, 500);
      };
      setTimeout(check, 500);
    });

    expect(res).to.be.true;
    // @ts-ignore
    provider.eth.clearSubscriptions();
  });

  it('should remove test consumer', () => {
    ethSubscriber.remove(0);
  });

  before(() => {
    provider = providerFor('mainnet', {
      type: 'WS_Infura',
      envKeyID: 'PROVIDER_INFURA_ID',
    });
    ethSubscriber = new EthSubscriber(provider);
  });

  after(() => {
    const connection = provider.currentProvider;
    if (
      connection !== null &&
      (connection.constructor.name === 'WebsocketProvider' || connection.constructor.name === 'IpcProvider')
    )
      try {
        // @ts-expect-error
        connection.connection.close();
      } catch {
        // @ts-expect-error
        connection.connection.destroy();
      }
  });
});

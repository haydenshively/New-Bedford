import { expect } from 'chai';

import ProviderGroup from '../../src/blocks/ProviderGroup';

require('dotenv-safe').config({
  example: process.env.CI ? '.env.ci.example' : '.env.example',
});

describe('ProviderGroup Test', () => {
  let provider: ProviderGroup;

  it('should construct', () => {
    provider = ProviderGroup.for('mainnet', [
      {
        type: 'WS_Infura',
        envKeyID: 'PROVIDER_INFURA_ID',
      },
      {
        type: 'WS_Alchemy',
        envKeyKey: 'PROVIDER_ALCHEMY_KEY',
      },
    ]);
  });

  it('should call Eth method by Proxy', async () => {
    const gasPrice = await provider.eth.getGasPrice();
    expect(Number(gasPrice)).to.be.greaterThan(1);
  });

  it('should call ProviderGroupEth method', () => {
    provider.eth.clearSubscriptions();
    provider.eth.closeConnections();
  });
});

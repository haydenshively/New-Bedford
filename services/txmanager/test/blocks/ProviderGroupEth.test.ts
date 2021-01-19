import { expect } from 'chai';

import { providersFor } from '../../src/blocks/Providers';
import ProviderGroupEth from '../../src/blocks/ProviderGroupEth';

require('dotenv-safe').config({
  example: process.env.CI ? '.env.ci.example' : '.env.example',
});

describe('ProviderGroupEth Test', () => {
  let providerEth: ProviderGroupEth;

  it('should construct', () => {
    providerEth = new ProviderGroupEth(
      ...providersFor('mainnet', [
        {
          type: 'WS_Infura',
          envKeyID: 'PROVIDER_INFURA_ID',
        },
        {
          type: 'WS_Alchemy',
          envKeyKey: 'PROVIDER_ALCHEMY_KEY',
        },
      ]),
    );
  });

  it('should clear subscriptions', () => {
    providerEth.clearSubscriptions();
  });

  it('should close connections', () => {
    providerEth.closeConnections();
  });
});

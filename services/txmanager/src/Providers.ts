const Web3 = require('web3');
const net = require('net');

import { EventEmitter } from 'events';
import IProviderSpec from './types/IProviderSpec';

const IPCProvider = (path: string) => {
  return new Web3(path, net);
};
const WSProvider = (path: string) => {
  return new Web3(path);
};
const HTTPProvider = (path: string) => {
  return new Web3(path);
};

/**
 *
 * @param chain the chain, e.g "mainnet"
 * @param spec see example below
 * @returns a Web3 provider
 *
 * @example
 * {
 *   type: "WS_Infura",
 *   envKeyID: "PROVIDER_INFURA_ID"
 * }
 */
export const ProviderFor = (chain: string, spec: IProviderSpec): any => {
  switch (spec.type) {
    case 'IPC':
      return IPCProvider(String(process.env[String(spec.envKeyPath)]));
    case 'WS_Infura':
      return WSProvider(`wss://${chain}.infura.io/ws/v3/${process.env[String(spec.envKeyID)]}`);
    case 'WS_Alchemy':
      return WSProvider(`wss://eth-${chain}.ws.alchemyapi.io/v2/${process.env[String(spec.envKeyKey)]}`);
    case 'HTTP_Infura':
      return HTTPProvider(`https://${chain}.infura.io/v3/${process.env[String(spec.envKeyID)]}`);
    case 'HTTP_Alchemy':
      return HTTPProvider(`https://eth-${chain}.alchemyapi.io/v2/${process.env[String(spec.envKeyKey)]}`);
  }
};

/**
 *
 * @param chain the chain, e.g "mainnet"
 * @param specs see example below
 * @returns Web3 providers for each spec
 *
 * @example
 * [
 *   {
 *     type: "WS_Infura",
 *     envKeyID: "PROVIDER_INFURA_ID"
 *   },
 *   {
 *     type: "WS_Alchemy",
 *     envKeyKey: "PROVIDER_ALCHEMY_KEY"
 *   }
 * ]
 */
const ProvidersFor = (chain: string, specs: IProviderSpec[]): any[] => {
  return specs.map((spec) => ProviderFor(chain, spec));
};

export class MultiSendProvider {
  [key: string]: any;

  public providers: any[];

  constructor(chain: string, specs: IProviderSpec[]) {
    this.providers = ProvidersFor(chain, specs);

    // Use proxy to match ordinary Web3 API
    return new Proxy(this, {
      get: function (target, prop, receiver) {
        if (prop === 'eth') return receiver;
        if (prop in target) return target[String(prop)];
        // fallback
        return target.providers[0].eth[prop];
      },
    });
  }

  call(tx: object, block: number): Promise<object> {
    return this.providers[0].eth.call(tx, block);
  }

  sendSignedTransaction(signedTx: string): EventEmitter {
    const sentTx = this.providers[0].eth.sendSignedTransaction(signedTx);
    for (let i = 1; i < this.providers.length; i++)
      this.providers[i].eth
        .sendSignedTransaction(signedTx)
        .on('error', (e: Error) => console.log(e.name + ' ' + e.message));
    return sentTx;
  }

  clearSubscriptions() {
    this.providers.forEach((p) => p.eth.clearSubscriptions());
  }

  // Double-underscore because this isn't part of the web3.eth namespace
  __close() {
    this.providers.forEach((p) => {
      try {
        p.currentProvider.connection.close();
      } catch {
        try {
          p.currentProvider.connection.destroy();
        } catch {
          console.log("Cannot close HTTP provider's connection");
        }
      }
    });
  }

  get currentProvider(): object {
    return { connection: { close: this.__close.bind(this) } };
  }
}

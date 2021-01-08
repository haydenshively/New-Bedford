import net from 'net';
import { chain, WebsocketProvider, IpcProvider } from 'web3-core';
import { Eth } from 'web3-eth';
import Web3 from 'web3';

import IProviderSpec from './types/IProviderSpec';

const IPCProvider = (path: string): Web3 => {
  return new Web3(new Web3.providers.IpcProvider(path, net));
};
const WSProvider = (path: string): Web3 => {
  return new Web3(new Web3.providers.WebsocketProvider(path));
};
const HTTPProvider = (path: string): Web3 => {
  return new Web3(new Web3.providers.HttpProvider(path));
};

/**
 *
 * @param chain the chain, e.g "mainnet"
 * @param spec see example below
 * @returns a Web3 instance
 *
 * @example
 * {
 *   type: "WS_Infura",
 *   envKeyID: "PROVIDER_INFURA_ID"
 * }
 */
export const ProviderFor = (chain: chain, spec: IProviderSpec): Web3 => {
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
    default:
      throw new Error(`Provider spec type ${spec.type} unknown`);
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
const ProvidersFor = (chain: chain, specs: IProviderSpec[]): Web3[] => {
  return specs.map((spec) => ProviderFor(chain, spec));
};

export class MultiSendProvider {
  public providers: Web3[];

  constructor(chain: chain, specs: IProviderSpec[]) {
    this.providers = ProvidersFor(chain, specs);

    // Use proxy to match ordinary Web3 API
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop === 'eth') return receiver;
        if (prop in target) return target[prop as keyof MultiSendProvider];
        // fallback
        return target.providers[0].eth[prop as keyof Eth];
      },
    });
  }

  call(tx: object, block: number) {
    return this.providers[0].eth.call(tx, block);
  }

  sendSignedTransaction(signedTx: string) {
    const sentTx = this.providers[0].eth.sendSignedTransaction(signedTx);
    for (let i = 1; i < this.providers.length; i += 1)
      this.providers[i].eth
        .sendSignedTransaction(signedTx)
        .on('error', (e: Error) => console.log(`${e.name} ${e.message}`));
    return sentTx;
  }

  clearSubscriptions(callback: (error: Error | undefined, result: boolean) => void): void {
    const promises = this.providers.map(
      (p) =>
        new Promise((resolve, reject) =>
          p.eth.clearSubscriptions((error, result) => {
            if (result) resolve(error);
            else reject(error);
          }),
        ),
    );

    Promise.all(promises).then(
      (_res) => callback(undefined, true),
      (res) => callback(res, false),
    );
  }

  // Double-underscore because this isn't part of the web3.eth namespace
  __close(): void {
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
          p.currentProvider.connection.destory();
        }
    });
  }

  get currentProvider() {
    return { connection: { close: this.__close.bind(this) } };
  }
}

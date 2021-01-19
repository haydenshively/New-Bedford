import net from 'net';
import { chain as Chain } from 'web3-core';
import Web3 from 'web3';

import IConnectionSpec from './types/IConnectionSpec';

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
export const providerFor = (chain: Chain, spec: IConnectionSpec): Web3 => {
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
export const providersFor = (chain: Chain, specs: IConnectionSpec[]): Web3[] => {
  return specs.map((spec) => providerFor(chain, spec));
};

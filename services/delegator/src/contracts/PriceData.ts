import Web3Utils from 'web3-utils';

import { BindableContract } from '@goldenagellc/web3-blocks';

import abi from './abis/openoraclepricedata.json';

export enum PriceDataEvents {
  Write = 'Write',
}

export class PriceData extends BindableContract<typeof PriceDataEvents> {
  constructor(address: string, creationBlock: number) {
    super(address, abi as Web3Utils.AbiItem[], PriceDataEvents, creationBlock);
  }
}

const priceData = new PriceData('0xc629C26dcED4277419CDe234012F8160A0278a79', 10551018);

export default priceData;

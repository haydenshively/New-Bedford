import Web3Utils from 'web3-utils';

import { BindableContract } from '@goldenagellc/web3-blocks';

import abi from './abis/openoraclepricedata.json';

export enum OpenOraclePriceDataEvents {
  Write = 'Write',
}

export class OpenOraclePriceData extends BindableContract<typeof OpenOraclePriceDataEvents> {
  constructor(address: string, creationBlock: number) {
    super(address, abi as Web3Utils.AbiItem[], OpenOraclePriceDataEvents, creationBlock);
  }
}

const openOraclePriceData = new OpenOraclePriceData('0xc629C26dcED4277419CDe234012F8160A0278a79', 10551018);

export default openOraclePriceData;

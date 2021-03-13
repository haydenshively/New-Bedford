import { Big } from '@goldenagellc/web3-blocks';

import { CTokenSymbol } from './CTokens';

export interface IBorrowerPosition {
  supply: Big;
  borrow: Big;
}

export default interface IBorrower {
  address: string;
  positions: { [_ in CTokenSymbol]: IBorrowerPosition };
}

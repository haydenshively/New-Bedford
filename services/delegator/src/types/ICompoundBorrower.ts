import { Big } from '@goldenagellc/web3-blocks';

import { CTokens } from './CTokens';

type CTokensMap<T> = { [d in keyof typeof CTokens]: T };

interface ICompoundPosition {
  supply: Big;
  borrow: Big;
}

export default interface ICompoundBorrower {
  address: string;
  balances: CTokensMap<ICompoundPosition>;
}

import { CTokenSymbol } from './CTokens';

export type CoinbaseKey = 'BAT' | 'COMP' | 'DAI' | 'ETH' | 'REP' | 'UNI' | 'BTC' | 'ZRX';

export const coinbaseKeyMap: { [i in CoinbaseKey]: CTokenSymbol } = {
  BAT: 'cBAT',
  COMP: 'cCOMP',
  DAI: 'cDAI',
  ETH: 'cETH',
  REP: 'cREP',
  UNI: 'cUNI',
  BTC: 'cWBTC',
  ZRX: 'cZRX',
};

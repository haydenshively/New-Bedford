import Big from 'big.js';

export default interface TxPlain {
  gasPrice: Big;
  gasLimit: Big;
  to: string;
  value: string | undefined;
  data: string | undefined;
}

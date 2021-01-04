import Big from 'big.js';

export default interface ITxPlain {
  gasPrice: Big;
  gasLimit: Big;
  to: string;
  value?: string;
  data?: string;
}

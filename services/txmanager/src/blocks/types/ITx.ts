import Big from 'big.js';

export default interface ITx {
  gasPrice: Big;
  gasLimit: Big;
  to: string;
  value?: string;
  data?: string;
}

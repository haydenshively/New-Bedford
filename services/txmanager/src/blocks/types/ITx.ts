import Big from './big';

export default interface ITx {
  gasPrice: Big;
  gasLimit: Big;
  to: string;
  value?: string;
  data?: string;
}

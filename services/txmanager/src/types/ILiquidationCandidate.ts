import IPostablePriceFormat from './IPostablePriceFormat';
import { CTokens } from './CTokens';

export default interface ILiquidationCandidate {
  address: string;
  repayCToken: CTokens;
  seizeCToken: CTokens;
  pricesToReport: IPostablePriceFormat;
  expectedRevenue: number;
}

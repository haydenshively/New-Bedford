import IOpenOraclePriceData from './IOpenOraclePriceData';
import { CTokens } from './CTokens';

export default interface ILiquidationCandidate {
  address: string;
  repayCToken: CTokens;
  seizeCToken: CTokens;
  pricesToReport: IOpenOraclePriceData;
  expectedRevenue: number;
}

import IOpenOraclePriceData from './IOpenOraclePriceData';
import { CTokens } from './CTokens';

export default interface LiquidationCandidate {
  address: string;
  repayCToken: CTokens;
  seizeCToken: CTokens;
  pricesToReport: IOpenOraclePriceData;
  expectedRevenue: number;
}

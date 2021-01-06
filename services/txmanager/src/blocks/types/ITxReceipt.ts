import ITxLog from './ITxLog';

export default interface ITxReceipt {
  status: boolean; // false if reverted
  blockHash: string; // 32 bytes
  blockNumber: number;
  transactionHash: string; // 32 bytes
  transactionIndex: number; // tx index position in the block
  from: string;
  to: string | null; // null if contract creation
  contractAddress: string | null; // null if normal tx
  cumulativeGasUsed: number; // gas used up until this tx in the block
  gasUsed: number; // gas used by this tx
  logs: ITxLog[];
};

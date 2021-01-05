export default interface ITxLog {
  address: string; // address from which this event originated
  data: string; // data containing non-indexed log parameter
  topics: string[]; // array with max 4 32 Byte topics, topic 1-3 contains indexed parameters
  logIndex: number; // log index position in the block
  blockHash: string;
  blockNumber: number;
  transactionHash: string; // tx index position in the block
  transactionIndex: number; // tx hash
}

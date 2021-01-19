import { PromiEvent, TransactionReceipt as ITxReceipt } from 'web3-core';
import { Eth } from 'web3-eth';

type Partial<T> = {
  [P in keyof T]?: T[P];
};

/**
 * Can implement any methods of the Eth interface, but doesn't have to
 */
export type IEthPartial = Partial<Eth>;

/**
 * Can implement any methods of the Eth interface, but doesn't have to.
 * *Must* implement the methods listed below.
 */
export default interface IProviderGroupEth extends IEthPartial {
  // MARK: Required overrides ----------------------------------
  /**
   * Clears subscriptions on *all* connections in the group
   */
  clearSubscriptions(): void;

  // MARK: Additional functionality ----------------------------
  /**
   * Closes *all* connections in the group
   */
  closeConnections(): void;

  /**
   * Sends a signed transaction via 1 or all connections in the group
   * @param signedTx the encoded transaction data to send
   * @param mainConnectionIdx index of the connection for which a PromiEvent
   *    should be returned. Indices are based on order of construction args
   * @param useAllConnections whether to send via all connections, or just the
   *    main one
   */
  dispatchSignedTransaction(
    signedTx: string,
    mainConnectionIdx?: number,
    useAllConnections?: boolean,
  ): PromiEvent<ITxReceipt>;
}

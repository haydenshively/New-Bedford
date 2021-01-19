import { PromiEvent, TransactionReceipt as ITxReceipt } from 'web3-core';

export const QueueSafePromiEvent = (inner: PromiEvent<ITxReceipt>): PromiEvent<ITxReceipt> => {
  return new Proxy(inner, {
    get(target: PromiEvent<ITxReceipt>, prop: keyof PromiEvent<ITxReceipt>, receiver: any) {
      if (prop === 'on' && (arguments[0] === 'receipt' || arguments[0] === 'error'))
        throw new Error(`Queue has ownership of the ${arguments[0]} listener. Please use callback`);
      return Reflect.get(target, prop, receiver);
    },
  });
};

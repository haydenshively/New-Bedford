import { sendUnaryData, ServerReadableStream, status } from '@grpc/grpc-js';

import { ITxManagerServer } from './proto/txmanager_grpc_pb';
import { LiquidateRequest, LiquidateReply, CancelCandidateRequest, CancelCandidateReply } from './proto/txmanager_pb';

import { ServiceError } from './util';

export default class TxManagerServer implements ITxManagerServer {
  // Unsure if needed, add if it doesn't compile/work right
  // [method: string]: UntypedHandleCall;

  public submitCandidates(
    call: ServerReadableStream<LiquidateRequest, LiquidateReply>,
    callback: sendUnaryData<LiquidateReply>,
  ): void {
    call
      .on('data', (req: LiquidateRequest) => {
        // Can interact with the event request here, delegating by event type, etc
        //
      })
      .on('end', () => {
        // Delegator has finished sending us content, or otherwise disconnected
        const res: LiquidateReply = new LiquidateReply();

        // Don't need to send content in event reply
        callback(null, res);
      })
      .on('error', (err: Error) => {
        // Error encountered in event stream
        callback(new ServiceError(status.INTERNAL, err.message), null);
      });
  }

  cancelCandidates(
    call: ServerReadableStream<CancelCandidateRequest, CancelCandidateReply>,
    callback: sendUnaryData<CancelCandidateReply>,
  ): void {
    call
      .on('data', (req: CancelCandidateRequest) => {
        // Can interact with the event request here, delegating by event type, etc
        //
      })
      .on('end', () => {
        // Delegator has finished sending us content, or otherwise disconnected
        const res: CancelCandidateReply = new CancelCandidateReply();

        // Don't need to send content in event reply
        callback(null, res);
      })
      .on('error', (err: Error) => {
        // Error encountered in event stream
        callback(new ServiceError(status.INTERNAL, err.message), null);
      });
  }
}

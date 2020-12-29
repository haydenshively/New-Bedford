import { sendUnaryData, ServerReadableStream, ServerUnaryCall, status, UntypedHandleCall } from '@grpc/grpc-js';

import { IWorkerServer } from './proto/worker_grpc_pb';
import { EventRequest, EventReply, StartRequest, StartReply } from './proto/worker_pb';

import { ServiceError } from './util';
import Worker from './Worker';

export default class WorkerServer implements IWorkerServer {
  [method: string]: UntypedHandleCall;

  public receiveEvent(call: ServerReadableStream<EventRequest, EventReply>, callback: sendUnaryData<EventReply>): void {
    call
      .on('data', (req: EventRequest) => {
        // Can interact with the event request here, delegating by event type, etc
        //
      })
      .on('end', () => {
        // Delegator has finished sending us content, or otherwise disconnected
        const res: EventReply = new EventReply();

        // Don't need to send content in event reply
        callback(null, res);
      })
      .on('error', (err: Error) => {
        // Error encountered in event stream
        callback(new ServiceError(status.INTERNAL, err.message), null);
      });
  }

  public start(call: ServerUnaryCall<StartRequest, StartReply>, callback: sendUnaryData<StartReply>): void {
    // const lastBlock: string = call.request.getDatabaseaccuratetoblock();
    // Interact with call data here

    const res: StartReply = new StartReply();
    callback(null, res);
  }
}

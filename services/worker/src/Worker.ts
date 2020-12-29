import { EventReply, EventRequest } from './proto/worker_pb';

/**
 * Implementation of one worker process
 * Decoupled from gRPC server logic, and presents a pure TS interface
 */
export default class Worker {
  public start(): void {}

  public receiveEvent(event: EventRequest): EventReply {
    return new EventReply();
  }
}

import { ClientWritableStream, credentials, Metadata, ServiceError } from '@grpc/grpc-js';

import { WorkerClient as GRPCWorkerClient } from './proto/worker_grpc_pb';
import { EventRequest, EventReply, StartRequest, StartReply } from './proto/worker_pb';

export default class WorkerClient {
  private readonly client: GRPCWorkerClient;

  // If the current event stream is closed, this is null, otherwise contains the client-writable stream for
  // sending events to the worker
  private eventStream: ClientWritableStream<EventRequest> | null;

  private streamEnd: { resolve: Resolve<EventReply> | null; reject: Reject | null };

  public constructor(address: string, port: number) {
    this.client = new GRPCWorkerClient(`${address}:${port}`, credentials.createInsecure());
    this.eventStream = null;
    this.streamEnd = { resolve: null, reject: null };
  }

  // Signal the worker to start handling events
  public async sendStart(
    param: StartRequest = new StartRequest(),
    metadata: Metadata = new Metadata(),
  ): Promise<StartReply> {
    return new Promise((resolve: Resolve<StartReply>, reject: Reject): void => {
      this.client.start(param, metadata, (err: ServiceError | null, res: StartReply) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(res);
      });
    });
  }

  public openStream(): void {
    if (this.eventStream || this.streamEnd) {
      throw new Error('WorkerClient: Stream already opened.');
    }

    this.eventStream = this.client.receiveEvent(this.streamCloseHandler);
  }

  public sendEvent(event: EventRequest): void {
    if (this.eventStream) {
      this.eventStream.write(event);
    } else {
      throw new Error('WorkerClient: Event Stream is not open');
    }
  }

  public sendEvents(events: Array<EventRequest>): void {
    if (this.eventStream) {
      events.forEach((event) => this.eventStream?.write(event));
    } else {
      throw new Error('WorkerClient: Event Stream is not open');
    }
  }

  public async closeStream(): Promise<EventReply> {
    if (this.eventStream) {
      const result = await new Promise<EventReply>((resolve: Resolve<EventReply>, reject: Reject) => {
        this.streamEnd.resolve = resolve;
        this.streamEnd.reject = reject;
        this.eventStream?.end();
      });

      this.eventStream = null;
      this.streamEnd.resolve = null;
      this.streamEnd.reject = null;
      return result;
    }
    throw new Error('WorkerClient: Event Stream is not open');
  }

  // A workaround for no well-defined way to promisify client-streaming requests
  // See https://github.com/grpc/grpc-node/issues/54
  public streamCloseHandler(err: ServiceError | null, res: EventReply): void {
    if (!this.streamEnd.resolve || !this.streamEnd.reject) {
      throw new Error('WorkerClient: StreamCloseHandler called without active streamEnd promise');
    }
    if (err) {
      this.streamEnd.reject(err);
    }
    this.streamEnd.resolve(res);
  }
  
}

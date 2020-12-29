import { Server, ServerCredentials } from '@grpc/grpc-js';
import { config as configEnv } from 'dotenv-safe';

import WorkerServer from './WorkerServer';
import { WorkerService } from './proto/worker_grpc_pb';
import Worker from './Worker';

configEnv();

const WORKER_SERVER_PORT = Number(process.env.WORKER_SERVER_PORT);
const TXMANAGER_ADDRESS = String(process.env.TXMANAGER_ADDRESS);
const TXMANAGER_PORT = String(process.env.TXMANAGER_PORT);

// Set up TxManager Client

// Set up Worker Server
const server: Server = new Server({
  'grpc.max_receive_message_length': -1,
  'grpc.max_send_message_length': -1,
});

server.addService(WorkerService, new WorkerServer());
server.bindAsync(
  `0.0.0.0:${WORKER_SERVER_PORT}`,
  ServerCredentials.createInsecure(),
  (err: Error | null, bindPort: number) => {
    if (err) {
      throw err;
    }

    // logger.info(`gRPC:Server:${bindPort}`, new Date().toLocaleString());
    server.start();
  },
);

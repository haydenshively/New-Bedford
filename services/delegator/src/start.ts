import { config as configEnv } from 'dotenv-safe';
import WorkerClient from './WorkerClient';

import { EventRequest } from './proto/worker_pb';

configEnv();

const WORKER_ADDRESS = String(process.env.WORKER_ADDRESS);
const WORKER_PORT = Number(process.env.WORKER_PORT);

// Set up Worker Client
const workerClient = new WorkerClient(WORKER_ADDRESS, WORKER_PORT);

// Demo functionality
(async (): Promise<void> => {
  try {
    await workerClient.sendStart();

    await workerClient.sendEvents([new EventRequest(), new EventRequest()]);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(err);
  }
})();

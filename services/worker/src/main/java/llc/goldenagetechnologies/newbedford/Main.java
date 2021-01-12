package llc.goldenagetechnologies.newbedford;

import io.github.cdimascio.dotenv.Dotenv;

/**
 * Entrypoint to Worker Service. Initializes gRPC server, and, if running in a dev environment, the debug endpoints for
 * serializing and deserializing the entire database.
 */
public class Main {
    public static void main(String[] args) {
        Dotenv dotenv = Dotenv.load();

        String addr = dotenv.get("WORKER_ADDRESS");
        int port = Integer.parseInt(dotenv.get("WORKER_PORT"));

        String txManagerAddr = dotenv.get("TXMANAGER_ADDRESS");
        int txManagerPort = Integer.parseInt(dotenv.get("TXMANAGER_PORT"));

        int numThreads = Integer.parseInt(dotenv.get("NUM_WORKER_THREADS"));

        // WorkerController workerController = new WorkerController(numThreads);

    }
}

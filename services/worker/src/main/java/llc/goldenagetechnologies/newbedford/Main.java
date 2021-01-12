package llc.goldenagetechnologies.newbedford;

import io.github.cdimascio.dotenv.Dotenv;
import io.grpc.Server;
import io.grpc.ServerBuilder;

import java.io.IOException;
import java.util.concurrent.BlockingDeque;
import java.util.concurrent.LinkedBlockingQueue;

/**
 * Entrypoint to Worker Service. Initializes gRPC server, and, if running in a dev environment, the debug endpoints for
 * serializing and deserializing the entire database.
 */
public class Main {
    public static void main(String[] args) throws IOException, InterruptedException {
        // Load env vars
        Dotenv dotenv = Dotenv.load();

        String addr = dotenv.get("WORKER_ADDRESS");
        int port = Integer.parseInt(dotenv.get("WORKER_PORT"));
        String txManagerAddr = dotenv.get("TXMANAGER_ADDRESS");
        int txManagerPort = Integer.parseInt(dotenv.get("TXMANAGER_PORT"));
        int numThreads = Integer.parseInt(dotenv.get("NUM_WORKER_THREADS"));


        // Build Server
        WorkerThreadExecutor workerThreadExecutor = new WorkerThreadExecutor();
        TxDelegator txDelegator = new TxDelegator(new TxManagerClient(txManagerAddr, txManagerPort), new LinkedBlockingQueue<TxManagerRequest>());

        WorkerController workerController = new WorkerController(numThreads, workerThreadExecutor, txDelegator);
        WorkerServer workerServer = new WorkerServer(workerController);

        Server server = ServerBuilder.forPort(port)
                .addService(workerServer)
                .build();

        // start
        server.start();

        // shutdown hook
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("gRPC server is shutting down!");
            server.shutdown();
        }));

        server.awaitTermination();

    }
}

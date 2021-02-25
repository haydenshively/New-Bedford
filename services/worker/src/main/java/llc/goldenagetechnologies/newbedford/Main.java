package llc.goldenagetechnologies.newbedford;

import io.github.cdimascio.dotenv.Dotenv;
import io.grpc.Server;
import io.grpc.ServerBuilder;
import io.grpc.netty.shaded.io.grpc.netty.NettyServerBuilder;
import llc.goldenagetechnologies.newbedford.grpc.TxManagerClient;
import llc.goldenagetechnologies.newbedford.grpc.WorkerServer;
import llc.goldenagetechnologies.newbedford.threading.TxDelegator;
import llc.goldenagetechnologies.newbedford.threading.TxManagerEvent;

import java.io.IOException;
import java.net.InetSocketAddress;
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
        TxDelegator txDelegator = new TxDelegator(new TxManagerClient(txManagerAddr, txManagerPort), new LinkedBlockingQueue<TxManagerEvent>());

        WorkerController workerController = new WorkerController(numThreads, txDelegator);
        WorkerServer workerServer = new WorkerServer(workerController);

        Server server = NettyServerBuilder.forAddress(new InetSocketAddress(addr, port))
                .addService(workerServer)
                .build();

        // start
        server.start();
        System.out.println("Worker server running on " + addr + ":" + port);

        // shutdown hook
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("gRPC server is shutting down!");
            server.shutdown();
        }));

        server.awaitTermination();

    }
}

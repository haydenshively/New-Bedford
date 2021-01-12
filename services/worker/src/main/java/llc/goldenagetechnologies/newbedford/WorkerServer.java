package llc.goldenagetechnologies.newbedford;

import io.grpc.stub.StreamObserver;
import llc.goldenagetechnologies.newbedford.proto.*;

/**
 * gRPC service implementation of worker. Logic is offloaded to WorkerController, which delegates to WorkerThreads;
 */
public class WorkerServer extends WorkerGrpc.WorkerImplBase {

    public WorkerServer(WorkerController workerController) {
        this.workerController = workerController;
    }

    @Override
    public StreamObserver<CandidateRequest> updateCandidate(StreamObserver<CandidateReply> responseObserver) {
        return super.updateCandidate(responseObserver);
    }

    @Override
    public StreamObserver<PriceRequest> updatePrices(StreamObserver<PriceReply> responseObserver) {
        return super.updatePrices(responseObserver);
    }

    private WorkerController workerController;
}

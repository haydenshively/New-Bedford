package llc.goldenagetechnologies.newbedford.grpc;

import io.grpc.stub.StreamObserver;
import llc.goldenagetechnologies.newbedford.WorkerController;
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
        return new StreamObserver<>() {
            @Override
            public void onNext(CandidateRequest candidateRequest) {
                // Pass along the response stream, so the worker thread can then request a bootstrap of the candidate
                // if it's data is missing
                workerController.updateCandidate(candidateRequest, responseObserver);
            }

            @Override
            public void onError(Throwable throwable) {
                System.err.println("WorkerServer: Error in candidate request stream");
            }

            @Override
            public void onCompleted() {
                responseObserver.onCompleted();
            }
        };
    }

    @Override
    public StreamObserver<PriceRequest> updatePrices(StreamObserver<PriceReply> responseObserver) {
        return new StreamObserver<>() {
            @Override
            public void onNext(PriceRequest priceRequest) {
                workerController.updatePrices(priceRequest);
            }

            @Override
            public void onError(Throwable throwable) {
                System.err.println("WorkerServer: Error in update prices stream");
            }

            @Override
            public void onCompleted() {
                PriceReply reply = PriceReply.newBuilder().build();
                responseObserver.onNext(reply);
                responseObserver.onCompleted();
            }
        };
    }

    @Override
    public StreamObserver<CompoundRateRequest> updateCompoundRates(StreamObserver<CompoundRateReply> responseObserver) {
        return new StreamObserver<>() {
            @Override
            public void onNext(CompoundRateRequest compoundRateRequest) {
                workerController.updateCompoundRates(compoundRateRequest);
            }

            @Override
            public void onError(Throwable throwable) {
                System.err.println("WorkerServer: Error in update compound rates stream");
            }

            @Override
            public void onCompleted() {
                CompoundRateReply reply = CompoundRateReply.newBuilder().build();
                responseObserver.onNext(reply);
                responseObserver.onCompleted();
            }
        };
    }

    private WorkerController workerController;
}

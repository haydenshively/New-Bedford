package llc.goldenagetechnologies.newbedford;

import io.grpc.*;
import io.grpc.stub.*;


public class TxManagerClient {

    public TxManagerClient(String txManagerAddress, int txManagerPort) {
        this.channel = ManagedChannelBuilder.forTarget(txManagerAddress + ":" + txManagerPort)
                .usePlaintext()
                .build();

        this.stub = TxManagerGrpc.newStub(channel);

    }

    /**
     * Establish connection streams to TxManager
     */
    public void open() {
        this.liquidateStream = this.stub.submitCandidates(new StreamObserver<>() {
            @Override
            public void onNext(LiquidateReply liquidateReply) {
                System.out.println("TxDelegator: Received end of liquidate stream");
            }
            @Override
            public void onError(Throwable throwable) {
                System.out.println("TxDelegator: Error in liquidate stream");
            }
            @Override
            public void onCompleted() { }
        });

        this.cancelCandidateStream = this.stub.cancelCandidates(new StreamObserver<CancelCandidateReply>() {
            @Override
            public void onNext(CancelCandidateReply cancelCandidateReply) {
                System.out.println("TxDelegator: Received end of cancel candidate stream");
            }
            @Override
            public void onError(Throwable throwable) {
                System.out.println("TxDelegator: Error in cancel candidate stream");
            }
            @Override
            public void onCompleted() { }
        });
    }

    public void submitCandidates(LiquidateRequest request) {
        this.liquidateStream.onNext(request);
    }

    public void cancelCandidates(CancelCandidateRequest request) {
        this.cancelCandidateStream.onNext(request);
    }

    /**
     * Close connection streams to TxManager
     */
    public void close() {
        this.liquidateStream.onCompleted();
        this.cancelCandidateStream.onCompleted();
    }

    public void shutdown() {
        this.channel.shutdown();
    }

    private final ManagedChannel channel;
    private final TxManagerGrpc.TxManagerStub stub;

    private StreamObserver<LiquidateRequest> liquidateStream;
    private StreamObserver<CancelCandidateRequest> cancelCandidateStream;
}

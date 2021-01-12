package llc.goldenagetechnologies.newbedford;

import io.grpc.stub.StreamObserver;
import llc.goldenagetechnologies.newbedford.proto.CandidateReply;
import llc.goldenagetechnologies.newbedford.proto.CandidateRequest;
import llc.goldenagetechnologies.newbedford.proto.CompoundRateRequest;
import llc.goldenagetechnologies.newbedford.proto.PriceRequest;

import java.util.ArrayList;
import java.util.concurrent.BlockingQueue;

public class WorkerController {

    public WorkerController(int numThreads, Runnable workerThreadExecutor, TxDelegator txDelegator) {
        this.numThreads = numThreads;
        workerThreads = new ArrayList<>(numThreads);
        eventQueues = new ArrayList<>(numThreads);
        this.delegator = txDelegator;
        this.delegatorQueue = txDelegator.getQueue();
    }

    public void updateCandidate(CandidateRequest candidateRequest, StreamObserver<CandidateReply> replyStream) {

    }

    public void updatePrices(PriceRequest priceRequest) {

    }

    public void updateCompoundRates(CompoundRateRequest compoundRateRequest) {

    }

    private int numThreads;
    private ArrayList<Thread> workerThreads;
    private ArrayList<BlockingQueue<WorkerEvent>> eventQueues;
    private TxDelegator delegator;
    private BlockingQueue<TxManagerRequest> delegatorQueue;
}

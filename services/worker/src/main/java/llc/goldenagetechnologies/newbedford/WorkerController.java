package llc.goldenagetechnologies.newbedford;

import llc.goldenagetechnologies.newbedford.proto.CandidateRequest;
import llc.goldenagetechnologies.newbedford.proto.PriceRequest;

import java.util.ArrayList;
import java.util.concurrent.BlockingQueue;

public class WorkerController {

    public WorkerController(int numThreads, Runnable workerThreadExecutor, TxDelegator txDelegator) {
        this.numThreads = numThreads;
        workerThreads = new ArrayList<>(numThreads);
        eventQueues = new ArrayList<>(numThreads);
    }

    public void updateCandidate(CandidateRequest candidateRequest) {

    }

    public void updatePrices(PriceRequest priceRequest) {

    }

    private int numThreads;
    private ArrayList<Thread> workerThreads;
    private ArrayList<BlockingQueue<WorkerEvent>> eventQueues;
    private TxDelegator delegator;
}

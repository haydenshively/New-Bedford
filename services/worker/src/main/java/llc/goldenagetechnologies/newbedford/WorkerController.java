package llc.goldenagetechnologies.newbedford;

import io.grpc.stub.StreamObserver;
import llc.goldenagetechnologies.newbedford.proto.*;
import llc.goldenagetechnologies.newbedford.threading.TxDelegator;
import llc.goldenagetechnologies.newbedford.threading.TxManagerEvent;
import llc.goldenagetechnologies.newbedford.threading.WorkerEvent;
import llc.goldenagetechnologies.newbedford.threading.WorkerThreadExecutor;

import java.util.ArrayList;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingDeque;

public class WorkerController {

    public WorkerController(int numThreads, TxDelegator txDelegator) {
        this.numThreads = numThreads;
        workerThreads = new ArrayList<>(numThreads);
        eventQueues = new ArrayList<>(numThreads);
        this.delegator = txDelegator;
        this.delegatorQueue = txDelegator.getQueue();

        for (int i = 0; i < numThreads; i++) {
            BlockingQueue<WorkerEvent> workerQueue = new LinkedBlockingDeque<>();
            Thread thread = new Thread(new WorkerThreadExecutor(workerQueue, new Worker(this.delegatorQueue)));
            workerThreads.add(thread);
            eventQueues.add(workerQueue);
        }
    }

    public void updateCandidate(CandidateRequest candidateRequest, StreamObserver<CandidateReply> replyStream) {
        for (Candidate candidate : candidateRequest.getCandidatesList()) {
            int candidateIdx = candidate.getAddress().hashCode() % numThreads;
            eventQueues.get(candidateIdx).offer(new WorkerEvent(candidateRequest, null, null));
        }
    }

    public void updatePrices(PriceRequest priceRequest) {
        for (BlockingQueue<WorkerEvent> queue: eventQueues) {
            queue.offer(new WorkerEvent(null, priceRequest, null));
        }
    }

    public void updateCompoundRates(CompoundRateRequest compoundRateRequest) {
        for (BlockingQueue<WorkerEvent> queue: eventQueues) {
            queue.offer(new WorkerEvent(null, null, compoundRateRequest));
        }
    }

    private int numThreads;
    private ArrayList<Thread> workerThreads;
    private ArrayList<BlockingQueue<WorkerEvent>> eventQueues;
    private TxDelegator delegator;
    private BlockingQueue<TxManagerEvent> delegatorQueue;
}

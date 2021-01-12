package llc.goldenagetechnologies.newbedford.threading;

import llc.goldenagetechnologies.newbedford.Worker;
import java.util.concurrent.BlockingQueue;

/**
 *
 */
public class WorkerThreadExecutor implements Runnable {

    public WorkerThreadExecutor(BlockingQueue<WorkerEvent> queue, Worker worker) {
        this.queue = queue;
        this.worker = worker;
    }

    @Override
    public void run() {
        try {
            while (true) {
                WorkerEvent workerEvent = queue.take();
                if (workerEvent.candidateRequest != null) {
                    worker.updateCandidate(workerEvent.candidateRequest);
                } else if (workerEvent.priceRequest != null) {
                    worker.updatePrices(workerEvent.priceRequest);
                } else if (workerEvent.compoundRateRequest != null) {
                    worker.updateCompoundRates(workerEvent.compoundRateRequest);
                } else {
                    throw new RuntimeException("WorkerThreadExecutor: Invalid worker event");
                }

            }
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
    }

    private final BlockingQueue<WorkerEvent> queue;
    private final Worker worker;
}

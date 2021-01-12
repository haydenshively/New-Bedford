package llc.goldenagetechnologies.newbedford;

import java.util.concurrent.BlockingQueue;

/**
 * Client to TxManager, the TxDelegator accepts liquidation (an un-liquidation) requests from any worker thread, and
 * propagates messages to the TxManager service.
 */
public class TxDelegator implements Runnable {

    public TxDelegator(TxManagerClient txManagerClient, BlockingQueue<TxManagerRequest> queue) {
        this.txManagerClient = txManagerClient;
        this.queue = queue;
    }

    @Override
    public void run() {
        try {
            this.txManagerClient.open();
            while (true) {
                TxManagerRequest request = queue.take();
                if (request.liquidateRequest != null) {
                    txManagerClient.submitCandidates(request.liquidateRequest);
                } else if (request.cancelCandidateRequest != null) {
                    txManagerClient.cancelCandidates(request.cancelCandidateRequest);
                } else {
                    throw new RuntimeException("TxDelegator received invalid event");
                }
            }
        } catch (InterruptedException e) {
            e.printStackTrace();
            this.txManagerClient.close();
            this.txManagerClient.shutdown();
        }
    }

    public BlockingQueue<TxManagerRequest> getQueue() {
        return queue;
    }

    private final TxManagerClient txManagerClient;
    private final BlockingQueue<TxManagerRequest> queue;
}

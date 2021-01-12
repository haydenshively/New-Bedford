package llc.goldenagetechnologies.newbedford;

/**
 * Client to TxManager, the TxDelegator accepts liquidation (an un-liquidation) requests from any worker thread, and
 * propagates messages to the TxManager service.
 */
public class TxDelegator implements Runnable {

    public TxDelegator(TxManagerClient txManagerClient) {
        this.txManagerClient = txManagerClient;
    }

    @Override
    public void run() {

    }

    private TxManagerClient txManagerClient;
}

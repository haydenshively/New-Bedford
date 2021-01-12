package llc.goldenagetechnologies.newbedford;

import llc.goldenagetechnologies.newbedford.compound.GlobalCompoundData;
import llc.goldenagetechnologies.newbedford.proto.*;
import llc.goldenagetechnologies.newbedford.threading.TxManagerEvent;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;

public class Worker {

    public Worker(BlockingQueue<TxManagerEvent> queue) {
        this.txDelegatorQueue = queue;
        this.liquidatabilityMap = new HashMap<>();
        this.workerDB = WorkerDB.newBuilder().setCompoundData(GlobalCompoundData.GLOBAL_COMPOUND_DATA).build();
    }

    public void updateCandidate(CandidateRequest request) {

    }

    public void updatePrices(PriceRequest request) {
        this.maxPrices = request.getMaxPricesList();
        this.minPrices = request.getMinPricesList();

    }

    public void updateCompoundRates(CompoundRateRequest request) {

    }

    private final BlockingQueue<TxManagerEvent> txDelegatorQueue;
    private WorkerDB workerDB;

    private List<TokenPrice> maxPrices;
    private List<TokenPrice> minPrices;

    // To capture rising/falling edge of liquidatability in order to send both liquidateCandidate events and
    // cancelCandidate events
    private Map<String, Double> liquidatabilityMap;

    /**
     * What we currently call the "liquidatability" calculation
     *
     * @param account who to do calculation for
     * @return shortfall; a positive return value indicates that the account is liquidatable
     */
    private static long shortfallOf(Candidate candidate) {
        long collat = 0;
        long borrow = 0;
        /*
        for (CandidateTokenData tokenData: candidate.getCandidateTokenDataMap().entrySet()) {
            final long price_USD = cToken.info.priceInUSD();
            final long supply_USD = account.supplyBalance(cToken) * price_USD;
            final long borrow_USD = account.borrowBalance(cToken) * price_USD;

            final long collateralFactor = cToken.info.collateralFactor();
            collat += supply_USD * collateralFactor;
            borrow += borrow_USD;
        }
        */


        return borrow - collat;
    }

}

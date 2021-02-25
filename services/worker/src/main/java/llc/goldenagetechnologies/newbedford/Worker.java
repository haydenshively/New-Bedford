package llc.goldenagetechnologies.newbedford;

import llc.goldenagetechnologies.newbedford.compound.GlobalCompoundData;
import llc.goldenagetechnologies.newbedford.proto.*;
import llc.goldenagetechnologies.newbedford.threading.TxManagerEvent;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;

public class Worker {

    public Worker(BlockingQueue<TxManagerEvent> queue) {
        this.txDelegatorQueue = queue;
        this.liquidatabilityMap = new HashMap<>();
        this.workerDB = WorkerDB.newBuilder().setCompoundData(GlobalCompoundData.GLOBAL_COMPOUND_DATA).build();
        this.minPrices = new HashMap<>();
        this.maxPrices = new HashMap<>();
        this.exchangeRates = new HashMap<>();
    }

    public void updateCandidate(CandidateRequest request) {
        request.getCandidatesList().forEach((candidate -> {

        }));
    }

    public void updatePrices(PriceRequest request) {
        // Update local maps whenever new price data is sent
        request.getMinPricesList().forEach((tokenPrice) -> minPrices.put(tokenPrice.getToken(), tokenPrice));
        request.getMaxPricesList().forEach((tokenPrice) -> maxPrices.put(tokenPrice.getToken(), tokenPrice));
        request.getExchangeRatesMap().forEach((key, value) -> {
            exchangeRates.put(Token.forNumber(key), new BigDecimal(value));
        });
    }

    public void updateCompoundRates(CompoundRateRequest request) {

    }

    private final BlockingQueue<TxManagerEvent> txDelegatorQueue;
    private WorkerDB workerDB;

    private Map<Token, TokenPrice> maxPrices;
    private Map<Token, TokenPrice> minPrices;
    private Map<Token, BigDecimal> exchangeRates;

    // To capture rising/falling edge of liquidatability in order to send both liquidateCandidate events and
    // cancelCandidate events
    private Map<String, Double> liquidatabilityMap;

    /**
     * What we currently call the "liquidatability" calculation
     *
     * @param candidate who to do calculation for
     * @return shortfall; a positive return value indicates that the account is liquidatable
     */
    private BigDecimal shortfallOf(Candidate candidate) {
        BigDecimal collat = BigDecimal.ZERO;
        BigDecimal borrow = BigDecimal.ZERO;

        for (Token token : Token.values()) {
            final BigDecimal supplyBalance = new BigDecimal(candidate.getSupplyBalancesMap().get(token.getNumber()));
            final BigDecimal borrowBalance = new BigDecimal(candidate.getBorrowBalancesMap().get(token.getNumber()));

            // Use minimum token price if user is supplying, otherwise maximum
            if (!minPrices.containsKey(token) || !maxPrices.containsKey(token)) {
                return BigDecimal.ZERO;
            }

            // Disregard decimals, exchange rate (cToken <-> token) will take care of it
            final TokenPrice price_USD = (supplyBalance.compareTo(new BigDecimal(0)) > 0) ? minPrices.get(token) : maxPrices.get(token);

            final BigDecimal exchangeRate = exchangeRates.get(token);

            final String collateralFactor = workerDB.getCompoundData().getGlobalTokenDataMap().get(token.getNumber()).getCollateralFactor();

            final BigDecimal collatBalanceUSD = supplyBalance.multiply(exchangeRate).multiply(new BigDecimal(price_USD.getPriceDollars())).multiply(new BigDecimal(collateralFactor));
            final BigDecimal borrowBalanceUSD = borrowBalance.multiply(new BigDecimal(price_USD.getPriceDollars())); // borrowBalance.multiply(price_USD);
            collat = collat.add(collatBalanceUSD);
            borrow = borrow.add(borrowBalanceUSD);
        }

        return borrow.subtract(collat);
    }

}

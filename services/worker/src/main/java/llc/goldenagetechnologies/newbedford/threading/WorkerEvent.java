package llc.goldenagetechnologies.newbedford.threading;

import llc.goldenagetechnologies.newbedford.proto.CandidateRequest;
import llc.goldenagetechnologies.newbedford.proto.CompoundRateRequest;
import llc.goldenagetechnologies.newbedford.proto.PriceRequest;

/**
 * A union type between candidate events and price events, allows worker threads to wait on a single queue type
 */
public class WorkerEvent {
    public final CandidateRequest candidateRequest;
    public final PriceRequest priceRequest;
    public final CompoundRateRequest compoundRateRequest;

    public WorkerEvent(CandidateRequest candidateRequest, PriceRequest priceRequest, CompoundRateRequest compoundRateRequest) {
        this.candidateRequest = candidateRequest;
        this.priceRequest = priceRequest;
        this.compoundRateRequest = compoundRateRequest;
    }
}

package llc.goldenagetechnologies.newbedford;

import llc.goldenagetechnologies.newbedford.proto.CandidateRequest;
import llc.goldenagetechnologies.newbedford.proto.PriceRequest;

/**
 * A union type between candidate events and price events, allows worker threads to wait on a single queue type
 */
public class WorkerEvent {
    public final CandidateRequest candidateRequest;
    public final PriceRequest priceRequest;
    public WorkerEvent(CandidateRequest candidateRequest, PriceRequest priceRequest) {
        this.candidateRequest = candidateRequest;
        this.priceRequest = priceRequest;
    }
}

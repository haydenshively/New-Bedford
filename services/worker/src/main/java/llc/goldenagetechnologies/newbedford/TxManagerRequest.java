package llc.goldenagetechnologies.newbedford;

public class TxManagerRequest {
    public final LiquidateRequest liquidateRequest;
    public final CancelCandidateRequest cancelCandidateRequest;

    public TxManagerRequest(LiquidateRequest liquidateRequest, CancelCandidateRequest cancelCandidateRequest) {
        this.liquidateRequest = liquidateRequest;
        this.cancelCandidateRequest = cancelCandidateRequest;
    }
}

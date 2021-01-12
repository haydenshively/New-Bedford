package llc.goldenagetechnologies.newbedford.threading;

import llc.goldenagetechnologies.newbedford.CancelCandidateRequest;
import llc.goldenagetechnologies.newbedford.LiquidateRequest;

public class TxManagerEvent {
    public final LiquidateRequest liquidateRequest;
    public final CancelCandidateRequest cancelCandidateRequest;

    public TxManagerEvent(LiquidateRequest liquidateRequest, CancelCandidateRequest cancelCandidateRequest) {
        this.liquidateRequest = liquidateRequest;
        this.cancelCandidateRequest = cancelCandidateRequest;
    }
}

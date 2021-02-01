package llc.goldenagetechnologies.newbedford.compound;

import llc.goldenagetechnologies.newbedford.proto.CompoundData;
import llc.goldenagetechnologies.newbedford.proto.GlobalTokenData;
import llc.goldenagetechnologies.newbedford.proto.Token;
import llc.goldenagetechnologies.newbedford.proto.TokenType;

import java.util.HashMap;
import java.util.Map;

public class GlobalCompoundData {
    public static final CompoundData GLOBAL_COMPOUND_DATA;
    static {
        Map<Integer, GlobalTokenData> tokenDataMap = new HashMap<>();
        // Fill in token data
        tokenDataMap.put(Token.cDAI_VALUE, GlobalTokenData.newBuilder()
                .setTokenType(TokenType.V2)
                .setUnderlyingDecimals(18)
                .setCollateralFactor("0.75")
                .build());

        GLOBAL_COMPOUND_DATA = CompoundData.newBuilder()
                .setCloseFactor(0.5d)
                .setLiquidationIncentive(1.08)
                .putAllGlobalTokenData(tokenDataMap)
                .build();
    }
}

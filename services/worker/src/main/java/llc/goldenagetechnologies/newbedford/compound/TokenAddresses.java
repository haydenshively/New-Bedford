package llc.goldenagetechnologies.newbedford.compound;

import llc.goldenagetechnologies.newbedford.proto.Token;

import java.util.HashMap;
import java.util.Map;

public class TokenAddresses {
    public static final Map<Token, String> addresses;
    static {
        addresses = new HashMap<>();
        addresses.put(Token.cBAT, "");
        // etc
    }
}

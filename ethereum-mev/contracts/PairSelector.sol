// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Import external Compound components
import "./external/compound/CERC20.sol";

// Import external Uniswap components
import './external/uniswap/UniswapV2Library.sol';
import "./external/uniswap/IUniswapV2Factory.sol";
import "./external/uniswap/IUniswapV2Pair.sol";


contract PairSelector {

    address internal constant CETH = 0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5;
    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address private constant FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;

    /**
     * @dev Sets a limit on Uniswap price premium. A premium of 100% would mean we are willing to pay twice the market
     *      price while trading. Here we've chosen a 5% limit, somewhat arbitrarily. Stored as 100000 * (100% - 5%)
     *
     * NOTE: A helpful write-up -- https://medium.com/scalar-capital/uniswap-a-unique-exchange-f4ef44f807bf
     */
    uint private constant SLIPPAGE_THRESHOLD = 950;


    /**
     * Select a pair based on which cTokens are being repaid/seized. When in doubt, WETH pairs are assumed
     * to have the highest liquidity. We opt for single-hop trades if possible, which saves gas.
     *
     * if _repayCToken == _seizeCToken -->  WETH-REPAY pair
     * if _seizeCToken == CETH -->          WETH-REPAY pair
     * if _repayCToken == CETH -->          WETH-SEIZE pair
     * else -->                             REPAY-SEIZE or WETH-REPAY, whichever is better
     *
     * @param _repayCToken (address): a CToken for which the user is in debt
     * @param _seizeCToken (address): a CToken for which the user has a supply balance
     * @param _seize (uint): the amount (specified in units of _seizeCToken.underlying) that can be seized
     * @return pair info (
     *      pair address,
     *      token address that should be flash borrowed from the pair,
     *      the maximum number of seize tokens that can be swapped
     *  )
     */
    function selectPairSlippageAware(
        address _repayCToken,
        address _seizeCToken,
        uint _seize
    ) internal view returns (address pair, address outToken, uint maxSwap) {
        address inToken;
        uint inTokenReserves;

        if (_repayCToken == _seizeCToken || _seizeCToken == CETH) {
            outToken = CERC20Storage(_repayCToken).underlying();
            inToken = WETH;
            // ...logic continues after the conditionals
        }
        else if (_repayCToken == CETH) {
            outToken = WETH;
            inToken = CERC20Storage(_seizeCToken).underlying();
            // ...logic continues after the conditionals
        }
        else {
            outToken = CERC20Storage(_repayCToken).underlying();
            inToken = CERC20Storage(_seizeCToken).underlying();
            // ...logic is self-contained to this case

            // See if direct swap has sufficient liquidity
            ( , inTokenReserves, pair) = UniswapV2Library.getReservesWithPair(
                FACTORY,
                outToken,
                inToken
            );
            maxSwap = computeMaxInputGivenSlippage(SLIPPAGE_THRESHOLD, inTokenReserves);
            if (_seize <= maxSwap) return (pair, outToken, maxSwap);

            // If it doesn't, see if REPAY->ETH + SEIZE->ETH would be better
            ( , uint wETHReserves2, address pairAlt) = UniswapV2Library.getReservesWithPair(
                FACTORY,
                outToken,
                WETH
            );
            (uint seizeTokenReservesAlt, uint wETHReserves1, ) = UniswapV2Library.getReservesWithPair(
                FACTORY,
                inToken,
                WETH
            );
            uint maxSwapAlt = computeMaxInputGivenSlippageTwoHop(
                SLIPPAGE_THRESHOLD,
                seizeTokenReservesAlt,
                wETHReserves1,
                wETHReserves2
            );

            if (maxSwapAlt > maxSwap) return (pairAlt, outToken, maxSwapAlt);
            return (pair, outToken, maxSwap);
        }

        // Computes pair without external call, then fetches reserve size
        ( , inTokenReserves, pair) = UniswapV2Library.getReservesWithPair(
            FACTORY,
            outToken,
            inToken
        );
        // Slippage negatively impacts the price of seizeToken, so we use its reserves for math
        maxSwap = computeMaxInputGivenSlippage(SLIPPAGE_THRESHOLD, inTokenReserves);
    }

    /**
     * Uses a maximum allowed slippage (or "price impact") to constrain trade size across a single pair.
     *
     * @param _slippage (uint): The slippage constraint * 1000. 5% slippage would be 0.95*1000 = 950
     * @param _reservesX (uint): The pair reserves corresponding to the token that will be sent *to* the pair
     * @return deltaX The maximum trade size (denominated in X)
     */
    function computeMaxInputGivenSlippage(uint _slippage, uint _reservesX) private pure returns (uint deltaX) {
        uint slippageTerm = (100000000 / _slippage) - 100301; // 100301 ~= 100000 * 1000/997
        deltaX = _reservesX * slippageTerm / 100000;
    }

    /**
     * Uses a maximum allowed slippage (or "price impact") to constrain trade size across two pairs.
     * It is expected that X will be traded for Y in pair 1, and then Y will be traded for Z in pair 2.
     *
     * @param _slippage (uint): The slippage constraint * 1000. 5% slippage would be 0.95*1000 = 950
     * @param _reservesX (uint): The reserves corresponding to the token that will be *sent* to pair 1
     * @param _reservesY1 (uint): The reserves corresponding to the token that is *received* from pair 1
     * @param _reservesY2 (uint): The reserves corresponding to the token that is *sent* to pair 2
     * @return deltaX The maximum trade size (denominated in X)
     */
    function computeMaxInputGivenSlippageTwoHop(
        uint _slippage,
        uint _reservesX,
        uint _reservesY1,
        uint _reservesY2
    ) private pure returns (uint deltaX) {
        uint reservesTerm = 997 * _reservesX * _reservesY2 / (997 * _reservesY1 + 1000 * _reservesY2);
        uint slippageTerm = (100000000 / _slippage) - 100603; // 100603 ~= 100000 * (1000/997)**2
        deltaX = reservesTerm * slippageTerm / 100000;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Import external Compound components
import "./external/compound/CERC20.sol";

// Import external Uniswap components
import './external/uniswap/UniswapV2Library.sol';
import "./external/uniswap/IUniswapV2Factory.sol";
import "./external/uniswap/IUniswapV2Pair.sol";


contract PairSelector {

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
     * else -->                             WETH-REPAY, slippage computed based on 2-hop swap
     *
     * @param _repayCToken (address): a CToken for which the user is in debt
     * @param _seizeCToken (address): a CToken for which the user has a supply balance
     * @return pair info (
     *      pair address,
     *      token address that should be flash borrowed from the pair,
     *      the maximum number of seize tokens that can be swapped
     *  )
     */
    function selectPairSlippageAware(
        uint _mode,
        address _repayCToken,
        address _seizeCToken
    ) internal view returns (
        address pair,
        address outToken,
        uint maxSwap,
        uint inTokenReserves,
        uint outTokenReserves
    ) {
        address inToken;

        if (_mode == 0) {
            outToken = CERC20Storage(_repayCToken).underlying();
            inToken = CERC20Storage(_seizeCToken).underlying();

            // REPAY->ETH + SEIZE->ETH
            uint wETHReserves2;
            ( , wETHReserves2, pair) = UniswapV2Library.getReservesWithPair(
                FACTORY,
                outToken,
                WETH
            );
            (outTokenReserves, inTokenReserves, ) = UniswapV2Library.getReservesWithPair(
                FACTORY,
                WETH,
                inToken
            );
            maxSwap = computeMaxInputGivenSlippageTwoHop(
                SLIPPAGE_THRESHOLD,
                inTokenReserves,
                outTokenReserves, // could be called "wETHReserves1"
                wETHReserves2
            );

            return (pair, outToken, maxSwap, 0, 0);
        }
        else if (_mode == 3) {
            outToken = WETH;
            inToken = CERC20Storage(_seizeCToken).underlying();
        }
        else /* if (_mode == 1 || _mode == 2) */ {
            outToken = CERC20Storage(_repayCToken).underlying();
            inToken = WETH;
        }

        // Computes pair without external call, then fetches reserve size
        (outTokenReserves, inTokenReserves, pair) = UniswapV2Library.getReservesWithPair(
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
    function computeMaxInputGivenSlippage(uint _slippage, uint _reservesX) private pure returns (uint) { unchecked {
        return _reservesX * ((100000000 / _slippage) - 100301) / 100000;
    }}

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
    ) private pure returns (uint) { unchecked {
        uint reservesTerm = 997 * _reservesX * _reservesY2 / (997 * _reservesY1 + 1000 * _reservesY2);
        return reservesTerm * ((100000000 / _slippage) - 100603) / 100000;
    }}
}

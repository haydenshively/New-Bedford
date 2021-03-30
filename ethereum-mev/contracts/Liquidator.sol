// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";

// Import Compound components
import "./external/compound/CERC20.sol";
import "./external/compound/Comptroller.sol";
import "./external/compound/UniswapAnchoredView.sol";

// Import Uniswap components
import "./external/uniswap/UniswapV2Library.sol";
import "./external/uniswap/IUniswapV2Factory.sol";
import "./external/uniswap/IUniswapV2Pair.sol";

import "./external/ICHI.sol";

import "./PairSelector.sol";


interface ITreasury {
    function payoutMax(address _asset) external;
}


contract Liquidator is PairSelector {
    using SafeERC20 for IERC20;

    address private constant CETH = 0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5;

    address private constant CHI = 0x0000000000004946c0e9F43F4Dee607b0eF1fA1c;

    uint private constant GAS_THRESHOLD = 2000000;

    uint private constant FUZZY_NUM = 999;

    uint private constant FUZZY_DEN = 1000;

    address payable private immutable treasury;

    Comptroller public comptroller;

    UniswapAnchoredView public oracle;

    uint private closeFact;

    uint private liqIncent;

    modifier onlyTreasury() {
        require(msg.sender == treasury, "New Bedford: Unauthorized");
        _;
    }

    modifier discountCHI {
        uint gasStart = gasleft();
        _;
        uint gasSpent = 21000 + gasStart - gasleft() + 16 * msg.data.length;
        ICHI(CHI).freeFromUpTo(treasury, (gasSpent + 14154) / 41947);
    }


    constructor(address payable _treasury, address _comptrollerAddress) PairSelector() {
        treasury = _treasury;
        _setComptroller(_comptrollerAddress);
    }

    /// @dev Delete the contract and send any available ETH to treasury
    function kill() external onlyTreasury {
        selfdestruct(treasury);
    }

    function _setComptroller(address _comptrollerAddress) private {
        comptroller = Comptroller(_comptrollerAddress);
        oracle = UniswapAnchoredView(comptroller.oracle());
        closeFact = comptroller.closeFactorMantissa();
        liqIncent = comptroller.liquidationIncentiveMantissa();
    }

    function setComptroller(address _comptrollerAddress) external onlyTreasury {
        _setComptroller(_comptrollerAddress);
    }

    function liquidateSNWithPrice(
        bytes[] calldata _messages,
        bytes[] calldata _signatures,
        string[] calldata _symbols,
        address[] calldata _borrowers,
        address[] calldata _cTokens
    ) external {
        oracle.postPrices(_messages, _signatures, _symbols);
        liquidateSN(_borrowers, _cTokens);
    }

    function liquidateSN(address[] calldata _borrowers, address[] calldata _cTokens) public {
        uint i;

        while (true) {
            liquidateS(_borrowers[i], _cTokens[i * 2], _cTokens[i * 2 + 1]);
            if (gasleft() < GAS_THRESHOLD || i + 1 == _borrowers.length) break;
            i++;
        }
    }

    function liquidateSWithPrice(
        bytes[] calldata _messages,
        bytes[] calldata _signatures,
        string[] calldata _symbols,
        address _borrower,
        address _repayCToken,
        address _seizeCToken
    ) external {
        oracle.postPrices(_messages, _signatures, _symbols);
        liquidateS(_borrower, _repayCToken, _seizeCToken);
    }

    /**
     * Liquidate a Compound user with a flash swap, auto-computing liquidation amount
     *
     * @param _borrower (address): the Compound user to liquidate
     * @param _repayCToken (address): a CToken for which the user is in debt
     * @param _seizeCToken (address): a CToken for which the user has a supply balance
     */
    function liquidateS(address _borrower, address _repayCToken, address _seizeCToken) public {
        uint seizeTokensPerRepayToken = oracle.getUnderlyingPrice(_repayCToken) * liqIncent / oracle.getUnderlyingPrice(_seizeCToken); // 18 extra decimals

        uint repay_BorrowConstrained = CERC20(_repayCToken).borrowBalanceStored(_borrower) * closeFact / 1e18; // 0 extra decimals
        uint repay_SupplyConstrained = CERC20(_seizeCToken).balanceOf(_borrower) * CERC20(_seizeCToken).exchangeRateStored() / seizeTokensPerRepayToken; // 0 extra decimals
        
        uint repay = repay_BorrowConstrained < repay_SupplyConstrained ? repay_BorrowConstrained : repay_SupplyConstrained;
        uint seize = repay * seizeTokensPerRepayToken / 1e18;

        uint mode = liquidate(_borrower, _repayCToken, _seizeCToken, repay, seize);
        if (mode == 0 || mode == 1) ITreasury(treasury).payoutMax(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
        else ITreasury(treasury).payoutMax(address(0));
    }

    /**
     * Liquidate a Compound user with a flash swap
     *
     * @param _borrower (address): the Compound user to liquidate
     * @param _repayCToken (address): a CToken for which the user is in debt
     * @param _seizeCToken (address): a CToken for which the user has a supply balance
     * @param _repay (uint): the amount (specified in units of _repayCToken.underlying) that can be repaid
     * @param _seize (uint): the amount (specified in units of _seizeCToken.underlying) that can be seized
     */
    function liquidate(
        address _borrower,
        address _repayCToken,
        address _seizeCToken,
        uint _repay,
        uint _seize
    ) public returns (uint) {
        // Branchless computation of mode
        uint mode;
        assembly {
            // 3 * uint(_repayCToken == CETH) + 2 * uint(_seizeCToken == CETH) + uint(_repayCToken == _seizeCToken)
            mode := add(mul(3, eq(_repayCToken, CETH)), add(mul(2, eq(_seizeCToken, CETH)), eq(_repayCToken, _seizeCToken)))
        }

        // Figure out best pair for swap (and other stats)
        (
            address pair,
            address flashToken,
            uint maxSwap,
            uint reserveIn,
            uint reserveOut
        ) = selectPairSlippageAware(mode, _repayCToken, _seizeCToken);

        // Update repay & seize numbers, then bundle data for flash swap
        if (_seize > maxSwap) (_repay, _seize) = (_repay * maxSwap / _seize, _seize * maxSwap / _repay);
        bytes memory data = abi.encode(mode, _borrower, _repayCToken, _seizeCToken, _repay);

        // Calculate some more params (depending on mode) and execute swap
        if (mode % 2 == 0) {
            if (IUniswapV2Pair(pair).token0() == flashToken) IUniswapV2Pair(pair).swap(_repay, 0, treasury, data);
            else IUniswapV2Pair(pair).swap(0, _repay, treasury, data);
        }
        else if (mode == 1) {
            unchecked {
                // Just reusing maxSwap variable to save gas; name means nothing here
                maxSwap = 997 * _seize;
                maxSwap = reserveIn * (maxSwap - 1000 * _repay) / (1000 * (reserveOut - _repay) + maxSwap) * FUZZY_NUM / FUZZY_DEN;
            }

            // Both amount0 and amount1 are non-zero since we want to end up with ETH
            if (IUniswapV2Pair(pair).token0() == flashToken) IUniswapV2Pair(pair).swap(_repay, maxSwap, treasury, data);
            else IUniswapV2Pair(pair).swap(maxSwap, _repay, treasury, data);
        }
        else /* if (mode == 3) */ {
            // Just reusing maxSwap variable to save gas; name means nothing here
            maxSwap = UniswapV2Library.getAmountOut(_seize, reserveIn, reserveOut) * FUZZY_NUM / FUZZY_DEN;

            if (IUniswapV2Pair(pair).token0() == flashToken) IUniswapV2Pair(pair).swap(maxSwap, 0, treasury, data);
            else IUniswapV2Pair(pair).swap(0, maxSwap, treasury, data);
        }

        return mode;
    }

    function liquidateSChi(address _borrower, address _repayCToken, address _seizeCToken) external discountCHI {
        liquidateS(_borrower, _repayCToken, _seizeCToken);
    }

    function liquidateSNChi(address[] calldata _borrowers, address[] calldata _cTokens) external discountCHI {
        liquidateSN(_borrowers, _cTokens);
    }

    function liquidateSWithPriceChi(
        bytes[] calldata _messages,
        bytes[] calldata _signatures,
        string[] calldata _symbols,
        address _borrower,
        address _repayCToken,
        address _seizeCToken
    ) external discountCHI {
        oracle.postPrices(_messages, _signatures, _symbols);
        liquidateS(_borrower, _repayCToken, _seizeCToken);
    }

    function liquidateSNWithPriceChi(
        bytes[] calldata _messages,
        bytes[] calldata _signatures,
        string[] calldata _symbols,
        address[] calldata _borrowers,
        address[] calldata _cTokens
    ) external discountCHI {
        oracle.postPrices(_messages, _signatures, _symbols);
        liquidateSN(_borrowers, _cTokens);
    }
}

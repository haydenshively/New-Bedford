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

import "./LiquidationCallee.sol";
import "./PairSelector.sol";


contract Liquidator is PairSelector, LiquidationCallee {
    using SafeERC20 for IERC20;

    address private constant CETH = 0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5;

    address private constant CHI = 0x0000000000004946c0e9F43F4Dee607b0eF1fA1c;

    uint private constant GAS_THRESHOLD = 2000000;

    uint private constant FUZZY_NUM = 999;

    uint private constant FUZZY_DEN = 1000;

    address payable private owner;

    Comptroller public comptroller;

    UniswapAnchoredView public oracle;

    uint private closeFact;

    uint private liqIncent;

    event Revenue(address asset, uint amount);

    modifier discountCHI {
        uint gasStart = gasleft();
        _;
        uint gasSpent = 21000 + gasStart - gasleft() + 16 * msg.data.length;
        ICHI(CHI).freeUpTo((gasSpent + 14154) / 41947);
    }

    constructor(address _comptrollerAddress) {
        owner = payable(msg.sender);
        _setComptroller(_comptrollerAddress);
    }

    /// @dev Allows owner to change their address
    function changeOwner(address payable _owner) external {
        require(msg.sender == owner, "Not owner");
        owner = _owner;
    }

    /// @dev Delete the contract and send any available ETH to owner
    function kill() external {
        require(msg.sender == owner, "Not owner");
        selfdestruct(owner);
    }

    function setComptroller(address _comptrollerAddress) external {
        require(msg.sender == owner, "Not owner");
        _setComptroller(_comptrollerAddress);
    }

    function _setComptroller(address _comptrollerAddress) private {
        comptroller = Comptroller(_comptrollerAddress);
        oracle = UniswapAnchoredView(comptroller.oracle());
        closeFact = comptroller.closeFactorMantissa();
        liqIncent = comptroller.liquidationIncentiveMantissa();
    }

    function mintCHI(uint _amount) external {
        ICHI(CHI).mint(_amount);
    }

    function payout(address _asset, uint _amount) public {
        if (_asset == address(0)) owner.transfer(_amount);
        else IERC20(_asset).transfer(owner, _amount);
    }

    function payoutMax(address _asset) public {
        if (_asset == address(0)) payout(_asset, address(this).balance);
        else payout(_asset, IERC20(_asset).balanceOf(address(this)));
    }

    function liquidateSWithPrice(
        bytes[] calldata _messages,
        bytes[] calldata _signatures,
        string[] calldata _symbols,
        address _borrower,
        address _repayCToken,
        address _seizeCToken,
        uint _toMiner
    ) external {
        oracle.postPrices(_messages, _signatures, _symbols);
        liquidateS(_borrower, _repayCToken, _seizeCToken, _toMiner);
    }

    /**
     * Liquidate a Compound user with a flash swap, auto-computing liquidation amount
     *
     * @param _borrower (address): the Compound user to liquidate
     * @param _repayCToken (address): a CToken for which the user is in debt
     * @param _seizeCToken (address): a CToken for which the user has a supply balance
     * @param _toMiner (uint): the portion of revenue to send to block.coinbase
     */
    function liquidateS(address _borrower, address _repayCToken, address _seizeCToken, uint _toMiner) public {
        // [num seize tokens per repay token] = a / b / 1e18
        uint a = oracle.getUnderlyingPrice(_repayCToken) * liqIncent;
        uint b = oracle.getUnderlyingPrice(_seizeCToken);

        // max possible repay, constrained by borrow
        uint c = CERC20(_repayCToken).borrowBalanceStored(_borrower) * closeFact / 1e18;
        // max possible repay, constrained by supply
        uint d = CERC20(_seizeCToken).balanceOf(_borrower) * CERC20(_seizeCToken).exchangeRateStored() * b / a;
        
        // max possible repay, overall
        c = c < d ? c : d;
        // corresponding seize amount
        d = c * a / b / 1e18;

        // initial balance (to compare against later)
        a = address(this).balance;
        // perform liquidation and store the "mode" parameter
        b = liquidate(_borrower, _repayCToken, _seizeCToken, c, d);

        if (_toMiner != 0) {
            if (b == 0 || b == 1) {
                IWETH(WETH).withdraw(IERC20(WETH).balanceOf(address(this)));
                c = address(this).balance - a;
                block.coinbase.transfer(c * _toMiner / 10_000);
                emit Revenue(WETH, c);
            } else {
                c = address(this).balance - a;
                block.coinbase.transfer(c * _toMiner / 10_000);
                emit Revenue(address(0), c);
            }
        }
    }

    /**
     * Liquidate a Compound user with a flash swap
     *
     * @param _borrower (address): the Compound user to liquidate
     * @param _repayCToken (address): a CToken for which the user is in debt
     * @param _seizeCToken (address): a CToken for which the user has a supply balance
     * @param _repay (uint): the amount (specified in units of _repayCToken.underlying) that can be repaid
     * @param _seize (uint): the amount (specified in units of _seizeCToken.underlying) that can be seized
     * @return the mode
     */
    function liquidate(
        address _borrower,
        address _repayCToken,
        address _seizeCToken,
        uint _repay,
        uint _seize
    ) private returns (uint) {
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
            if (IUniswapV2Pair(pair).token0() == flashToken) IUniswapV2Pair(pair).swap(_repay, 0, address(this), data);
            else IUniswapV2Pair(pair).swap(0, _repay, address(this), data);
        }
        else if (mode == 1) {
            unchecked {
                // Just reusing maxSwap variable to save gas; name means nothing here
                maxSwap = 997 * _seize;
                maxSwap = reserveIn * (maxSwap - 1000 * _repay) / (1000 * (reserveOut - _repay) + maxSwap) * FUZZY_NUM / FUZZY_DEN;
            }

            // Both amount0 and amount1 are non-zero since we want to end up with ETH
            if (IUniswapV2Pair(pair).token0() == flashToken) IUniswapV2Pair(pair).swap(_repay, maxSwap, address(this), data);
            else IUniswapV2Pair(pair).swap(maxSwap, _repay, address(this), data);
        }
        else /* if (mode == 3) */ {
            // Just reusing maxSwap variable to save gas; name means nothing here
            maxSwap = UniswapV2Library.getAmountOut(_seize, reserveIn, reserveOut) * FUZZY_NUM / FUZZY_DEN;

            if (IUniswapV2Pair(pair).token0() == flashToken) IUniswapV2Pair(pair).swap(maxSwap, 0, address(this), data);
            else IUniswapV2Pair(pair).swap(0, maxSwap, address(this), data);
        }

        return mode;
    }

    function liquidateSChi(address _borrower, address _repayCToken, address _seizeCToken, uint _toMiner) external discountCHI {
        liquidateS(_borrower, _repayCToken, _seizeCToken, _toMiner);
    }

    function liquidateSWithPriceChi(
        bytes[] calldata _messages,
        bytes[] calldata _signatures,
        string[] calldata _symbols,
        address _borrower,
        address _repayCToken,
        address _seizeCToken,
        uint _toMiner
    ) external discountCHI {
        oracle.postPrices(_messages, _signatures, _symbols);
        liquidateS(_borrower, _repayCToken, _seizeCToken, _toMiner);
    }
}

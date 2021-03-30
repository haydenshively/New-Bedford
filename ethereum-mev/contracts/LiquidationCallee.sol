// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";

// Import external Compound components
import "./external/compound/CERC20.sol";
import "./external/compound/CEther.sol";

// Import external Uniswap components
import "./external/uniswap/IUniswapV2Callee.sol";
import "./external/uniswap/IUniswapV2Pair.sol";
import "./external/uniswap/IUniswapV2Router02.sol";
import './external/uniswap/UniswapV2Library.sol';

import "./external/IWETH.sol";


contract LiquidationCallee is IUniswapV2Callee {
    using SafeERC20 for IERC20;

    // Known addresses --------------------------------------------------------------------
    address private constant CETH = 0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5;
    address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address private constant ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address private constant FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;

    // Boilerplate ------------------------------------------------------------------------
    receive() external payable {}

    /**
     * The function that gets called in the middle of a flash swap in order to liquidate an
     * account on Compound. This function assumes that the contract doesn't own and CTokens
     * before getting called.
     *
     * sender (address): the caller of `swap()`
     * @param amount0 (uint): the amount of token0 being borrowed
     * @param amount1 (uint): the amount of token1 being borrowed
     * @param data (bytes): data passed through from the caller
     */
    function uniswapV2Call(address /*sender*/, uint amount0, uint amount1, bytes calldata data) override external {
        // Unpack parameters sent from the `liquidate` function
        // NOTE: these are being passed in from some other contract, and cannot necessarily be trusted
        FlashSwapData memory d = abi.decode(data, (FlashSwapData));

        address token0 = IUniswapV2Pair(msg.sender).token0();
        address token1 = IUniswapV2Pair(msg.sender).token1();
        require(msg.sender == UniswapV2Library.pairFor(FACTORY, token0, token1), "Hacker no hacking");

        // Ensure that the non-WETH token is stored in token0
        if (token0 == WETH) token0 = token1;

        // mode 2: repay any, seize eth
        // mode 0: repay any, seize another (not eth)
        // mode 3: repay eth, seize any
        // mode 1: repay any, seize same

        // liquidateCombo(
        //     mode,
        //     d,
        //     token0,
        //     mode % 2 != 0 ? token0 : CERC20Storage(seizeCToken).underlying()
        // );

        // Perform the liquidation
        if (d.mode == 3) {
            IWETH(WETH).withdraw(amount0 + amount1); // equivalent to max(amount0, amount1) since one is 0
            CEther(CETH).liquidateBorrow{ value: d.repay }(d.borrower, d.seizeCToken);
        } else {
            IERC20(token0).approve(d.repayCToken, d.repay);
            CERC20(d.repayCToken).liquidateBorrow(d.borrower, d.repay, d.seizeCToken);
        }

        // Redeem cTokens for underlying ERC20 or ETH
        uint seized = CERC20(d.seizeCToken).balanceOfUnderlying(address(this));
        CERC20(d.seizeCToken).redeemUnderlying(seized);

        if (d.mode % 2 != 0) { // modes 1 and 3
            IERC20(token0).transfer(msg.sender, seized);
            return;
        }

        // Compute debt
        (uint reserveOut, uint reserveIn) = UniswapV2Library.getReserves(FACTORY, token0, WETH);
        uint debt = UniswapV2Library.getAmountIn(d.repay, reserveIn, reserveOut);

        // Pay back pair
        if (d.mode == 0) {
            tradeForWETH(CERC20Storage(d.seizeCToken).underlying(), seized, debt);
            IERC20(WETH).transfer(msg.sender, debt);
        } else { // mode 2
            IWETH(WETH).deposit{ value: debt }();
            IERC20(WETH).transfer(msg.sender, debt);
        }
    }

    struct FlashSwapData {
        uint mode;
        address borrower;
        address repayCToken;
        address seizeCToken;
        uint repay;
    }

    // function liquidateCombo(uint _mode, FlashSwapData calldata _d, address _repayToken, address _seizeToken) private {
    //     // Perform the liquidation
    //     if (mode == 3) {
    //         IWETH(WETH).withdraw(_all);
    //         CEther(CETH).liquidateBorrow{ value: _repay }(_borrower, _seizeCToken);
    //     } else {
    //         IERC20(_repayToken).approve(_d.repayCToken, _d.repay);
    //         CERC20(_d.repayCToken).liquidateBorrow(_d.borrower, _d.repay, _d.seizeCToken);
    //     }

    //     // Redeem cTokens for underlying ERC20 or ETH
    //     CERC20(_d.seizeCToken).redeemUnderlying(_d.seize);

    //     if (_mode == 3) {
    //         IERC20(_seizeToken).transfer(msg.sender, seized);
    //         return;
    //     } else if (_mode == 1) {
    //         IERC20(_repayToken).transfer(msg.sender, seized);
    //         return;
    //     }

    //     // Compute debt
    //     (uint reserveOut, uint reserveIn) = UniswapV2Library.getReserves(FACTORY, _repayToken, WETH);
    //     uint debt = UniswapV2Library.getAmountIn(_d.repay, reserveIn, reserveOut);

    //     // Pay back pair
    //     if (_mode == 2) {
    //         IWETH(WETH).deposit{ value: debt }();
    //         IERC20(WETH).transfer(msg.sender, debt);
    //     } else if (_mode == 0) {
    //         tradeForWETH(_seizeToken, seized, debt);
    //         IERC20(WETH).transfer(msg.sender, debt);
    //     }
    // }

    function tradeForWETH(address _offered, uint _exactSent, uint _minReceived) private {
        IERC20(_offered).approve(ROUTER, _exactSent);

        address[] memory path = new address[](2);
        path[0] = _offered;
        path[1] = WETH;
        IUniswapV2Router02(ROUTER).swapExactTokensForTokensSupportingFeeOnTransferTokens(
            _exactSent,
            _minReceived,
            path,
            address(this),
            block.timestamp
        );
    }
}

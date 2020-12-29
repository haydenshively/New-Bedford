// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./openzeppelin/IERC20.sol";
import "./openzeppelin/SafeERC20.sol";

// Import Compound components
import "./compound/CErc20.sol";
import "./compound/CEther.sol";

// Import Uniswap components
import './uniswap/UniswapV2Library.sol';
import "./uniswap/IUniswapV2Factory.sol";
import "./uniswap/IUniswapV2Router02.sol";
import "./uniswap/IUniswapV2Pair.sol";
import "./uniswap/IUniswapV2Callee.sol";
import "./uniswap/IWETH.sol";


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
        (address borrower, address repayCToken, address seizeCToken) = abi.decode(data, (address, address, address));

        address token0 = IUniswapV2Pair(msg.sender).token0();
        address token1 = IUniswapV2Pair(msg.sender).token1();
        require(msg.sender == IUniswapV2Factory(FACTORY).getPair(token0, token1));

        if (repayCToken == seizeCToken) {
            uint amount = amount0 != 0 ? amount0 : amount1;
            address estuary = amount0 != 0 ? token0 : token1;

            // Perform the liquidation
            IERC20(estuary).safeApprove(repayCToken, amount);
            CErc20(repayCToken).liquidateBorrow(borrower, amount, seizeCToken);

            // Redeem cTokens for underlying ERC20
            CErc20(seizeCToken).redeem(IERC20(seizeCToken).balanceOf(address(this)));

            // Compute debt and pay back pair
            unchecked { IERC20(estuary).transfer(msg.sender, (amount * 1000 / 997) + 1); }

            // Send earnings to sender (@notice disable if inheriting this contract)
            // IERC20(estuary).transfer(sender, IERC20(estuary).balanceOf(address(this)));
            return;
        }

        if (repayCToken == CETH) {
            uint amount = amount0 != 0 ? amount0 : amount1;
            address estuary = amount0 != 0 ? token1 : token0;

            // Convert WETH to ETH
            IWETH(WETH).withdraw(amount);

            // Perform the liquidation
            CEther(repayCToken).liquidateBorrow{value: amount}(borrower, seizeCToken);

            // Redeem cTokens for underlying ERC20
            CErc20(seizeCToken).redeem(IERC20(seizeCToken).balanceOf(address(this)));

            // Compute debt and pay back pair
            (uint reserveOut, uint reserveIn) = UniswapV2Library.getReserves(FACTORY, WETH, estuary);
            IERC20(estuary).transfer(msg.sender, UniswapV2Library.getAmountIn(amount, reserveIn, reserveOut));

            // Send earnings to sender (@notice disable if inheriting this contract)
            // IERC20(estuary).transfer(sender, IERC20(estuary).balanceOf(address(this)));
            return;
        }

        if (seizeCToken == CETH) {
            uint amount = amount0 != 0 ? amount0 : amount1;
            address source = amount0 != 0 ? token0 : token1;

            // Perform the liquidation
            IERC20(source).safeApprove(repayCToken, amount);
            CErc20(repayCToken).liquidateBorrow(borrower, amount, seizeCToken);

            // Redeem cTokens for underlying ETH
            uint balanceInit = address(this).balance;
            CErc20(seizeCToken).redeem(IERC20(seizeCToken).balanceOf(address(this)));

            // Convert ETH to WETH
            IWETH(WETH).deposit{ value: address(this).balance - balanceInit }();

            // Compute debt and pay back pair
            (uint reserveOut, uint reserveIn) = UniswapV2Library.getReserves(FACTORY, source, WETH);
            IERC20(WETH).transfer(msg.sender, UniswapV2Library.getAmountIn(amount, reserveIn, reserveOut));

            // Send earnings to sender (@notice disable if inheriting this contract)
            // IERC20(WETH).transfer(sender, IERC20(WETH).balanceOf(address(this)));
            return;
        }

        uint amount;
        address source;
        address estuary;
        if (amount0 != 0) {
            amount = amount0;
            source = token0;
            estuary = token1;
        } else {
            amount = amount1;
            source = token1;
            estuary = token0;
        }

        // Perform the liquidation
        IERC20(source).safeApprove(repayCToken, amount);
        CErc20(repayCToken).liquidateBorrow(borrower, amount, seizeCToken);

        // Redeem cTokens for underlying ERC20 or ETH
        uint seized_uUnits = CErc20(seizeCToken).balanceOfUnderlying(address(this));
        CErc20(seizeCToken).redeem(IERC20(seizeCToken).balanceOf(address(this)));
        address seizeUToken = CErc20Storage(seizeCToken).underlying();

        // Compute debt
        (uint reserveOut, uint reserveIn) = UniswapV2Library.getReserves(FACTORY, source, estuary);
        uint debt = UniswapV2Library.getAmountIn(amount, reserveIn, reserveOut);

        if (seizeUToken == estuary) {
            // Pay back pair
            IERC20(estuary).transfer(msg.sender, debt);
            // Send earnings to sender (@notice disable if inheriting this contract)
            // unchecked { IERC20(estuary).transfer(sender, seized_uUnits - debt); }
            return;
        }

        IERC20(seizeUToken).safeApprove(ROUTER, seized_uUnits);
        // Define swapping path
        address[] memory path = new address[](2);
        path[0] = seizeUToken;
        path[1] = estuary;
        //                                                  desired, max sent,   path, owner,     deadline
        IUniswapV2Router02(ROUTER).swapTokensForExactTokens(debt, seized_uUnits, path, address(this), block.timestamp + 1 minutes);
        IERC20(seizeUToken).safeApprove(ROUTER, 0);

        // Pay back pair
        IERC20(estuary).transfer(msg.sender, debt);
        // Send earnings to sender (@notice disable if inheriting this contract)
        // IERC20(seizeUToken).transfer(sender, IERC20(seizeUToken).balanceOf(address(this)));
    }
}

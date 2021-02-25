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
        (address borrower, address repayCToken, address seizeCToken) = abi.decode(data, (address, address, address));

        address token0 = IUniswapV2Pair(msg.sender).token0();
        address token1 = IUniswapV2Pair(msg.sender).token1();
        require(msg.sender == UniswapV2Library.pairFor(FACTORY, token0, token1), "Hacker no hacking");

        if (repayCToken == seizeCToken) {
            uint amount = amount0 != 0 ? amount0 : amount1;
            address estuary = amount0 != 0 ? token0 : token1;

            // Perform the liquidation
            IERC20(estuary).approve(repayCToken, amount);
            CERC20(repayCToken).liquidateBorrow(borrower, amount, seizeCToken);

            // Redeem cTokens for underlying ERC20
            CERC20(seizeCToken).redeem(IERC20(seizeCToken).balanceOf(address(this)));

            // Compute debt and pay back pair
            unchecked { IERC20(estuary).transfer(msg.sender, (amount * 1000 / 997) + 1); }

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
            CERC20(seizeCToken).redeem(IERC20(seizeCToken).balanceOf(address(this)));

            // Compute debt and pay back pair
            (uint reserveOut, uint reserveIn) = UniswapV2Library.getReserves(FACTORY, WETH, estuary);
            IERC20(estuary).transfer(msg.sender, UniswapV2Library.getAmountIn(amount, reserveIn, reserveOut));

            return;
        }

        if (seizeCToken == CETH) {
            uint amount = amount0 != 0 ? amount0 : amount1;
            address source = amount0 != 0 ? token0 : token1;

            // Perform the liquidation
            IERC20(source).approve(repayCToken, amount);
            CERC20(repayCToken).liquidateBorrow(borrower, amount, seizeCToken);

            // Redeem cTokens for underlying ETH
            uint balanceInit = address(this).balance;
            CERC20(seizeCToken).redeem(IERC20(seizeCToken).balanceOf(address(this)));

            // Convert ETH to WETH
            IWETH(WETH).deposit{ value: address(this).balance - balanceInit }();

            // Compute debt and pay back pair
            (uint reserveOut, uint reserveIn) = UniswapV2Library.getReserves(FACTORY, source, WETH);
            IERC20(WETH).transfer(msg.sender, UniswapV2Library.getAmountIn(amount, reserveIn, reserveOut));

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
        IERC20(source).approve(repayCToken, amount);
        CERC20(repayCToken).liquidateBorrow(borrower, amount, seizeCToken);

        // Redeem cTokens for underlying ERC20 or ETH
        uint seized_uUnits = CERC20(seizeCToken).balanceOfUnderlying(address(this));
        CERC20(seizeCToken).redeem(IERC20(seizeCToken).balanceOf(address(this)));

        // Compute debt
        (uint reserveOut, uint reserveIn) = UniswapV2Library.getReserves(FACTORY, source, estuary);
        uint debt = UniswapV2Library.getAmountIn(amount, reserveIn, reserveOut);

        // Nested trade if necessary
        address seizeToken = CERC20Storage(seizeCToken).underlying();
        if (seizeToken != estuary) trade(seizeToken, estuary, seized_uUnits, debt);

        IERC20(estuary).transfer(msg.sender, debt);
    }

    function trade(address _offered, address _desired, uint _maxSent, uint _exactReceived) private {
        IERC20(_offered).approve(ROUTER, _maxSent);

        address[] memory path = new address[](2);
        path[0] = _offered;
        path[1] = _desired;
        IUniswapV2Router02(ROUTER).swapTokensForExactTokens(
            _exactReceived,
            _maxSent,
            path,
            address(this),
            block.timestamp
        );
    }
}

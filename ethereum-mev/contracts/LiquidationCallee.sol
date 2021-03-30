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
        (address borrower, address repayCToken, address seizeCToken, uint repay) = abi.decode(data, (address, address, address, uint));

        address token0 = IUniswapV2Pair(msg.sender).token0();
        address token1 = IUniswapV2Pair(msg.sender).token1();
        require(msg.sender == UniswapV2Library.pairFor(FACTORY, token0, token1), "Hacker no hacking");

        if (repayCToken == seizeCToken) {
            if (token0 == WETH) {
                liquidateTypeA(borrower, repayCToken, seizeCToken, token1, amount1); // amount1 = repay
                IWETH(WETH).withdraw(amount0);
            } else {
                liquidateTypeA(borrower, repayCToken, seizeCToken, token0, amount0); // amount0 = repay
                IWETH(WETH).withdraw(amount1);
            }
            return;
        }

        if (repayCToken == CETH) {
            // Either amount0 or amount1 will be 0, so summing results in the larger of the 2
            liquidateTypeB(
                borrower,
                seizeCToken,
                token0 == WETH ? token1 : token0,
                amount0 + amount1,
                repay
            );
            return;
        }

        if (seizeCToken == CETH) {
            liquidateTypeC(
                borrower,
                repayCToken,
                seizeCToken,
                token0 == WETH ? token1 : token0,
                repay // repay = amount0 + amount1
            );
            return;
        }

        liquidateTypeD(
            borrower,
            repayCToken,
            seizeCToken,
            token0 == WETH ? token1 : token0,
            CERC20Storage(seizeCToken).underlying(),
            repay // repay = amount0 + amount1
        );
        IWETH(WETH).withdraw(IERC20(WETH).balanceOf(address(this)));
    }

    function liquidateTypeA(address _borrower, address _repayCToken, address _seizeCToken, address _repayToken, uint _repay) private {
        // Perform the liquidation
        IERC20(_repayToken).approve(_repayCToken, _repay);
        CERC20(_repayCToken).liquidateBorrow(_borrower, _repay, _seizeCToken);

        // Redeem cTokens for underlying ERC20
        uint seized = CERC20(_seizeCToken).balanceOfUnderlying(address(this));
        CERC20(_seizeCToken).redeemUnderlying(seized);

        // Pay back pair
        IERC20(_repayToken).transfer(msg.sender, seized);
    }

    function liquidateTypeB(address _borrower, address _seizeCToken, address _seizeToken, uint _all, uint _repay) private {
        // Convert WETH to ETH
        IWETH(WETH).withdraw(_all);

        // Perform the liquidation
        CEther(CETH).liquidateBorrow{value: _repay}(_borrower, _seizeCToken);

        // Redeem cTokens for underlying ERC20
        uint seized = CERC20(_seizeCToken).balanceOfUnderlying(address(this));
        CERC20(_seizeCToken).redeemUnderlying(seized);

        // Pay back pair
        IERC20(_seizeToken).transfer(msg.sender, seized);
    }

    function liquidateTypeC(address _borrower, address _repayCToken, address _seizeCToken, address _repayToken, uint _repay) private {
        // Perform the liquidation
        IERC20(_repayToken).approve(_repayCToken, _repay);
        CERC20(_repayCToken).liquidateBorrow(_borrower, _repay, _seizeCToken);

        // Redeem cTokens for underlying ETH
        uint seized = CERC20(_seizeCToken).balanceOfUnderlying(address(this));
        CERC20(_seizeCToken).redeemUnderlying(seized);

        // Convert enough ETH to WETH to pay off debt
        (uint reserveOut, uint reserveIn) = UniswapV2Library.getReserves(FACTORY, _repayToken, WETH);
        uint debt = UniswapV2Library.getAmountIn(_repay, reserveIn, reserveOut);
        IWETH(WETH).deposit{ value: debt }();

        // Pay back pair
        IERC20(WETH).transfer(msg.sender, debt);

        // seized - debt is leftover ETH
    }

    function liquidateTypeD(address _borrower, address _repayCToken, address _seizeCToken, address _repayToken, address _seizeToken, uint _repay) private {
        // Perform the liquidation
        IERC20(_repayToken).approve(_repayCToken, _repay);
        CERC20(_repayCToken).liquidateBorrow(_borrower, _repay, _seizeCToken);

        // Redeem cTokens for underlying ERC20 or ETH
        uint seized = CERC20(_seizeCToken).balanceOfUnderlying(address(this));
        CERC20(_seizeCToken).redeemUnderlying(seized);

        // Compute debt
        (uint reserveOut, uint reserveIn) = UniswapV2Library.getReserves(FACTORY, _repayToken, WETH);
        uint debt = UniswapV2Library.getAmountIn(_repay, reserveIn, reserveOut);

        // Nested trade and pay back pair
        tradeForWETH(_seizeToken, seized, debt);
        IERC20(WETH).transfer(msg.sender, debt);
    }

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

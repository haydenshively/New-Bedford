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

    uint private constant FUZZY_NUM = 999;

    uint private constant FUZZY_DEN = 1000;

    address payable private owner;

    Comptroller public comptroller;

    UniswapAnchoredView public oracle;

    uint private closeFact;

    uint private liqIncent;

    uint private totalMinted;

    uint private totalBurned;

    event Revenue(uint amount);

    modifier discountCHI {
        uint x = gasleft();
        _;
        unchecked {
            x = (21000 + x - gasleft() + 16 * msg.data.length + 14154) / 41947;
            if (x > totalMinted - totalBurned) x = totalMinted - totalBurned;
        }

        if (x != 0) _destroyChildren(x);
    }

    constructor() {
        owner = payable(0xF1c73bb23934127A2C1Fa4bA7520822574fE9bA7);
        _setComptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);
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
            if (b == 0 || b == 1)
                IWETH(WETH).withdraw(IERC20(WETH).balanceOf(address(this)));
            
            c = address(this).balance - a;
            block.coinbase.transfer(c * _toMiner / 10_000);
            emit Revenue(c);
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

    // https://github.com/1inch/chi/blob/master/contracts/ChiToken.sol
    function mintCHI(uint256 value) external {
        uint256 offset = totalMinted;
        assembly {
            mstore(0, add(
                add(
                    0x746d000000000000000000000000000000000000000000000000000000000000,
                    shl(0x80, address())
                ),
                0x3318585733ff6000526015600bf30000
            ))

            for {let i := div(value, 32)} i {i := sub(i, 1)} {
                pop(create2(0, 0, 30, add(offset, 0))) pop(create2(0, 0, 30, add(offset, 1)))
                pop(create2(0, 0, 30, add(offset, 2))) pop(create2(0, 0, 30, add(offset, 3)))
                pop(create2(0, 0, 30, add(offset, 4))) pop(create2(0, 0, 30, add(offset, 5)))
                pop(create2(0, 0, 30, add(offset, 6))) pop(create2(0, 0, 30, add(offset, 7)))
                pop(create2(0, 0, 30, add(offset, 8))) pop(create2(0, 0, 30, add(offset, 9)))
                pop(create2(0, 0, 30, add(offset, 10))) pop(create2(0, 0, 30, add(offset, 11)))
                pop(create2(0, 0, 30, add(offset, 12))) pop(create2(0, 0, 30, add(offset, 13)))
                pop(create2(0, 0, 30, add(offset, 14))) pop(create2(0, 0, 30, add(offset, 15)))
                pop(create2(0, 0, 30, add(offset, 16))) pop(create2(0, 0, 30, add(offset, 17)))
                pop(create2(0, 0, 30, add(offset, 18))) pop(create2(0, 0, 30, add(offset, 19)))
                pop(create2(0, 0, 30, add(offset, 20))) pop(create2(0, 0, 30, add(offset, 21)))
                pop(create2(0, 0, 30, add(offset, 22))) pop(create2(0, 0, 30, add(offset, 23)))
                pop(create2(0, 0, 30, add(offset, 24))) pop(create2(0, 0, 30, add(offset, 25)))
                pop(create2(0, 0, 30, add(offset, 26))) pop(create2(0, 0, 30, add(offset, 27)))
                pop(create2(0, 0, 30, add(offset, 28))) pop(create2(0, 0, 30, add(offset, 29)))
                pop(create2(0, 0, 30, add(offset, 30))) pop(create2(0, 0, 30, add(offset, 31)))
                offset := add(offset, 32)
            }

            for {let i := and(value, 0x1F)} i {i := sub(i, 1)} {
                pop(create2(0, 0, 30, offset))
                offset := add(offset, 1)
            }
        }

        totalMinted = offset;
    }

    // https://github.com/1inch/chi/blob/master/contracts/ChiToken.sol
    function _destroyChildren(uint256 value) private {
        assembly {
            let i := sload(totalBurned.slot)
            let end := add(i, value)
            sstore(totalBurned.slot, end)

            let data := mload(0x40)
            mstore(data, add(
                0xff00000000000000000000000000000000000000000000000000000000000000,
                shl(0x58, address())
            ))
            mstore(add(data, 53), add(
                add(
                    0x746d000000000000000000000000000000000000000000000000000000000000,
                    shl(0x80, address())
                ),
                0x3318585733ff6000526015600bf30000
            ))
            mstore(add(data, 53), keccak256(add(data, 53), 30))

            let ptr := add(data, 21)
            for { } lt(i, end) { i := add(i, 1) } {
                mstore(ptr, i)
                pop(call(gas(), keccak256(data, 85), 0, 0, 0, 0, 0))
            }
        }
    }
}

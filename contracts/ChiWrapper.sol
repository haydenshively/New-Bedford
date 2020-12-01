// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.10;
// For PriceOracle postPrices()
pragma experimental ABIEncoderV2;

// Import the ERC20 interface and and SafeMath library
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";


interface Chi {
    function free(uint256 value) external returns (uint256);
    function freeUpTo(uint256 value) external returns (uint256);
    function freeFrom(address from, uint256 value) external returns (uint256);
    function freeFromUpTo(address from, uint256 value) external returns (uint256);
}


interface IFlashLiquidator {
    function liquidateManyWithPriceUpdate(
        bytes[] calldata _messages,
        bytes[] calldata _signatures,
        string[] calldata _symbols,
        address[] calldata _borrowers,
        address[] calldata _cTokens
    ) external;

    function liquidateMany(address[] calldata _borrowers, address[] calldata _cTokens) external;

    function liquidate(address _borrower, address _repayCToken, address _seizeCToken, uint256 _amount) external;
}


contract ChiWrapper {

    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    address private constant CHI = 0x0000000000004946c0e9F43F4Dee607b0eF1fA1c;
    IFlashLiquidator private immutable liquidator;

    modifier discountCHI {
        uint256 gasStart = gasleft();
        _;
        uint256 gasSpent = 21000 + gasStart - gasleft() + 16 * msg.data.length;
        Chi(CHI).freeFromUpTo(msg.sender, (gasSpent + 14154) / 41947);
    }

    constructor(address _flashLiquidator) public {
        liquidator = IFlashLiquidator(_flashLiquidator);
    }

    function liquidateManyWithPriceUpdate(
        bytes[] calldata _messages,
        bytes[] calldata _signatures,
        string[] calldata _symbols,
        address[] calldata _borrowers,
        address[] calldata _cTokens
    ) public discountCHI {
        liquidator.liquidateManyWithPriceUpdate(_messages, _signatures, _symbols, _borrowers, _cTokens);
    }

    function liquidateMany(address[] calldata _borrowers, address[] calldata _cTokens) public discountCHI {
        liquidator.liquidateMany(_borrowers, _cTokens);
    }

    function liquidate(address _borrower, address _repayCToken, address _seizeCToken, uint256 _amount) public discountCHI {
        liquidator.liquidate(_borrower, _repayCToken, _seizeCToken, _amount);
    }
}

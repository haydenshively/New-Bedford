// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./openzeppelin/IERC20.sol";
import "./openzeppelin/SafeERC20.sol";

// Import Compound components
import "./compound/CErc20.sol";
import "./compound/Comptroller.sol";
import "./compound/PriceOracle.sol";

// Import Uniswap components
import "./uniswap/UniswapV2Library.sol";
import "./uniswap/IUniswapV2Factory.sol";
import "./uniswap/IUniswapV2Pair.sol";

import "./ICHI.sol";


interface ITreasury {
    function payoutMax(address _asset) external;
}


contract Liquidator {
    using SafeERC20 for IERC20;

    // Known addresses --------------------------------------------------------------------
    address private constant CHI = 0x0000000000004946c0e9F43F4Dee607b0eF1fA1c;
    address private constant ETH = address(0);
    address private constant CETH = 0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5;
    address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address private constant ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address private constant FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;

    // Constant parameters ----------------------------------------------------------------
    uint private constant SLIPPAGE_THRESHOLD_FACT = 985; // = (1 - 1/sqrt(1.02)) for 2% slippage. Multiply by 100000 to get integer
    address payable private immutable treasury;

    // Configurable parameters ------------------------------------------------------------
    Comptroller public comptroller;
    PriceOracle public priceOracle;

    uint private closeFact;
    uint private liqIncent;
    uint private gasThreshold = 2000000;

    // Modifiers --------------------------------------------------------------------------
    modifier onlyTreasury() {
        require(msg.sender == treasury, "Nantucket: Not an owner");
        _;
    }

    modifier discountCHI {
        uint gasStart = gasleft();
        _;
        uint gasSpent = 21000 + gasStart - gasleft() + 16 * msg.data.length;
        ICHI(CHI).freeFromUpTo(treasury, (gasSpent + 14154) / 41947);
    }

    // Constructor ------------------------------------------------------------------------
    constructor(address payable _treasury, address _comptrollerAddress) {
        treasury = _treasury;
        _setComptroller(_comptrollerAddress);
    }

    // onlyTreasury functions -------------------------------------------------------------
    function kill() external onlyTreasury {
        // Delete the contract and send any available Eth to treasury
        selfdestruct(treasury);
    }

    function _setComptroller(address _comptrollerAddress) private {
        comptroller = Comptroller(_comptrollerAddress);
        priceOracle = PriceOracle(comptroller.oracle());
        closeFact = comptroller.closeFactorMantissa();
        liqIncent = comptroller.liquidationIncentiveMantissa();
    }

    function setComptroller(address _comptrollerAddress) external onlyTreasury {
        _setComptroller(_comptrollerAddress);
    }

    function setGasThreshold(uint _gasThreshold) external onlyTreasury {
        gasThreshold = _gasThreshold;
    }

    // Liquidation functions --------------------------------------------------------------
    function liquidateSNWithPrice(
        bytes[] calldata _messages,
        bytes[] calldata _signatures,
        string[] calldata _symbols,
        address[] calldata _borrowers,
        address[] calldata _cTokens
    ) external {
        priceOracle.postPrices(_messages, _signatures, _symbols);
        liquidateSN(_borrowers, _cTokens);
    }

    function liquidateSN(address[] calldata _borrowers, address[] calldata _cTokens) public {
        uint i;

        while (true) {
            liquidateS(_borrowers[i], _cTokens[i * 2], _cTokens[i * 2 + 1]);
            if (gasleft() < gasThreshold || i + 1 == _borrowers.length) break;
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
        priceOracle.postPrices(_messages, _signatures, _symbols);
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
        ( , , uint shortfall) = comptroller.getAccountLiquidity(_borrower);
        if (shortfall == 0) return;
        // uint(10**18) adjustments ensure that all place values are dedicated
        // to repay and seize precision rather than unnecessary closeFact and liqIncent decimals
        uint repayMax = CErc20(_repayCToken).borrowBalanceCurrent(_borrower) * closeFact / uint(10**18);
        uint seizeMax = CErc20(_seizeCToken).balanceOfUnderlying(_borrower) * uint(10**18) / liqIncent;

        uint uPriceRepay = priceOracle.getUnderlyingPrice(_repayCToken);
        // Gas savings -- instead of making new vars `repayMax_Eth` and `seizeMax_Eth` just reassign
        repayMax *= uPriceRepay;
        seizeMax *= priceOracle.getUnderlyingPrice(_seizeCToken);

        // Gas savings -- instead of creating new var `repay_Eth = repayMax < seizeMax ? ...` and then
        // converting to underlying units by dividing by uPriceRepay, we can do it all in one step
        liquidate(_borrower, _repayCToken, _seizeCToken, ((repayMax < seizeMax) ? repayMax : seizeMax) / uPriceRepay);
    }

    /**
     * Liquidate a Compound user with a flash swap
     *
     * @param _borrower (address): the Compound user to liquidate
     * @param _repayCToken (address): a CToken for which the user is in debt
     * @param _seizeCToken (address): a CToken for which the user has a supply balance
     * @param _amount (uint): the amount (specified in units of _repayCToken.underlying) to flash loan and pay off
     */
    function liquidate(address _borrower, address _repayCToken, address _seizeCToken, uint _amount) public {
        address pair;
        address r;

        if (_repayCToken == _seizeCToken || _seizeCToken == CETH) {
            r = CErc20Storage(_repayCToken).underlying();
            pair = UniswapV2Library.pairFor(FACTORY, r, WETH);
        }
        else if (_repayCToken == CETH) {
            r = WETH;
            pair = UniswapV2Library.pairFor(FACTORY, WETH, CErc20Storage(_seizeCToken).underlying());
        }
        else {
            r = CErc20Storage(_repayCToken).underlying();
            uint maxBorrow;
            (maxBorrow, , pair) = UniswapV2Library.getReservesWithPair(FACTORY, r, CErc20Storage(_seizeCToken).underlying());

            if (_amount * 100000 > maxBorrow * SLIPPAGE_THRESHOLD_FACT) pair = IUniswapV2Factory(FACTORY).getPair(r, WETH);
        }

        // Initiate flash swap
        bytes memory data = abi.encode(_borrower, _repayCToken, _seizeCToken);
        uint amount0 = IUniswapV2Pair(pair).token0() == r ? _amount : 0;
        uint amount1 = IUniswapV2Pair(pair).token1() == r ? _amount : 0;

        IUniswapV2Pair(pair).swap(amount0, amount1, treasury, data);
        payout(_seizeCToken);
    }

    function payout(address _seizeCToken) internal {
        if (_seizeCToken == CETH) ITreasury(treasury).payoutMax(WETH);
        else ITreasury(treasury).payoutMax(CErc20Storage(_seizeCToken).underlying());
    }

    // MARK - Chi functions ------------------------------------------------------------------------

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
        priceOracle.postPrices(_messages, _signatures, _symbols);
        liquidateS(_borrower, _repayCToken, _seizeCToken);
    }

    function liquidateSNWithPriceChi(
        bytes[] calldata _messages,
        bytes[] calldata _signatures,
        string[] calldata _symbols,
        address[] calldata _borrowers,
        address[] calldata _cTokens
    ) external discountCHI {
        priceOracle.postPrices(_messages, _signatures, _symbols);
        liquidateSN(_borrowers, _cTokens);
    }
}

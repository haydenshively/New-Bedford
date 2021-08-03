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

    address private constant CHI = 0x0000000000004946c0e9F43F4Dee607b0eF1fA1c;

    address payable private immutable treasury;

    Comptroller public comptroller;

    UniswapAnchoredView public oracle;

    uint private closeFact;

    uint private liqIncent;

    uint private gasThreshold = 2000000;

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

    function setGasThreshold(uint _gasThreshold) external onlyTreasury {
        gasThreshold = _gasThreshold;
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
        ( , , uint shortfall) = comptroller.getAccountLiquidity(_borrower);
        if (shortfall == 0) return;

        uint seizeTokensPerRepayToken = oracle.getUnderlyingPrice(_repayCToken) * liqIncent / oracle.getUnderlyingPrice(_seizeCToken); // 18 extra decimals

        uint repay_BorrowConstrained = CERC20(_repayCToken).borrowBalanceStored(_borrower) * closeFact / 1e18; // 0 extra decimals
        uint repay_SupplyConstrained = CERC20(_seizeCToken).balanceOf(_borrower) * CERC20(_seizeCToken).exchangeRateStored() / seizeTokensPerRepayToken; // 0 extra decimals
        
        uint repay = repay_BorrowConstrained < repay_SupplyConstrained ? repay_BorrowConstrained : repay_SupplyConstrained;
        uint seize = repay * seizeTokensPerRepayToken / 1e18;

        liquidate(_borrower, _repayCToken, _seizeCToken, repay, seize);
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
    ) public {
        (address pair, address flashToken, uint maxSwap) = selectPairSlippageAware(_repayCToken, _seizeCToken, _seize);

        /**
         * If we would have to pay more than a 5% premium to swap _seize,
         * then lower _seize such that it sits right at the 5% premium.
         * (_seize is lowered naturally by lowering _repay)
         *
         * NOTE: Even if the liquidation incentive is > 5%, there is no
         *      guarantee that the trade will go through. This is because
         *      Compound may price assets differently than Uniswap.
         *
         *      In general that would occur when the seized asset is dropping
         *      in value on Coinbase faster than it is dropping on Uniswap.
         *
         *      To cover that case, we would need to set the liquidation
         *      incentive as high as the Open Price Feed's anchor bounds.
         *      20% is much too high, so we leave this problem for V2.
         */
        if (_seize > maxSwap) _repay = maxSwap * _repay / _seize;

        // Initiate flash swap
        bytes memory data = abi.encode(_borrower, _repayCToken, _seizeCToken);
        uint amount0 = IUniswapV2Pair(pair).token0() == flashToken ? _repay : 0;
        uint amount1 = IUniswapV2Pair(pair).token1() == flashToken ? _repay : 0;

        IUniswapV2Pair(pair).swap(amount0, amount1, treasury, data);
        payout(_seizeCToken);
    }

    function payout(address _seizeCToken) internal {
        if (_seizeCToken == CETH) ITreasury(treasury).payoutMax(WETH);
        else ITreasury(treasury).payoutMax(CERC20Storage(_seizeCToken).underlying());
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

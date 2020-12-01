// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.10;
// For PriceOracle postPrices()
pragma experimental ABIEncoderV2;

// Import Compound components
import "./compound/CErc20.sol";
import "./compound/CEther.sol";
import "./compound/Comptroller.sol";
import "./compound/PriceOracle.sol";

// Import Uniswap components
import './uniswap/UniswapV2Library.sol';
import "./uniswap/IUniswapV2Factory.sol";
import "./uniswap/IUniswapV2Router02.sol";
import "./uniswap/IUniswapV2Callee.sol";
import "./uniswap/IUniswapV2Pair.sol";
import "./uniswap/IWETH.sol";


interface Chi {
    function free(uint value) external returns (uint);
    function freeUpTo(uint value) external returns (uint);
    function freeFrom(address from, uint value) external returns (uint);
    function freeFromUpTo(address from, uint value) external returns (uint);
}


contract Liquidator is IUniswapV2Callee {

    struct RecipientChange {
        address payable recipient;
        uint waitingPeriodEnd;
        bool pending;
    }

    using SafeERC20 for IERC20;

    address private constant CHI = 0x0000000000004946c0e9F43F4Dee607b0eF1fA1c;
    address constant private ETHER = address(0);
    address constant private CETH = 0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5;
    address constant private WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant private ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address constant private FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    uint constant private RECIP_CHANGE_WAIT_PERIOD = 24 hours;
    // Coefficient = (1 - 1/sqrt(1.02)) for 2% slippage. Multiply by 100000 to get integer
    uint constant private SLIPPAGE_THRESHOLD_FACT = 985;

    address payable private recipient;
    RecipientChange public recipientChange;

    Comptroller public comptroller;
    PriceOracle public priceOracle;

    uint private closeFact;
    uint private liqIncent;
    uint private gasThreshold = 2000000;

    event RevenueWithdrawn(
        address recipient,
        address token,
        uint amount
    );
    event RecipientChanged(
        address recipient
    );

    modifier onlyRecipient() {
        require(
            msg.sender == recipient,
            "Nantucket: Unauthorized"
        );
        _;
    }

    modifier discountCHI {
        uint256 gasStart = gasleft();
        _;
        uint256 gasSpent = 21000 + gasStart - gasleft() + 16 * msg.data.length;
        Chi(CHI).freeFromUpTo(msg.sender, (gasSpent + 14154) / 41947);
    }

    constructor() public {
        recipient = msg.sender;

        comptroller = Comptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);
        priceOracle = PriceOracle(comptroller.oracle());
        closeFact = comptroller.closeFactorMantissa();
        liqIncent = comptroller.liquidationIncentiveMantissa();
    }

    receive() external payable {}

    function kill() external onlyRecipient {
        // Delete the contract and send any available Eth to recipient
        selfdestruct(recipient);
    }

    function initiateRecipientChange(address payable _recipient) external onlyRecipient returns (address) {
        recipientChange = RecipientChange(_recipient, now + RECIP_CHANGE_WAIT_PERIOD, true);
        return recipientChange.recipient;
    }

    function confirmRecipientChange() external onlyRecipient {
        require(recipientChange.pending, "Nantucket: Initiate change first");
        require(now > recipientChange.waitingPeriodEnd, "Nantucket: Wait longer");
        
        recipient = recipientChange.recipient;
        emit RecipientChanged(recipient);

        // Clear the recipientChange struct. Equivalent to re-declaring it without initialization
        delete recipientChange;
    }

    function setComptroller(address _comptrollerAddress) external onlyRecipient {
        comptroller = Comptroller(_comptrollerAddress);
        priceOracle = PriceOracle(comptroller.oracle());
        closeFact = comptroller.closeFactorMantissa();
        liqIncent = comptroller.liquidationIncentiveMantissa();
    }

    function setGasThreshold(uint _gasThreshold) external onlyRecipient {
        gasThreshold = _gasThreshold;
    }

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
        ( , uint liquidity, ) = comptroller.getAccountLiquidity(_borrower);
        if (liquidity != 0) return;
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

        IUniswapV2Pair(pair).swap(amount0, amount1, address(this), data);
    }

    /**
     * The function that gets called in the middle of a flash swap
     *
     * @param sender (address): the caller of `swap()`
     * @param amount0 (uint): the amount of token0 being borrowed
     * @param amount1 (uint): the amount of token1 being borrowed
     * @param data (bytes): data passed through from the caller
     */
    function uniswapV2Call(address sender, uint amount0, uint amount1, bytes calldata data) override external {
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
            IERC20(estuary).transfer(msg.sender, (amount * 1000 / 997) + 1);
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
            return;
        }

        if (seizeCToken == CETH) {
            uint amount = amount0 != 0 ? amount0 : amount1;
            address source = amount0 != 0 ? token0 : token1;

            // Perform the liquidation
            IERC20(source).safeApprove(repayCToken, amount);
            CErc20(repayCToken).liquidateBorrow(borrower, amount, seizeCToken);

            // Redeem cTokens for underlying ERC20 or ETH
            CErc20(seizeCToken).redeem(IERC20(seizeCToken).balanceOf(address(this)));

            // Convert ETH to WETH
            IWETH(WETH).deposit{value: address(this).balance}();

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
            return;
        }

        IERC20(seizeUToken).safeApprove(ROUTER, seized_uUnits);
        // Define swapping path
        address[] memory path = new address[](2);
        path[0] = seizeUToken;
        path[1] = estuary;
        //                                                  desired, max sent,   path, recipient,     deadline
        IUniswapV2Router02(ROUTER).swapTokensForExactTokens(debt, seized_uUnits, path, address(this), now + 1 minutes);
        IERC20(seizeUToken).safeApprove(ROUTER, 0);

        // Pay back pair
        IERC20(estuary).transfer(msg.sender, debt);
    }

    function withdraw(address _assetAddress) external {
        uint assetBalance;
        if (_assetAddress == ETHER) {
            address self = address(this); // workaround for a possible solidity bug
            assetBalance = self.balance;
            recipient.transfer(assetBalance);
        } else {
            assetBalance = IERC20(_assetAddress).balanceOf(address(this));
            IERC20(_assetAddress).safeTransfer(recipient, assetBalance);
        }
        emit RevenueWithdrawn(recipient, _assetAddress, assetBalance);
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
    ) external {
        uint gasStart1 = gasleft();
        priceOracle.postPrices(_messages, _signatures, _symbols);

        uint gasStart2 = gasleft();
        Chi(CHI).freeFromUpTo(msg.sender, (gasStart1 - gasleft()) / 41947);
        liquidateS(_borrower, _repayCToken, _seizeCToken);
        
        uint gasSpent = 21000 + gasStart2 - gasleft() + 16 * msg.data.length;
        Chi(CHI).freeFromUpTo(msg.sender, (gasSpent + 14154) / 41947);
    }

    function liquidateSNWithPriceChi(
        bytes[] calldata _messages,
        bytes[] calldata _signatures,
        string[] calldata _symbols,
        address[] calldata _borrowers,
        address[] calldata _cTokens
    ) external {
        uint gasStart1 = gasleft();
        priceOracle.postPrices(_messages, _signatures, _symbols);

        uint gasStart2 = gasleft();
        Chi(CHI).freeFromUpTo(msg.sender, (gasStart1 - gasleft()) / 41947);
        liquidateSN(_borrowers, _cTokens);
        
        uint gasSpent = 21000 + gasStart2 - gasleft() + 16 * msg.data.length;
        Chi(CHI).freeFromUpTo(msg.sender, (gasSpent + 14154) / 41947);
    }
}

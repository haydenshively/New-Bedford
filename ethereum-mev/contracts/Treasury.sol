// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";

import "./external/ICHI.sol";

import "./Incognito.sol";
import "./LiquidationCallee.sol";


contract Treasury is LiquidationCallee {
    using SafeERC20 for IERC20;

    // Events -----------------------------------------------------------------------------
    event AllowanceUpdated(uint allowance);
    event LiquidatorUpdated(address liquidator);
    event FundsAdded(uint amount);
    event FundsRemoved(uint amount);
    event ChiMinted(uint amount);
    event RevenueDistributed(address asset, uint amount);

    // Known addresses --------------------------------------------------------------------
    address private constant CHI = 0x0000000000004946c0e9F43F4Dee607b0eF1fA1c;
    address private constant ETH = address(0);

    address payable private owner;

    address payable private caller;
    uint private callerAllowance = 2 ether;

    uint public balanceStored;

    address payable public liquidator;
    address payable public liquidatorWrapper;

    constructor(address payable _owner) {
        owner = _owner;
        caller = payable(msg.sender);
    }

    // ------------------------------------------------------------------------------------
    // MARK: Owner privileges -------------------------------------------------------------

    // Allows owner to change their address
    function changeOwner(address payable _newOwner) external {
        if (msg.sender == owner) owner = _newOwner;
    }

    // Allows owner to change the caller allowance
    function setCallerAllowance(uint _amount) external {
        require(msg.sender == owner, "Treasury: Not owner");
        callerAllowance = _amount;
        // logging
        emit AllowanceUpdated(_amount);
    }

    // Allows owners to change the liquidator
    function setLiquidator(address payable _liquidator) external {
        require(msg.sender == owner, "Treasury: Not owner");
        liquidator = _liquidator;
        liquidatorWrapper = payable(new Incognito(liquidator));
        
        IERC20(CHI).approve(_liquidator, type(uint256).max);
        // logging
        emit LiquidatorUpdated(_liquidator);
    }

    // ------------------------------------------------------------------------------------
    // MARK: Funding functions ------------------------------------------------------------

    // Allows any address to provide ETH to the treasury
    function fund(address _owner) external payable {
        // reject ETH if _owner is unknown
        require(_owner == owner, "Treasury: Not owner");
        // update balance
        balanceStored += msg.value;
        // logging
        emit FundsAdded(msg.value);
    }

    // Allows owner to take back ETH that they previously provided (as long as it hasn't
    // been sent/spent already)
    function unfund(uint _amount) external {
        if (msg.sender == owner) {
            if (_amount > balanceStored) _amount = balanceStored;
            owner.transfer(_amount);
            balanceStored -= _amount;
            // logging
            emit FundsRemoved(_amount);
        }
    }

    // Sort of like spending funds (doing the math for that) but not actually sending them
    // anywhere in this function. Just adjusting balances.
    // @return The actual amount deducted (differs from input arg if `balanceStored` too small)
    function _deduct(uint _amount) private returns (uint) {
        if (balanceStored == 0) return 0;
        if (_amount > balanceStored) _amount = balanceStored;

        balanceStored -= _amount;

        return _amount;
    }

    // ------------------------------------------------------------------------------------
    // MARK: Caller interaction -----------------------------------------------------------

    // Send funds to the caller (the EOA that initiates liquidations)
    function _send(uint _amount) private {
        caller.transfer(_deduct(_amount));
    }

    // Re-wrap the liquidator contract by creating a new proxy contract
    function _rewrapLiquidator() private {
        // save address of existing proxy so that we can kill it later
        address payable temp = liquidatorWrapper;
        // instantiate a new one
        liquidatorWrapper = payable(new Incognito(liquidator));
        // now kill old one to save gas
        Incognito(temp).kill();
    }

    // Switch to a new caller (specified by `_caller`), give the new caller its allowance,
    // and generate a new incognito liquidator proxy contract
    // @notice This function is payable. If the current caller still has some funds left,
    //      it can send them in this function call and they'll get distributed to the next
    //      caller
    function changeIdentity(address payable _caller) external payable {
        require(tx.origin == caller, "Treasury: Not caller");
        caller = _caller;

        // put leftover funds back into stored balances
        balanceStored += msg.value;
        // now use all available funds to try to give new caller its allowance
        _send(callerAllowance);

        // re-wrap liquidator at the end for maximum gas savings
        _rewrapLiquidator();
    }

    // ------------------------------------------------------------------------------------
    // MARK: Payout functions -------------------------------------------------------------

    // Distribute revenue to owners according to current share distribution
    // @param _asset The address of the asset to distribute, could be ETH
    // @param _amount The amount of that asset to distribute
    // @notice _amount is only checked for ETH
    function payout(address _asset, uint _amount) public {
        // No need to check for overflow here unless we plan to be bazillionaires
        unchecked {
            if (_asset == ETH) {
                // Payouts should never eat into active funds
                uint maxPayout = address(this).balance - balanceStored;
                if (_amount > maxPayout) _amount = maxPayout;

                owner.transfer(_amount);
            } else if (_asset == 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2) {
                IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2).withdraw(_amount);
                owner.transfer(_amount);
                emit RevenueDistributed(ETH, _amount);
                return;
            } else {
                IERC20(_asset).transfer(owner, _amount);
            }
            // logging
            emit RevenueDistributed(_asset, _amount);
        }
    }

    // Distribute all revenue to owners according to the current share distribution
    // @param _asset The address of the asset to distribute, could be ETH
    function payoutMax(address _asset) public {
        // For ETH, `payout` will check balance and fund size to restrict actual
        // amount. To save gas, no need to do same computation here. Just pass max.
        if (_asset == ETH) payout(_asset, type(uint256).max);
        // For ERC20's we have to compute appropriate amount here.
        else payout(_asset, IERC20(_asset).balanceOf(address(this)));
    }

    // ------------------------------------------------------------------------------------
    // MARK: CHI functions ----------------------------------------------------------------

    // Allows any address to mint CHI. Transaction fees are reimbursed to owner. Cannot
    // mint more than 100 CHI at a time. Cannot have more than 400 CHI total.
    function mintCHI(address payable _owner, uint _amount) external {
        uint gasStart = gasleft();

        require(_owner == owner, "Treasury: Not owner");
        require(_amount <= 50, "Treasury: Mint too much");
        require(IERC20(CHI).balanceOf(address(this)) + _amount <= 400, "Treasury: CHI vault is full");

        ICHI(CHI).mint(_amount);

        uint fee = tx.gasprice * (21000 + gasStart - gasleft() + 16 * msg.data.length);
        _owner.transfer(_deduct(fee));
        // logging
        emit ChiMinted(_amount);
    }

    // ------------------------------------------------------------------------------------
    // MARK: Liquidator admin functions ---------------------------------------------------
    function callLiquidator(address _target, bytes calldata _command) external {
        require(msg.sender == owner, "Treasury: Not owner");
        _target.call(_command);
    }
}

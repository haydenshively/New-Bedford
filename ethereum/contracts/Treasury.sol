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
    event LogOwners(address ownerA, address ownerB);
    event AllowanceUpdated(uint allowance);
    event LiquidatorUpdated(address liquidator);
    event FundsAdded(address owner, uint amount);
    event FundsRemoved(address owner, uint amount);
    event RiskIncreased(uint amount);
    event ChiMinted(address owner, uint amount);
    event RevenueDistributed(address asset, uint amount, uint sharesA, uint sharesB);

    // Known addresses --------------------------------------------------------------------
    address private constant CHI = 0x0000000000004946c0e9F43F4Dee607b0eF1fA1c;
    address private constant ETH = address(0);

    address payable private ownerA;
    address payable private ownerB;

    address payable private caller;
    uint private callerAllowance = 2 ether;

    uint public balanceAStored;
    uint public balanceBStored;
    uint public balanceAAtRisk;
    uint public balanceBAtRisk;

    address payable public liquidator;
    address payable public liquidatorWrapper;

    constructor(address payable _ownerA, address payable _ownerB) {
        ownerA = _ownerA;
        ownerB = _ownerB;
        caller = payable(msg.sender);
    }

    // ------------------------------------------------------------------------------------
    // MARK: Owner privileges -------------------------------------------------------------

    // Allows owners to change their address
    function changeOwner(address payable _newOwner) external {
        if (msg.sender == ownerA) ownerA = _newOwner;
        if (msg.sender == ownerB) ownerB = _newOwner;
        // logging
        emit LogOwners(ownerA, ownerB);
    }

    // Allows owners to change the caller allowance
    function setCallerAllowance(uint _amount) external {
        require(msg.sender == ownerA || msg.sender == ownerB, "Treasury: Not an owner");
        callerAllowance = _amount;
        // logging
        emit AllowanceUpdated(_amount);
    }

    // Allows owners to change the liquidator
    function setLiquidator(address payable _liquidator) external {
        require(msg.sender == ownerA || msg.sender == ownerB, "Treasury: Not an owner");
        liquidator = _liquidator;
        liquidatorWrapper = payable(new Incognito(liquidator));
        
        IERC20(CHI).approve(_liquidator, type(uint256).max);
        // logging
        emit LiquidatorUpdated(_liquidator);
    }

    // ------------------------------------------------------------------------------------
    // MARK: Funding functions ------------------------------------------------------------

    // Allows any address to provide ETH that increases `_owner`'s share of revenue
    function fund(address _owner) external payable {
        // reject ETH if _owner is unknown
        require(_owner == ownerA || _owner == ownerB, "Treasury: Not an owner");
        // update balances
        if (_owner == ownerA) balanceAStored += msg.value;
        if (_owner == ownerB) balanceBStored += msg.value;
        // logging
        emit FundsAdded(_owner, msg.value);
    }

    // Allows owners to take back ETH that they previously provided (as long as it hasn't
    // been sent/spent already). Decreases their share of revenue
    function unfund(uint _amount) external {
        if (msg.sender == ownerA) {
            if (_amount > balanceAStored) _amount = balanceAStored;
            ownerA.transfer(_amount);
            balanceAStored -= _amount;
            // logging
            emit FundsRemoved(msg.sender, _amount);
        }

        if (msg.sender == ownerB) {
            if (_amount > balanceBStored) _amount = balanceBStored;
            ownerB.transfer(_amount);
            balanceBStored -= _amount;
            // logging
            emit FundsRemoved(msg.sender, _amount);
        }
    }

    // Get the combined amount of ETH provided by the owners (that remains in the contract)
    function _fundSize() private view returns (uint) {
        unchecked { return balanceAStored + balanceBStored; }
    }

    // Sort of like spending funds (doing the math for that) but not actually sending them
    // anywhere in this function. Just adjusting balances.
    // @return The actual amount deducted (differs from input arg if `_fundSize()` too small)
    function _deduct(uint _amount, bool _willBeAtRisk) private returns (uint) {
        uint available = _fundSize();
        if (available == 0) return 0;
        if (_amount > available) _amount = available;

        if (_willBeAtRisk) {
            uint half = _amount / 2;
            uint diffA = half > balanceAStored ? balanceAStored : half;
            uint diffB = half > balanceBStored ? balanceBStored : half;

            if (balanceAStored > balanceBStored) diffA += _amount - diffA - diffB;
            else diffB += _amount - diffA - diffB;

            balanceAStored -= diffA;
            balanceBStored -= diffB;
            balanceAAtRisk += diffA;
            balanceBAtRisk += diffB;
            // logging
            emit RiskIncreased(_amount);
        } else {
            balanceAStored -= _amount * balanceAStored / available;
            balanceBStored -= _amount * balanceBStored / available;
        }

        return _amount;
    }

    // ------------------------------------------------------------------------------------
    // MARK: Caller interaction -----------------------------------------------------------

    // Send funds to the caller (the EOA that initiates liquidations)
    function _send(uint _amount) private {
        caller.transfer(_deduct(_amount, true));
    }

    // Get the amount of ETH allocated to the current caller
    // @notice Usually equal to callerAllowance, but necessary for cases when
    //      callerAllowance gets changed by owners
    function _totalAtRisk() private view returns (uint) {
        return balanceAAtRisk + balanceBAtRisk;
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
        uint totalAtRisk = _totalAtRisk();
        if (totalAtRisk != 0) {
            balanceAStored += msg.value * balanceAAtRisk / totalAtRisk;
            balanceBStored += msg.value * balanceBAtRisk / totalAtRisk;
        } else {
            balanceAStored += msg.value / 2;
            balanceBStored += msg.value / 2;
        }

        // reset funds at-risk
        balanceAAtRisk = 0;
        balanceBAtRisk = 0;
        // now use all available funds to try to give new caller its allowance
        _send(callerAllowance);

        // re-wrap liquidator at the end for maximum gas savings
        _rewrapLiquidator();
    }

    // ------------------------------------------------------------------------------------
    // MARK: Payout functions -------------------------------------------------------------

    // Determine revenue distribution by basic proportionality of funds at risk
    // @return The percent of revenue owed to the owners, multiplied by 100000
    function shares() public view returns (uint sharesA, uint sharesB) {
        uint totalAtRisk = _totalAtRisk();

        if (totalAtRisk == 0) {
            sharesA = 50_000;
            sharesB = 50_000;
        } else {
            sharesA = 100_000 * balanceAAtRisk / totalAtRisk;
            sharesB = 100_000 * balanceBAtRisk / totalAtRisk;
        }
    }

    // Distribute revenue to owners according to current share distribution
    // @param _asset The address of the asset to distribute, could be ETH
    // @param _amount The amount of that asset to distribute
    // @notice _amount is only checked for ETH
    function payout(address _asset, uint _amount) public {
        (uint sharesA, uint sharesB) = shares();

        // No need to check for overflow here unless we plan to be bazillionaires
        unchecked {
            if (_asset == ETH) {
                // Payouts should never eat into active funds
                uint maxPayout = address(this).balance - _fundSize();
                if (_amount > maxPayout) _amount = maxPayout;

                ownerA.transfer(_amount * sharesA / 100_000);
                ownerB.transfer(_amount * sharesB / 100_000);
            } else {
                IERC20(_asset).safeTransfer(ownerA, _amount * sharesA / 100_000);
                IERC20(_asset).safeTransfer(ownerB, _amount * sharesB / 100_000);
            }
            // logging
            emit RevenueDistributed(_asset, _amount, sharesA, sharesB);
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

        require(_owner == ownerA || _owner == ownerB, "Treasury: Not an owner");
        require(_amount <= 50, "Treasury: Mint too much");
        require(IERC20(CHI).balanceOf(address(this)) + _amount <= 400, "Treasury: CHI vault is full");

        ICHI(CHI).mint(_amount);

        uint fee = tx.gasprice * (21000 + gasStart - gasleft() + 16 * msg.data.length);
        // SPECIAL USAGE OF DEDUCT!!
        _owner.transfer(_deduct(fee, false));
        // logging
        emit ChiMinted(_owner, _amount);
    }

    // ------------------------------------------------------------------------------------
    // MARK: Liquidator admin functions ---------------------------------------------------
    function callLiquidator(address _target, bytes calldata _command) external {
        require(msg.sender == ownerA || msg.sender == ownerB, "Treasury: Not an owner");
        _target.call(_command);
    }
}

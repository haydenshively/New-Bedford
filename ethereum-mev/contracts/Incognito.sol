// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

// Adapted from https://github.com/OpenZeppelin/openzeppelin-contracts/blob/6be0b410dcb77bc046cd3c960b4170368c502162/contracts/proxy/Proxy.sol

/**
 * @dev This contract provides a fallback function that delegates all calls to another contract using the EVM
 * instruction `delegatecall`. We refer to the second contract as the target of the proxy, specified at
 * construction time.
 * 
 * The success and return data of the delegated call will be returned back to the caller of the proxy.
 */
contract Incognito {
    address payable private immutable killer;
    address payable private immutable target;

    constructor(address payable _target) {
        killer = payable(msg.sender);
        target = _target;
    }

    function kill() external {
        require(msg.sender == killer, "Proxy: Unauthorized to kill");
        selfdestruct(target);
    }

    /**
     * @dev Delegates the current call to `target`.
     * 
     * This function does not return to its internall call site, it will return directly to the external caller.
     */
    function _delegate(address _target) internal {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            // Copy msg.data. We take full control of memory in this inline assembly
            // block because it will not return to Solidity code. We overwrite the
            // Solidity scratch pad at memory position 0.
            calldatacopy(0, 0, calldatasize())

            // Call the target.
            // out and outsize are 0 because we don't know the size yet.
            let result := call(gas(), _target, 0, 0, calldatasize(), 0, 0)

            // Copy the returned data.
            returndatacopy(0, 0, returndatasize())

            switch result
            // delegatecall returns 0 on error.
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }

    /**
     * @dev Fallback function that delegates calls to the target. Will run if no other
     * function in the contract matches the call data.
     */
    fallback() external payable {
        _delegate(target);
    }

    /**
     * @dev Fallback function that delegates calls to the target. Will run if call data
     * is empty.
     */
    receive() external payable {
        _delegate(target);
    }
}

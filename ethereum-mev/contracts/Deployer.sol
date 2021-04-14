// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./external/ICHI.sol";

contract Deployer {
    function deploy(bytes calldata code, bytes32 salt, uint256 amount) external {
        bytes memory bytecode = code;
        address addr;
        
        assembly {
            addr := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }

        ICHI(0x0000000000004946c0e9F43F4Dee607b0eF1fA1c).freeUpTo(amount);
    }
}

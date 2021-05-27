// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IMinerPayer {
    function pay() external payable;
}

contract MinerPayer {
    event Revenue(uint256 amount);

    function pay() external payable {
        block.coinbase.transfer(msg.value);
        emit Revenue(msg.value);
    }
}

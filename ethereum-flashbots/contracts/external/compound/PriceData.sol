// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface PriceData {
    function get(address source, string calldata key) external view returns (uint64, uint64);
    function getPrice(address source, string calldata key) external view returns (uint64);
}

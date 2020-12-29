// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface PriceOracle {
    function getUnderlyingPrice(address cToken) external view returns (uint);
    function postPrices(bytes[] calldata messages, bytes[] calldata signatures, string[] calldata symbols) external;

    function priceData() external view returns (address);
    function reporter() external view returns (address);
}

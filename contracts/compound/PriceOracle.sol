// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.10;
// For PriceOracle postPrices()
pragma experimental ABIEncoderV2;

interface PriceOracle {
    function getUnderlyingPrice(address cToken) external view returns (uint);
    function postPrices(bytes[] calldata messages, bytes[] calldata signatures, string[] calldata symbols) external;
}

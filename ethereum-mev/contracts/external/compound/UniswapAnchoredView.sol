// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface UniswapAnchoredView {
    function getUnderlyingPrice(address cToken) external view returns (uint);
    function postPrices(bytes[] calldata messages, bytes[] calldata signatures, string[] calldata symbols) external;

    function priceData() external view returns (address);
    function reporter() external view returns (address);

    function getTokenConfigByCToken(address _cToken) external view returns (
        address cToken,
        address underlying,
        bytes32 symbolHash,
        uint256 baseUnit,
        uint8 priceSource,
        uint256 fixedPrice,
        address uniswapMarket,
        bool isUniswapReversed
    );
}

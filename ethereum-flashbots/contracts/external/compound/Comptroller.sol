// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface Comptroller {
    function enterMarkets(address[] calldata cTokens) external returns (uint[] memory);
    function exitMarket(address cToken) external returns (uint);
    function getAssetsIn(address account) external view returns (address[] memory);
    
    function getAccountLiquidity(address account) external view returns (uint, uint, uint);
    function closeFactorMantissa() external view returns (uint);
    function liquidationIncentiveMantissa() external view returns (uint);

    function oracle() external view returns (address);

    function markets(address cTokenAddress) external view returns (bool, uint, bool);
    function getAllMarkets() external view returns (address[] memory);

    function seizeGuardianPaused() external view returns (bool);
}

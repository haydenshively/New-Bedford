// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface CERC20 {
    function accrueInterest() external returns (uint);
    function accrualBlockNumber() external view returns (uint);
    function exchangeRateStored() external view returns (uint);

    function mint(uint mintAmount) external returns (uint);

    function redeem(uint redeemTokens) external returns (uint);
    function redeemUnderlying(uint redeemAmount) external returns (uint);

    function borrow(uint borrowAmount) external returns (uint);
    function repayBorrow(uint repayAmount) external returns (uint);
    function repayBorrowBehalf(address borrower, uint repayAmount) external returns (uint);
    function liquidateBorrow(address borrower, uint repayAmount, address collateral) external returns (uint);

    function borrowBalanceCurrent(address account) external returns (uint);
    function borrowBalanceStored(address account) external view returns (uint);
    function balanceOf(address account) external view returns (uint);
    function balanceOfUnderlying(address account) external returns (uint);
    function getAccountSnapshot(address account) external view returns (uint error, uint cTokenBalance, uint borrowBalance, uint exchangeRateMantissa);

    function comptroller() external view returns (address);
}

interface CERC20Storage {
    function underlying() external view returns (address);
}

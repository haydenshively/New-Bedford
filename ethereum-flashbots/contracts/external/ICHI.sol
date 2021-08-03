// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;


interface ICHI {
    function mint(uint value) external;
    function freeUpTo(uint value) external returns (uint);
    function freeFromUpTo(address from, uint value) external returns (uint);
}

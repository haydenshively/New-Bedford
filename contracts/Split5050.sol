// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.10;

// Import the ERC20 interface and and SafeMath library
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract Split5050 {

  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  address payable private userA;
  address payable private userB;

  constructor(address payable _userA, address payable _userB) public {
    userA = _userA;
    userB = _userB;
  }

  receive() external payable {}

  function admin(address _target, bytes calldata _command) external {
    require(
      msg.sender == userA || msg.sender == userB,
      "Only designated users may call this function."
    );
    _target.call(_command);
  }

  function poke(address _asset) external {
    uint256 balance;
    if (_asset == address(0)) {
      balance = address(this).balance;
      userA.transfer(balance / uint256(2));
      userB.transfer(balance - balance / uint256(2));
    } else {
      balance = IERC20(_asset).balanceOf(address(this));
      IERC20(_asset).safeTransfer(userA, balance / uint256(2));
      IERC20(_asset).safeTransfer(userB, balance - balance / uint256(2));
    }
  }
}

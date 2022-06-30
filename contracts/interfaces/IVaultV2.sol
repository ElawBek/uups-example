// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IVaultV2 {
  /// @dev emit after each deposit to the vault
  event Deposit(address indexed sender, address indexed token, uint256 amount);

  /// @dev emit after each withdraw from the vault
  event Withdrawal(
    address indexed sender,
    address indexed token,
    uint256 amount
  );

  /// @dev emit after each addition  the token in the vault
  event TokenAdded(address newToken);

  function name() external view returns (string memory);

  function totalSupply(address _token) external returns (uint256);

  function balances(address _token, address _user)
    external
    view
    returns (uint256);

  function deposit(address _token, uint256 _amount) external;

  function withdraw(IERC20Upgradeable _token, uint256 _shares) external;

  function previewDeposit(IERC20Upgradeable _token, uint256 _amount)
    external
    view
    returns (uint256 shares);

  function previewWithdraw(IERC20Upgradeable _token, uint256 _shares)
    external
    view
    returns (uint256 amount);

  error NotEnoughAmount(string func, uint256 _amount, address token);

  error WrongAddress(string func, address _addr);
}

// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IVaultV1 {
    /// @dev emit after each deposit to the vault
    event Deposit(
        address indexed sender,
        IERC20Upgradeable indexed token,
        uint256 amount
    );

    /// @dev emit after each withdraw from the vault
    event Withdrawal(
        address indexed sender,
        IERC20Upgradeable indexed token,
        uint256 amount
    );

    /// @dev emit after each change of the current token in the vault
    event TokenChanged(
        address indexed oldToken,
        address indexed newToken,
        uint256 newMinAmount
    );

    function deposit(uint256 _amount) external;

    function withdraw(IERC20Upgradeable _token, uint256 _shares) external;

    function previewDeposit(IERC20Upgradeable _token, uint256 _amount)
        external
        view
        returns (uint256);

    function previewWithdraw(IERC20Upgradeable _token, uint256 _shares)
        external
        view
        returns (uint256 amount);

    error NotEnoughAmount(string func, uint256 _amount);

    error WrongAddress(string func, address _addr);
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

/// @title Token
/// @dev token for testing vaults
contract Token is ERC20, Ownable, ERC20Permit {
  constructor(string memory _name, string memory _symbol)
    ERC20(_name, _symbol)
    ERC20Permit(_name)
  {}

  function mint(address to, uint256 amount) public onlyOwner {
    _mint(to, amount);
  }
}

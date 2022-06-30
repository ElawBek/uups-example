// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-IERC20PermitUpgradeable.sol";

import "./interfaces/IVaultV2.sol";

/**
 * @title Vault 2 version
 * @author Dmitry K. (@elawbek)
 *
 * @dev NOTE: avoid storage collisions
 *
 * you could have just inherited from the first version,
 * but I decided to do this to show how to avoid storage collisions
 * when switching to another version
 */
contract VaultV2 is
  Initializable,
  OwnableUpgradeable,
  UUPSUpgradeable,
  IVaultV2
{
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /// @notice name of contract
  string public name;

  /**
   * @dev deprecated
   *
   * @notice the address of the underlying token used for the Vault for
   * accounting, depositing, and withdrawing.
   */
  address public token;

  /**
   * @dev deprecated
   *
   * @notice minimum number of tokens for the deposit (0.1 of current token)
   */
  uint256 public minAmount;

  /// @notice total amount of shares for token
  mapping(address => uint256) public totalSupply;

  /// @notice balances: token -> user -> shares of token
  mapping(address => mapping(address => uint256)) public balances;

  /**
   * @notice tokens supported by contract
   *
   * @dev mapping is deployed after all existing variables in the first version
   * to avoid storage collisions
   */
  mapping(address => bool) public assets;

  /**
   * @dev the second version has no initialization function,
   * so this constructor is unnecessary
   */
  // constructor() {
  //     _disableInitializers();
  // }

  /**
   * @notice modifier for validate deposit params
   *
   * @dev the `_token` argument MUST be a supported token
   * the argument `_amount` cannot be less than 0.1 of token
   */
  modifier validateDeposit(address _token, uint256 _amount) {
    uint256 _minAmount = 10**IERC20MetadataUpgradeable(_token).decimals() / 10;

    if (_amount < _minAmount) {
      revert NotEnoughAmount("deposit", _amount, _token);
    }

    if (!assets[_token]) {
      revert WrongAddress("deposit", _token);
    }

    _;
  }

  /**
   * @dev old title - `changeToken`
   *
   * @notice add support for `newToken`
   * @param newToken address of new token
   *
   * @dev note: the `newToken` argument can't be address(0) or is already supported
   *
   * emit `TokenAdded` event
   */
  function addToken(address newToken) external onlyOwner {
    if (newToken == address(0) || assets[newToken]) {
      revert WrongAddress("addToken", newToken);
    }

    if (token != address(0) && minAmount != 0) {
      address _token = token; // gas saving

      // add old token to supported tokens
      assets[_token] = true;

      emit TokenAdded(_token);

      // reset old variables to zero
      token = address(0);
      minAmount = 0;
    }

    assets[newToken] = true;

    emit TokenAdded(newToken);
  }

  /**
   * @notice deposit amount of the supported token to Vault contract
   *
   * @param _token - the token the user wants to deposit
   * @param _amount - the share the user wants to deposit
   *
   * @dev arguments are passed to the modifier for validation
   *
   * emit event 'Deposit'
   */
  function deposit(address _token, uint256 _amount)
    public
    validateDeposit(_token, _amount)
  {
    IERC20Upgradeable token_ = IERC20Upgradeable(_token);

    uint256 shares = previewDeposit(token_, _amount);

    _mint(_token, msg.sender, shares);
    token_.safeTransferFrom(msg.sender, address(this), _amount);

    emit Deposit(msg.sender, _token, _amount);
  }

  /**
   * @notice deposit amount by permit-sinature
   *
   * @param _token - the token the user wants to deposit
   * @param _amount - the share the user wants to deposit
   *
   * @dev arguments are passed to the modifier for validation
   *
   * emit event 'Deposit'
   */
  function depositBySig(
    address _token,
    uint256 _amount,
    uint256 _deadline,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external validateDeposit(_token, _amount) {
    IERC20PermitUpgradeable(_token).permit(
      msg.sender, // owner
      address(this), // spender
      _amount,
      _deadline,
      _v,
      _r,
      _s
    );

    deposit(_token, _amount);
  }

  /**
   * @notice burn user's share and withdraw token
   *
   * @param _token - the token the user wants to withdraw
   * @param _shares - the share the user wants to burn
   *
   * @dev note: the balance of user shares cannot be less than the `_share` argument
   *
   * emit event 'Withdrawal'
   */
  function withdraw(IERC20Upgradeable _token, uint256 _shares) external {
    if (balances[address(_token)][msg.sender] < _shares) {
      revert NotEnoughAmount("withdraw", _shares, address(_token));
    }

    uint256 amount = previewWithdraw(_token, _shares);

    _burn(address(_token), msg.sender, _shares);
    _token.safeTransfer(msg.sender, amount);

    emit Withdrawal(msg.sender, address(_token), amount);
  }

  /**
   * @notice public view function to calculate the share
   * the user will get by deposit a token amount
   *
   * @param _token - the token the user wants to deposit
   * @param _amount - the amount the user wants to deposit
   * @return shares_ for the mint
   *
   * @dev note: the `_token` argument MUST be a supported token
   */
  function previewDeposit(IERC20Upgradeable _token, uint256 _amount)
    public
    view
    override
    returns (uint256 shares_)
  {
    // Check for external calls
    if (!assets[address(_token)]) {
      revert WrongAddress("previewDeposit", address(_token));
    }

    if (totalSupply[address(_token)] == 0) {
      shares_ = _amount;
    } else {
      unchecked {
        /*
         * a = amount
         * B = balance of token before deposit
         * T = total supply
         * s = shares to mint
         *
         * (T + s) / T = (a + B) / B
         *
         * s = a * T / B
         */
        shares_ =
          (_amount * totalSupply[address(_token)]) /
          _token.balanceOf(address(this));
      }
    }
  }

  /**
   * @notice public view function to calculate the amount
   * the user will get by burn a own share
   *
   * @param _token - the token the user wants to withdraw
   * @param _shares - the share the user wants to burn
   * @return amount_ for the withdraw
   *
   * @dev note: the function is available only after the first token deposit
   */
  function previewWithdraw(IERC20Upgradeable _token, uint256 _shares)
    public
    view
    override
    returns (uint256 amount_)
  {
    // Check for external calls
    uint256 _totalSupply = totalSupply[address(_token)];

    if (_totalSupply == 0) {
      revert NotEnoughAmount("previewWithdraw", _totalSupply, address(_token));
    }

    unchecked {
      /*
       * a = amount
       * B = balance of token before withdraw
       * T = total supply
       * s = shares to burn
       *
       * (T - s) / T = (B - a) / B
       *
       * a = s * B / T
       */
      amount_ = ((_shares * _token.balanceOf(address(this))) / _totalSupply);
    }
  }

  /**
   * @notice private functions for changing user balances
   *
   * @param _token - token that the user has deposited
   * @param _to - the recipient of the accrued share
   * @param _shares - shares that the recipient will receive
   *
   * @dev overflows are not possible due to checks
   * carried out before this function
   */
  function _mint(
    address _token,
    address _to,
    uint256 _shares
  ) private {
    unchecked {
      totalSupply[_token] += _shares;
      balances[_token][_to] += _shares;
    }
  }

  /**
   * @param _token - token that the user wants to withdraw
   * @param _from - the user who withdraws the tokens
   * @param _shares - shares that are burned on withdrawal
   *
   * @dev overflows are not possible due to checks
   * carried out before this function
   */
  function _burn(
    address _token,
    address _from,
    uint256 _shares
  ) private {
    unchecked {
      totalSupply[_token] -= _shares;
      balances[_token][_from] -= _shares;
    }
  }

  /**
   * @dev function that should revert when `msg.sender`
   * is not authorized to upgrade the contract.
   */
  function _authorizeUpgrade(address newImplementation)
    internal
    override
    onlyOwner
  {}
}

// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";

import "./interfaces/IVaultV1.sol";

/// @title Vault 1 version
/// @author Dmitry K. (@elawbek)
/// @dev first verion of the vault
contract VaultV1 is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    IVaultV1
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice name of contract
    string public name;

    /// @notice the address of the underlying token used for the Vault for accounting, depositing, and withdrawing.
    address public token;

    /// @notice minimum number of tokens for the deposit (0.1 of current token)
    uint256 public minAmount;

    /// @notice total amount of shares for token
    mapping(address => uint256) public totalSupply;

    /// @notice balances: token -> user -> shares of token
    mapping(address => mapping(address => uint256)) public balances;

    /**
     * @dev disable initialization action for the origin contract
     *
     * @custom:oz-upgrades-unsafe-allow constructor
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice initialize contract (execute only once)
     * @param _token setup current `token` cariable
     * @param _name setup contract's name
     *
     * @dev note: the `_token` argument can't be address(0)
     * emit `TokenChanged` event
     */
    function initialize(address _token, string calldata _name)
        external
        initializer
    {
        if (_token == address(0)) {
            revert WrongAddress("initialize", _token);
        }

        __Ownable_init();
        __UUPSUpgradeable_init();
        name = _name;

        token = _token;
        // 0.1 of token
        unchecked {
            minAmount = 10**IERC20MetadataUpgradeable(_token).decimals() / 10;
        }

        emit TokenChanged(address(0), _token, minAmount);
    }

    /**
     * @notice change the `token` variable to new token address
     * @param newToken address of new token
     * @dev note: the `newToken` argument can't be address(0) or current token
     * emit `TokenChanged` event
     */
    function changeToken(address newToken) external onlyOwner {
        address oldToken = token;

        if (newToken == address(0) || newToken == oldToken) {
            revert WrongAddress("changeToken", newToken);
        }

        token = newToken;

        // 0.1 of token
        unchecked {
            minAmount = 10**IERC20MetadataUpgradeable(newToken).decimals() / 10;
        }

        emit TokenChanged(oldToken, newToken, minAmount);
    }

    /**
     * @notice deposit amount of current token to Vault contract
     * @param _amount - the amount that the user wants to deposit
     * @dev note: the `_amount` argument can't be less than minAmount variable
     * emit `Deposit` event
     */
    function deposit(uint256 _amount) external {
        if (_amount < minAmount) {
            revert NotEnoughAmount("deposit", _amount);
        }
        IERC20Upgradeable _token = IERC20Upgradeable(token);

        uint256 shares = previewDeposit(_token, _amount);

        _mint(msg.sender, shares);
        _token.safeTransferFrom(msg.sender, address(this), _amount);

        emit Deposit(msg.sender, _token, _amount);
    }

    /**
     * @notice burn user's share and withdraw token
     * @param _token - the token the user wants to withdraw
     * @param _shares - the share the user wants to burn
     * @dev note: the balance of user shares cannot be less than the `_share` argument
     * emit event `Withdrawal`
     */
    function withdraw(IERC20Upgradeable _token, uint256 _shares) external {
        if (balances[address(_token)][msg.sender] < _shares) {
            revert NotEnoughAmount("withdraw", _shares);
        }

        uint256 amount = previewWithdraw(_token, _shares);

        _burn(address(_token), msg.sender, _shares);
        _token.safeTransfer(msg.sender, amount);

        emit Withdrawal(msg.sender, _token, amount);
    }

    /**
     * @notice public view function to calculate the share the user will get by depositing a token amount
     * @param _token - the token the user wants to deposit
     * @param _amount - the amount the user wants to deposit
     * @dev note: the `_token` argument must be equal to the current token that the  contract supports
     */
    function previewDeposit(IERC20Upgradeable _token, uint256 _amount)
        public
        view
        override
        returns (uint256)
    {
        // Check for external calls
        if (address(_token) != token) {
            revert WrongAddress("previewDeposit", address(_token));
        }

        if (totalSupply[token] == 0) {
            return _amount;
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
                return
                    (_amount * totalSupply[token]) /
                    _token.balanceOf(address(this));
            }
        }
    }

    /**
     * @notice public view function to calculate the amount the user will get by burn a own share
     * @param _token - the token the user wants to withdraw
     * @param _shares - the share the user wants to withdraw
     * @dev note: the function is available only after the first token deposit
     */
    function previewWithdraw(IERC20Upgradeable _token, uint256 _shares)
        public
        view
        override
        returns (uint256 amount)
    {
        // Check for external calls
        uint256 _totalSupply = totalSupply[address(_token)];

        if (_totalSupply == 0) {
            revert NotEnoughAmount("previewWithdraw", _totalSupply);
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
            amount = ((_shares * _token.balanceOf(address(this))) /
                _totalSupply);
        }
    }

    function _mint(address _to, uint256 _shares) private {
        address _token = token;

        unchecked {
            totalSupply[_token] += _shares;
            balances[_token][_to] += _shares;
        }
    }

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

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts-v5/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts-v5/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts-v5/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts-v5/access/Ownable.sol";
import {RaffleErrors} from "./RaffleErrors.sol";

/// @title Raffle Ticket Purchase
/// @dev Manages the purchase and refund of raffle tickets, inheriting functionalities for ownership and error handling.
contract RaffleTicketPurchase is Ownable, RaffleErrors {
    using SafeERC20 for IERC20;

    /// @notice The id of the raffle.
    uint256 public immutable raffleId;
    /// @notice The token used to purchase raffle tickets.
    IERC20 public immutable purchaseToken;
    /// @notice The price of one raffle ticket.
    uint256 public immutable ticketPrice;
    /// @notice The timestamp when the raffle starts.
    uint256 public immutable startTimestamp;
    /// @notice The timestamp when the raffle ends.
    uint256 public immutable finishTimestamp;
    /// @notice Total number of tickets sold.
    uint256 public totalTicketsSold;
    /// @notice Minimum number of tickets required to consider the raffle tickets sale successful.
    uint256 public immutable minTickets;
    /// @notice Maximum number of tickets that can be sold.
    uint256 public immutable maxTickets;
    /// @notice Maximum number of tickets an individual can purchase.
    uint256 public immutable personalMaxTickets;
    /// @notice Version of the raffle manager contract.
    bytes1 public immutable version;

    /// @notice Tracks the number of tickets purchased by each address.
    mapping(address => uint256) public ticketsPurchased;

    /// @notice Emitted when a ticket is purchased.
    /// @param raffleId The id of the raffle.
    /// @param purchaser The address of the ticket purchaser.
    /// @param referralCode The referral code of the person who referred the purchaser.
    /// @param ticketAmount The number of tickets purchased.
    event TicketPurchased(uint256 indexed raffleId, address indexed purchaser, string indexed referralCode, uint256 ticketAmount);

    /// @notice Emitted when funds are withdrawn.
    /// @param raffleId The id of the raffle.
    /// @param receiver The address receiving the withdrawn funds.
    /// @param amount The amount of funds withdrawn.
    event FundsWithdrawn(uint256 indexed raffleId, address indexed receiver, uint256 amount);

    /// @notice Emitted when a refund is issued.
    /// @param raffleId The id of the raffle.
    /// @param purchaser The address receiving the refund.
    /// @param amount The amount refunded.
    event RefundIssued(uint256 indexed raffleId, address indexed purchaser, uint256 amount);

    /// @notice Emitted when excess tokens are withdrawn.
    /// @param raffleId The id of the raffle.
    /// @param receiver The address receiving the withdrawn tokens.
    /// @param tokenAddress The address of the token being withdrawn.
    /// @param amount The amount of tokens withdrawn.
    event ExcessTokensWithdrawn(uint256 indexed raffleId, address receiver, address tokenAddress, uint256 amount);

    /// @dev Sets the initial values for the raffle ticket system.
    /// @param _raffleId The id of the raffle.
    /// @param _purchaseToken The address of the token used for ticket purchase.
    /// @param _ticketPrice The price of one raffle ticket.
    /// @param _startTimestamp The timestamp when the raffle starts.
    /// @param _finishTimestamp The timestamp when the raffle ends.
    /// @param _minTickets The minimum number of tickets required for a successful raffle.
    /// @param _maxTickets The maximum number of tickets that can be sold.
    /// @param _personalMaxTickets The maximum number of tickets an individual can purchase.
    constructor(
        uint256 _raffleId,
        address _purchaseToken,
        uint256 _ticketPrice,
        uint256 _startTimestamp,
        uint256 _finishTimestamp,
        uint256 _minTickets,
        uint256 _maxTickets,
        uint256 _personalMaxTickets,
        bytes1 _version
    ) Ownable(msg.sender) {
        if (_purchaseToken == address(0)) revert InvalidTokenAddress();
        if (_startTimestamp >= _finishTimestamp || _startTimestamp < block.timestamp) revert InvalidTimestamps();
        if (_minTickets > _maxTickets || _minTickets == 0 || _maxTickets == 0 || _personalMaxTickets == 0 || _personalMaxTickets > _maxTickets)
            revert InvalidCaps();

        raffleId = _raffleId;
        uint8 decimals = IERC20Metadata(_purchaseToken).decimals();
        ticketPrice = _ticketPrice * (10 ** decimals);
        purchaseToken = IERC20(_purchaseToken);
        startTimestamp = _startTimestamp;
        finishTimestamp = _finishTimestamp;
        minTickets = _minTickets;
        maxTickets = _maxTickets;
        personalMaxTickets = _personalMaxTickets;
        version = _version;
    }

    /// @notice Allows a user to purchase raffle tickets.
    /// @param _ticketAmount Number of tickets to purchase.
    /// @param _referralCode Referral code of the person who referred the purchaser.
    /// @dev Requires the raffle to be active and within ticket purchase limits.
    function purchaseTickets(uint256 _ticketAmount, string calldata _referralCode) external {
        if (_ticketAmount == 0) revert InvalidTicketAmount();
        if (block.timestamp < startTimestamp || block.timestamp > finishTimestamp) revert RaffleNotActive();
        if (totalTicketsSold + _ticketAmount > maxTickets) revert MaxCapReached();
        if (ticketsPurchased[msg.sender] + _ticketAmount > personalMaxTickets) revert PersonalMaxCapReached();

        ticketsPurchased[msg.sender] += _ticketAmount;
        totalTicketsSold += _ticketAmount;

        uint256 totalCost = _ticketAmount * ticketPrice;
        purchaseToken.safeTransferFrom(msg.sender, address(this), totalCost);
        emit TicketPurchased(raffleId, msg.sender, _referralCode, _ticketAmount);
    }

    /// @notice Withdraws funds after a successful raffle, only callable by the owner.
    /// @dev Verifies the raffle was successful before allowing withdrawal.
    /// @param receiver Address to send the funds.
    function withdrawFunds(address receiver) external onlyOwner {
        if (!isSuccessful()) revert RaffleNotSuccessful();
        uint256 balance = purchaseToken.balanceOf(address(this));
        purchaseToken.safeTransfer(receiver, balance);
        emit FundsWithdrawn(raffleId, receiver, balance);
    }

    /// @notice Withdraws tokens sent in excess to the contract, only callable by the owner.
    /// @param tokenAddress The address of the token to withdraw.
    /// @param amount The amount of tokens to withdraw.
    /// @param receiver Address to send the funds.
    function withdrawExcessTokens(address tokenAddress, uint256 amount, address receiver) external onlyOwner {
        if (tokenAddress == address(0)) revert InvalidTokenAddress();
        if (amount == 0) revert InvalidAmount();

        IERC20 token = IERC20(tokenAddress);

        uint256 withdrawableAmount = token.balanceOf(address(this));
        if (tokenAddress == address(purchaseToken)) {
            if (withdrawableAmount <= totalTicketsSold * ticketPrice) revert NoExcessPurchaseToken();
            withdrawableAmount = withdrawableAmount - totalTicketsSold * ticketPrice;
        }

        if (amount > withdrawableAmount) revert WithdrawAmountExceedsLimit();
        token.safeTransfer(receiver, amount);
        emit ExcessTokensWithdrawn(raffleId, receiver, tokenAddress, amount);
    }

    /// @notice Allows ticket holders to claim a refund if the raffle fails to meet the minimum ticket sales requirement.
    /// @dev Refunds are only available after the raffle finishes and if the minimum ticket sales are not met.
    function claimRefund() external {
        if (block.timestamp < finishTimestamp || totalTicketsSold >= minTickets) revert RaffleNotFailed();
        uint256 tickets = ticketsPurchased[msg.sender];
        if (tickets == 0) revert RefundNotAvailable();

        uint256 refundAmount = tickets * ticketPrice;
        ticketsPurchased[msg.sender] = 0;

        purchaseToken.safeTransfer(msg.sender, refundAmount);
        emit RefundIssued(raffleId, msg.sender, refundAmount);
    }

    /// @notice Checks if the raffle tickets sale is successful based on ticket sales and time.
    /// @return true if the raffle tickets sale is successful, false otherwise.
    function isSuccessful() public view returns (bool) {
        return (block.timestamp >= finishTimestamp && totalTicketsSold >= minTickets) || (totalTicketsSold == maxTickets);
    }
}

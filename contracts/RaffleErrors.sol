// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RaffleErrors
/// @notice Defines custom errors for the Raffle system contracts including RaffleTicketPurchase, RaffleRewarder, and RaffleManager.
contract RaffleErrors {
    /// @notice Thrown if an invalid ERC20 token address is provided.
    error InvalidTokenAddress();

    /// @notice Thrown if the provided timestamps are invalid (e.g., start is after finish or start is in the past).
    error InvalidTimestamps();

    /// @notice Thrown if the ticket cap settings are invalid (e.g., minCap >= maxCap, zero caps).
    error InvalidCaps();

    /// @notice Thrown if an invalid ticket amount is specified for purchase.
    error InvalidTicketAmount();

    /// @notice Thrown if a ticket purchase or action is attempted outside of the active raffle period.
    error RaffleNotActive();

    /// @notice Thrown if a refund is attempted when the raffle has not failed (i.e., the raffle is successful or still active).
    error RaffleNotFailed();

    /// @notice Thrown if a ticket purchase exceeds the maximum cap.
    error MaxCapReached();

    /// @notice Thrown if a refund is requested when no refund is available (e.g., tickets were not purchased, or conditions are not met).
    error RefundNotAvailable();

    /// @notice Thrown if a ticket purchase would exceed the personal maximum cap for tickets per participant.
    error PersonalMaxCapReached();

    /// @notice Thrown if an operation that requires a successful raffle is attempted and the raffle has not been successful.
    error RaffleNotSuccessful();

    /// @notice Thrown if an attempt is made to withdraw excess purchase tokens but there are no excess tokens.
    error NoExcessPurchaseToken();

    /// @notice Thrown if an invalid amount of tokens is specified for an operation.
    error InvalidAmount();

    /// @notice Thrown if the amount requested to withdraw exceeds the limit of what can be withdrawn.
    error WithdrawAmountExceedsLimit();

    /// @notice Thrown if a new request for randomness is made before the previous one is resolved.
    error CannotAskForNewRandomness();

    /// @notice Thrown if the contract cannot be funded appropriately.
    error UnableToFundContract();

    /// @notice Thrown if there is an attempt to ask for randomness without the correct procedure or order.
    error AskForRandomnessFirst();

    /// @notice Thrown if wrong inputs are provided to a function, typically indicating parameter errors.
    error WrongInput();

    /// @notice Thrown if an operation that depends on the winner being set is attempted and the winner is not yet determined.
    error WinnerNotSet();

    /// @notice Thrown if the prize claim period has elapsed and the prize can no longer be claimed.
    error PrizeClaimPeriodElapsed();

    /// @notice Thrown if a function restricted to the winner of the raffle is called by a non-winner.
    error OnlyWinnerCanCall();

    /// @notice Thrown if an invalid ID is provided for an operation.
    error InvalidId();

    /// @notice Thrown if rewarding has already started and an attempt is made to start it again.
    error RewardingAlreadyStarted();
}

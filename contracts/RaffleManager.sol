// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TransparentUpgradeableProxy} from "@openzeppelin/contracts-v5/proxy/transparent/TransparentUpgradeableProxy.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-v5-upgradeable/access/Ownable2StepUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts-v5/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts-v5/token/ERC20/utils/SafeERC20.sol";
import {RaffleRewarder, RaffleErrors} from "./RaffleRewarder.sol";
import {RaffleTicketPurchase} from "./RaffleTicketPurchase.sol";

/// @title Raffle Manager
/// @dev This contract manages decentralized raffle events.
contract RaffleManager is Ownable2StepUpgradeable, RaffleErrors {
    using SafeERC20 for IERC20;

    /// @notice Structure to store information about each raffle.
    struct Raffle {
        RaffleTicketPurchase raffleTicketPurchase;
        RaffleRewarder raffleRewarder;
        address purchaseToken;
        uint256 ticketPrice;
        uint256 startTimestamp;
        uint256 finishTimestamp;
        uint256 minCap;
        uint256 maxCap;
        uint256 personalMaxCap;
        RaffleRewarder.Prize prize;
        bytes32 participantsProof;
        address winner;
        bytes1 version;
    }

    /// @notice Address of the Chainlink VRF v2 wrapper.
    address public vrfV2Wrapper;

    /// @notice Counter for the total number of raffles created.
    uint256 public lastRaffleId;

    /// @notice Version of the contract.
    bytes1 public version;

    /// @notice Mapping to conveniently check if a raffle contract is legit.
    mapping(address => bool) public knownRaffles;

    /// @notice Mapping from raffle ID to raffle struct.
    mapping(uint256 => Raffle) public raffles;

    /// @notice Event emitted when a new raffle is created.
    /// @param id The ID of the created raffle.
    /// @param raffle The details of the created raffle.
    event RaffleCreated(uint256 id, Raffle raffle);

    /// @notice Event emitted when rewarding starts for a raffle.
    /// @param id The ID of the raffle that started rewarding.
    event RewardingStarted(uint256 id);

    /// @notice Event emitted when a winner is determined for a raffle.
    /// @param id The ID of the raffle for which the winner is determined.
    /// @param winner The address of the determined winner.
    event WinnerDetermined(uint256 id, address winner);

    /// @notice Event emitted when vrfV2Wrapper contract is updated.
    /// @param vrfV2wrapper The address of the vrfV2Wrapper contract.
    event WrapperSet(address vrfV2wrapper);

    /// @notice Modifier to validate if the raffle ID is valid.
    /// @param _id The ID of the raffle to validate.
    modifier isValidRaffle(uint256 _id) {
        if (_id > lastRaffleId) revert InvalidId();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract replacing constructor for upgradeable contracts.
    /// @param _vrfV2Wrapper The address of the Chainlink VRF v2 wrapper.
    function initialize(address _vrfV2Wrapper) external initializer {
        __RaffleManager_init(_vrfV2Wrapper);
    }

    /// @notice Creates a new raffle with specified parameters.
    /// @param _purchaseToken ERC20 token address used for purchasing tickets.
    /// @param _ticketPrice Price per ticket.
    /// @param _startTimestamp Start time of the raffle.
    /// @param _finishTimestamp End time of the raffle.
    /// @param _minTickets Minimum ticket sales required for the raffle to be successful.
    /// @param _maxTickets Maximum number of tickets that can be sold.
    /// @param _personalMaxTickets Maximum number of tickets an individual can purchase.
    /// @dev Emits a RaffleCreated event on success.
    function createNewRaffle(
        address _purchaseToken,
        uint256 _ticketPrice,
        uint256 _startTimestamp,
        uint256 _finishTimestamp,
        uint256 _minTickets,
        uint256 _maxTickets,
        uint256 _personalMaxTickets
    ) external onlyOwner {
        RaffleTicketPurchase raffleTicketPurchase = new RaffleTicketPurchase(
            lastRaffleId,
            _purchaseToken,
            _ticketPrice,
            _startTimestamp,
            _finishTimestamp,
            _minTickets,
            _maxTickets,
            _personalMaxTickets,
            version
        );

        knownRaffles[address(raffleTicketPurchase)] = true;

        raffles[lastRaffleId] = Raffle(
            raffleTicketPurchase,
            RaffleRewarder(address(0)),
            _purchaseToken,
            _ticketPrice,
            _startTimestamp,
            _finishTimestamp,
            _minTickets,
            _maxTickets,
            _personalMaxTickets,
            RaffleRewarder.Prize(address(0), 0),
            bytes32(0),
            address(0),
            version
        );

        lastRaffleId += 1;

        emit RaffleCreated(lastRaffleId - 1, raffles[lastRaffleId - 1]);
    }

    /// @notice Starts the rewarding process for a specified raffle.
    /// @param _id The ID of the raffle to start rewarding for.
    /// @param _prize The prize details for the reward.
    /// @param _participantsProof A proof hash of the participants involved.
    /// @dev Requires the raffle tickets sale to be successful to proceed.
    function startRewarding(uint256 _id, RaffleRewarder.Prize calldata _prize, bytes32 _participantsProof) external onlyOwner isValidRaffle(_id) {
        Raffle storage raffle = raffles[_id];
        if (!raffle.raffleTicketPurchase.isSuccessful()) revert RaffleNotSuccessful();
        if (address(raffle.raffleRewarder) != address(0)) revert RewardingAlreadyStarted();

        raffle.raffleTicketPurchase.withdrawFunds(msg.sender);

        RaffleRewarder raffleRewarder = new RaffleRewarder(_id, _prize, _participantsProof, vrfV2Wrapper, version);

        knownRaffles[address(raffleRewarder)] = true;

        raffle.raffleRewarder = raffleRewarder;
        raffle.prize = _prize;
        raffle.participantsProof = _participantsProof;

        emit RewardingStarted(_id);
    }

    /// @notice Set the new address for vrfV2Wrapper contract.
    /// @param _vrfV2Wrapper The address of the new vrfV2Wrapper contract.
    function setWrapper(address _vrfV2Wrapper) external onlyOwner {
        _setWrapper(_vrfV2Wrapper);
    }

    /// @notice Requests randomness for a specified raffle.
    /// @param _id The ID of the raffle to request randomness for.
    function askForRandomness(uint256 _id) external isValidRaffle(_id) {
        Raffle memory raffle = raffles[_id];
        raffle.raffleRewarder.askForRandomness(msg.sender);
    }

    /// @notice Determines the winner for a specified raffle.
    /// @param _id The ID of the raffle to determine the winner for.
    /// @param _participants The list of participants involved in the raffle.
    function determineWinner(uint256 _id, RaffleRewarder.Participant[] calldata _participants) external isValidRaffle(_id) {
        Raffle storage raffle = raffles[_id];
        raffle.raffleRewarder.determineWinner(_participants);

        raffle.winner = raffle.raffleRewarder.winner();
        emit WinnerDetermined(_id, raffle.winner);
    }

    /// @notice Withdraws excess tokens from the raffle ticket purchase contract.
    /// @param _id The ID of the raffle to withdraw excess tokens from.
    /// @param _tokenAddress The address of the ERC20 token to withdraw.
    /// @param _amount The amount of tokens to withdraw.
    function withdrawExcessTokens(uint256 _id, address _tokenAddress, uint256 _amount) external onlyOwner isValidRaffle(_id) {
        Raffle storage raffle = raffles[_id];

        raffle.raffleTicketPurchase.withdrawExcessTokens(_tokenAddress, _amount, msg.sender);
    }

    /// @dev Internal initialization function to set up initial state.
    function __RaffleManager_init(address _vrfV2Wrapper) internal onlyInitializing {
        __Ownable_init(msg.sender);
        __RaffleManager_init_unchained(_vrfV2Wrapper);
    }

    /// @dev Completes the unchained initialization.
    function __RaffleManager_init_unchained(address _vrfV2Wrapper) internal onlyInitializing {
        _setWrapper(_vrfV2Wrapper);
        version = "1";
    }

    /// @dev Internal function to set up the chainlink vrf v2 wrapper contract.
    function _setWrapper(address _vrfV2Wrapper) internal {
        vrfV2Wrapper = _vrfV2Wrapper;

        emit WrapperSet(vrfV2Wrapper);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts-v5/token/ERC721/IERC721.sol";
import {VRFV2PlusWrapperConsumerBase} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFV2PlusWrapperConsumerBase.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {RaffleErrors} from "./RaffleErrors.sol";
import {Ownable} from "@openzeppelin/contracts-v5/access/Ownable.sol";

/// @title Raffle Rewarder
/// @dev This contract implements a raffle system where participants can win an NFT prize.
/// @dev This contract utilizes Chainlink VRF for random number generation.
contract RaffleRewarder is VRFV2PlusWrapperConsumerBase, Ownable, RaffleErrors {
    /// @notice Structure to store participant details.
    struct Participant {
        address addr;
        uint256 ticketCount;
        uint256 cumulativeCount;
    }

    /// @notice Structure to store prize details.
    struct Prize {
        address contractAddress;
        uint256 tokenId;
    }

    /// @notice Structure to keep track of VRF request status.
    struct RequestStatus {
        uint256 requestId;
        uint256 paid; // Amount paid in LINK
        bool fulfilled; // Whether the request has been successfully fulfilled
        uint256[] randomWords;
    }

    /// @notice Current request status for Chainlink VRF
    RequestStatus public request;
    /// @notice Gas limit for Chainlink VRF callback.
    uint32 public constant CALLBACK_GAS_LIMIT = 100000;
    /// @notice Confirmation count required for Chainlink VRF.
    uint16 public constant REQUEST_CONFIRMATION = 3;
    /// @notice Number of random words requested from Chainlink VRF.
    uint32 public constant NUM_WORDS = 1;

    /// @notice Period in which the prize can be claimed after being awarded.
    uint256 public constant PRIZE_CLAIM_PERIOD = 5 days;
    /// @notice The id of the raffle.
    uint256 public immutable raffleId;
    /// @notice Hash of the participant list for verification.
    bytes32 public immutable participantsProof;
    /// @notice Token version of the NFTs
    bytes1 public immutable version;
    /// @notice Timestamp when prize claim starts.
    uint256 public startClaimTime;
    /// @notice Prize details.
    Prize public prize;
    /// @notice Address of the winner.
    address public winner;

    /// @notice Emitted when randomness is requested from Chainlink VRF.
    /// @param requester Address of the user who requested the randomness.
    /// @param requestId ID of the VRF request.
    /// @param paid Amount of LINK paid for the request.
    event RandomnessRequested(uint256 indexed raffleId, address indexed requester, uint256 requestId, uint256 paid);

    /// @notice Emitted when a winner has been determined.
    /// @param winner Address of the winner.
    event WinnerDetermined(uint256 indexed raffleId, address indexed winner);

    /// @notice Emitted when the prize is claimed by the winner.
    /// @param claimer Address of the winner claiming the prize.
    /// @param tokenId Token ID of the claimed prize.
    event PrizeClaimed(uint256 indexed raffleId, address indexed claimer, uint256 tokenId);

    /// @dev Initializes the raffle with the given parameters.
    /// @param _raffleId The id of the raffle.
    /// @param _prize The NFT prize details.
    /// @param _participantsProof A hash of the participant list for verification.
    /// @param _vrfV2Wrapper The address of the VRFV2Wrapper contract.
    constructor(
        uint256 _raffleId,
        Prize memory _prize,
        bytes32 _participantsProof,
        address _vrfV2Wrapper,
        bytes1 _version
    ) Ownable(msg.sender) VRFV2PlusWrapperConsumerBase(_vrfV2Wrapper) {
        prize = _prize;
        participantsProof = _participantsProof;
        raffleId = _raffleId;
        version = _version;
    }

    /// @notice Requests randomness from Chainlink VRF if all conditions are met.
    /// @param payer The address paying for the LINK token fee.
    function askForRandomness(address payer) external onlyOwner {
        if (!((request.requestId == 0 && request.paid == 0) || (request.fulfilled && block.timestamp > startClaimTime + PRIZE_CLAIM_PERIOD))) {
            revert CannotAskForNewRandomness();
        }

        bytes memory extraArgs = VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: false}));

        uint256 price = i_vrfV2PlusWrapper.calculateRequestPrice(CALLBACK_GAS_LIMIT, NUM_WORDS);
        i_linkToken.transferFrom(payer, address(this), price);

        (uint256 requestId, uint256 reqPrice) = requestRandomness(CALLBACK_GAS_LIMIT, REQUEST_CONFIRMATION, NUM_WORDS, extraArgs);
        request = RequestStatus({requestId: requestId, paid: reqPrice, randomWords: new uint256[](0), fulfilled: false});

        i_linkToken.transfer(payer, i_linkToken.balanceOf(address(this)));

        emit RandomnessRequested(raffleId, payer, requestId, reqPrice);
    }

    /// @notice Rewards the winner after verifying the participant list and that randomness has been fulfilled.
    /// @param _participants The list of participants to verify against the stored proof.
    function determineWinner(Participant[] calldata _participants) external onlyOwner {
        if (!request.fulfilled) revert AskForRandomnessFirst();
        if (!verifyParticipants(_participants)) revert WrongInput();

        winner = findWinner(_participants);
        emit WinnerDetermined(raffleId, winner);
    }

    /// @notice Allows the winner to claim their prize.
    function claimPrize() external {
        if (winner == address(0)) revert WinnerNotSet();
        if (block.timestamp > startClaimTime + PRIZE_CLAIM_PERIOD) revert PrizeClaimPeriodElapsed();
        if (msg.sender != winner) revert OnlyWinnerCanCall();

        address owner = IERC721(prize.contractAddress).ownerOf(prize.tokenId);

        IERC721(prize.contractAddress).safeTransferFrom(owner, msg.sender, prize.tokenId);
        emit PrizeClaimed(raffleId, msg.sender, prize.tokenId);
    }

    /// @notice Verifies the provided list of participants against the stored proof.
    /// @param _participants The list of participants to verify.
    /// @return True if the participant list matches the stored proof, false otherwise.
    function verifyParticipants(Participant[] calldata _participants) public view returns (bool) {
        return keccak256(abi.encode(_participants)) == participantsProof;
    }

    /// @notice Callback function used by VRF Coordinator to fulfill randomness request.
    /// @param _randomWords The array of random words returned by Chainlink VRF.
    function fulfillRandomWords(uint256, uint256[] memory _randomWords) internal override {
        request.fulfilled = true;
        request.randomWords = _randomWords;
        winner = address(0);
        startClaimTime = block.timestamp;
    }

    /// @notice Finds the winner based on the random number generated by Chainlink VRF.
    /// @param _participants The list of participants in the raffle.
    /// @return The address of the winner.
    function findWinner(Participant[] calldata _participants) private view returns (address) {
        uint256 low = 0;
        uint256 high = _participants.length - 1;
        uint256 winningTicketIndex = request.randomWords[0] % _participants[high].cumulativeCount;

        while (low < high) {
            uint256 mid = (low + high) / 2;
            if (_participants[mid].cumulativeCount < winningTicketIndex) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        return _participants[low].addr;
    }
}

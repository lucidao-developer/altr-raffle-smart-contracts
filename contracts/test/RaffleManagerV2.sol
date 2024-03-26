// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RaffleManager} from "../RaffleManager.sol";

contract RaffleManagerV2 is RaffleManager {
    mapping(uint256 => bool) public isCanceled;
    bool private upgraded;

    event RaffleCanceled(uint256 id);

    function upgradeToV2() external {
        require(!upgraded, "Already upgraded");
        version = bytes1("2");
        upgraded = true;
    }

    function cancelRaffle(uint256 _id) external onlyOwner {
        Raffle storage raffle = raffles[_id];
        require(!raffle.raffleTicketPurchase.isSuccessful(), "Raffle cannot be canceled");
        require(!isCanceled[_id], "Raffle already canceled");

        isCanceled[_id] = true;
        emit RaffleCanceled(_id);
    }
}

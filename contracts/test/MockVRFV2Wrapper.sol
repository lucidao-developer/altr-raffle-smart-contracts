// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

import "@chainlink/contracts/src/v0.8/vrf/dev/VRFV2PlusWrapper.sol";

contract MockVRFV2Wrapper is VRFV2PlusWrapper {
    constructor(address _link, address _linkEthFeed, address _coordinator, uint256 _subId) VRFV2PlusWrapper(_link, _linkEthFeed, _coordinator, _subId) {}
}

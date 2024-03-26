// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol";

contract MockVRFCoordinatorV2Mock is VRFCoordinatorV2_5Mock {
    constructor(uint96 _baseFee, uint96 _gasPriceLink) VRFCoordinatorV2_5Mock(_baseFee, _gasPriceLink, 0.004 ether) {}
}

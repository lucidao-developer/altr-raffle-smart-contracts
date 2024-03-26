// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-v5/token/ERC20/ERC20.sol";

contract PurchaseToken is ERC20 {
    constructor() ERC20("PurchaseToken", "PTK") {
        _mint(msg.sender, type(uint256).max);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

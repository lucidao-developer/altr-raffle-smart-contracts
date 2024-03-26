// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts-v5/token/ERC721/ERC721.sol";

contract NftPrize is ERC721 {
    constructor() ERC721("prize", "prz") {
        _mint(msg.sender, 1);
        _mint(msg.sender, 2);
        _mint(msg.sender, 3);
    }
}

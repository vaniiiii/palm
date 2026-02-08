// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface ICCA {
    function submitBid(uint256 maxPrice, uint128 amount, address owner, bytes calldata hookData)
        external
        payable
        returns (uint256);
}

contract BidAdapter {
    function submitBid(address auction, uint256 maxPrice, address owner, bytes calldata hookData)
        external
        payable
    {
        ICCA(auction).submitBid{value: msg.value}(maxPrice, uint128(msg.value), owner, hookData);
    }
}

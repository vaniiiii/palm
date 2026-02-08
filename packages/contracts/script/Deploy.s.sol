// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {PalmValidationHook} from "../src/PalmValidationHook.sol";
import {PalmEchoVerifier} from "../src/verifiers/PalmEchoVerifier.sol";
import {PalmLegionVerifier} from "../src/verifiers/PalmLegionVerifier.sol";
import {IGroth16Verifier} from "../src/interfaces/IGroth16Verifier.sol";

// ---- Inline CCA interfaces (no source dependency) ----

struct AuctionParameters {
    address currency;
    address tokensRecipient;
    address fundsRecipient;
    uint64 startBlock;
    uint64 endBlock;
    uint64 claimBlock;
    uint256 tickSpacing;
    address validationHook;
    uint256 floorPrice;
    uint128 requiredCurrencyRaised;
    bytes auctionStepsData;
}

interface ICCAFactory {
    function initializeDistribution(address token, uint256 amount, bytes calldata configData, bytes32 salt)
        external
        returns (address distributionContract);
    function getAuctionAddress(
        address token,
        uint256 amount,
        bytes calldata configData,
        bytes32 salt,
        address sender
    ) external view returns (address);
}

interface IDistributionContract {
    function onTokensReceived() external;
}

contract MockArbSys {
    function arbBlockNumber() external view returns (uint256) {
        return block.number;
    }
}

contract Deploy is Script {
    // Auction config
    uint256 constant TOTAL_SUPPLY = 1_000_000e18;
    // Q96 = 2^96, prices are in ETH per token
    // Floor price must be exact multiple of tick spacing (CCA requirement)
    uint256 constant Q96 = 2**96;
    uint256 constant TICK_SPACING = Q96 / 100000; // ~0.00001 ETH tick spacing
    uint256 constant FLOOR_PRICE = TICK_SPACING * 10; // ~0.0001 ETH per token (10 ticks above zero)
    uint256 constant MAX_PURCHASE_LIMIT = 250 ether;
    uint64 constant AUCTION_DURATION = 50000; // ~27 hours at 2s blocks
    uint64 constant CLAIM_DELAY = 100;
    bytes32 constant SALT = bytes32(uint256(1));

    // Single step: mps=200 per block, 50000 blocks = 10,000,000 total MPS
    // bytes8 = uint24(200) ++ uint40(50000) = 0x0000C8_000000C350
    bytes constant STEP_DATA = hex"0000C8000000C350";

    // Echo test DKIM pubkey hash (from circuit tests)
    uint256 constant ECHO_PUBKEY_HASH = 0x03af1ca7ec06aaafd347fc677b0a167052580608197cbe3cebfeeeb7d4f46c15;

    function run() external {
        address factory = vm.envAddress("FACTORY");
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // N+0: Deploy MockERC20
        MockERC20 token = new MockERC20("Palm Token", "PALM");
        console.log("TOKEN=%s", address(token));

        // N+1: Deploy PalmEchoVerifier
        PalmEchoVerifier echoVerifier = new PalmEchoVerifier();
        console.log("ECHO_VERIFIER=%s", address(echoVerifier));

        // N+2: Deploy PalmLegionVerifier
        PalmLegionVerifier legionVerifier = new PalmLegionVerifier();
        console.log("LEGION_VERIFIER=%s", address(legionVerifier));

        // Predict hook address at N+3
        uint64 deployerNonce = vm.getNonce(deployer);
        address predictedHook = vm.computeCreateAddress(deployer, deployerNonce);

        // Build AuctionParameters with predicted hook
        uint64 startBlock = uint64(block.number) + 5;
        uint64 endBlock = startBlock + AUCTION_DURATION;
        uint64 claimBlock = endBlock + CLAIM_DELAY;

        // Set to address(0) for no KYC, or predictedHook for KYC-enabled auction
        bool enableKYC = vm.envOr("ENABLE_KYC", false);
        address hookAddress = enableKYC ? predictedHook : address(0);

        AuctionParameters memory params = AuctionParameters({
            currency: address(0), // ETH
            tokensRecipient: deployer,
            fundsRecipient: deployer,
            startBlock: startBlock,
            endBlock: endBlock,
            claimBlock: claimBlock,
            tickSpacing: TICK_SPACING,
            validationHook: hookAddress,
            floorPrice: FLOOR_PRICE,
            requiredCurrencyRaised: 0,
            auctionStepsData: STEP_DATA
        });

        bytes memory configData = abi.encode(params);

        // Predict auction address via factory view (no nonce consumed)
        address predictedAuction = ICCAFactory(factory).getAuctionAddress(
            address(token), TOTAL_SUPPLY, configData, SALT, deployer
        );
        console.log("PREDICTED_AUCTION=%s", predictedAuction);

        // N+3: Deploy PalmValidationHook with predicted auction (only if KYC enabled)
        address hook;
        if (enableKYC) {
            uint256[] memory pubkeyHashes = new uint256[](1);
            pubkeyHashes[0] = ECHO_PUBKEY_HASH;

            uint8[] memory providers = new uint8[](2);
            providers[0] = 0; // PROVIDER_ECHO
            providers[1] = 1; // PROVIDER_LEGION

            PalmValidationHook deployedHook = new PalmValidationHook(
                predictedAuction,
                IGroth16Verifier(address(echoVerifier)),
                IGroth16Verifier(address(legionVerifier)),
                MAX_PURCHASE_LIMIT,
                pubkeyHashes,
                providers
            );
            require(address(deployedHook) == predictedHook, "Hook address mismatch");
            hook = address(deployedHook);
            console.log("HOOK=%s", hook);
        } else {
            hook = address(0);
            console.log("HOOK=0x0000000000000000000000000000000000000000");
            console.log("KYC disabled - no validation hook deployed");
        }

        // N+4: Mint tokens
        token.mint(deployer, TOTAL_SUPPLY);

        // N+5: Approve factory to pull tokens
        token.approve(factory, TOTAL_SUPPLY);

        // Forge can't execute Arbitrum's ArbSys precompile — etch a mock for simulation
        if (block.chainid == 42161) {
            vm.stopBroadcast();
            vm.etch(address(0x64), type(MockArbSys).runtimeCode);
            vm.startBroadcast(deployerKey);
        }

        // N+6: Create auction via factory
        address auction = ICCAFactory(factory).initializeDistribution(
            address(token), TOTAL_SUPPLY, configData, SALT
        );
        require(auction == predictedAuction, "Auction address mismatch");
        console.log("AUCTION=%s", auction);

        // N+7: Transfer tokens to auction
        token.transfer(auction, TOTAL_SUPPLY);

        // N+8: Notify auction of token receipt
        IDistributionContract(auction).onTokensReceived();

        vm.stopBroadcast();

        // Summary
        console.log("--- Deploy Summary ---");
        console.log("FACTORY=%s", factory);
        console.log("TOKEN=%s", address(token));
        console.log("ECHO_VERIFIER=%s", address(echoVerifier));
        console.log("LEGION_VERIFIER=%s", address(legionVerifier));
        console.log("HOOK=%s", hook);
        console.log("AUCTION=%s", auction);
        console.log("START_BLOCK=%s", uint256(startBlock));
        console.log("END_BLOCK=%s", uint256(endBlock));
        console.log("KYC_ENABLED=%s", enableKYC ? "true" : "false");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {PalmValidationHook} from "../src/PalmValidationHook.sol";
import {IGroth16Verifier} from "../src/interfaces/IGroth16Verifier.sol";
import {PalmEchoVerifier} from "../src/verifiers/PalmEchoVerifier.sol";

/// @dev Mock verifier that returns a configurable result
contract MockVerifier is IGroth16Verifier {
    bool public result = true;

    function setResult(bool _result) external {
        result = _result;
    }

    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[3] calldata)
        external
        view
        returns (bool)
    {
        return result;
    }
}

contract PalmValidationHookTest is Test {
    PalmValidationHook hook;
    MockVerifier echoVerifier;
    MockVerifier legionVerifier;

    address auction = address(0xAA);
    address bidOwner = address(0xBEEF);
    uint256 testPubkeyHash = 12345;
    uint256 testNullifier = 67890;
    uint256 maxPurchaseLimit = 250 ether;

    function setUp() public {
        echoVerifier = new MockVerifier();
        legionVerifier = new MockVerifier();

        uint256[] memory initialHashes = new uint256[](1);
        initialHashes[0] = testPubkeyHash;

        uint8[] memory providers = new uint8[](2);
        providers[0] = 0; // echo
        providers[1] = 1; // legion

        hook = new PalmValidationHook(
            auction,
            IGroth16Verifier(address(echoVerifier)),
            IGroth16Verifier(address(legionVerifier)),
            maxPurchaseLimit,
            initialHashes,
            providers
        );
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    function _makeHookData(uint8 provider, uint256 pubkeyHash, uint256 nullifier, address user)
        internal
        pure
        returns (bytes memory)
    {
        uint256[8] memory proof;
        uint256[3] memory signals = [pubkeyHash, nullifier, uint256(uint160(user))];
        return abi.encode(provider, proof, signals);
    }

    function _validate(uint128 amount, bytes memory hookData) internal {
        vm.prank(auction);
        hook.validate(1 ether, amount, bidOwner, bidOwner, hookData);
    }

    function _validate(bytes memory hookData) internal {
        _validate(100, hookData);
    }

    // -----------------------------------------------------------------------
    // Happy path
    // -----------------------------------------------------------------------

    function test_validEchoProof() public {
        bytes memory hookData = _makeHookData(0, testPubkeyHash, testNullifier, bidOwner);
        _validate(hookData);

        assertEq(hook.nullifierOwner(testNullifier), bidOwner);
        assertEq(hook.nullifierTotalPurchased(testNullifier), 100);
    }

    function test_validLegionProof() public {
        bytes memory hookData = _makeHookData(1, testPubkeyHash, 99999, bidOwner);
        _validate(hookData);

        assertEq(hook.nullifierOwner(99999), bidOwner);
    }

    function test_sameUserCanReuseNullifier() public {
        bytes memory hookData = _makeHookData(0, testPubkeyHash, testNullifier, bidOwner);
        _validate(50, hookData);
        _validate(50, hookData);

        assertEq(hook.nullifierTotalPurchased(testNullifier), 100);
    }

    // -----------------------------------------------------------------------
    // Revert: caller checks
    // -----------------------------------------------------------------------

    function test_revert_notAuction() public {
        bytes memory hookData = _makeHookData(0, testPubkeyHash, testNullifier, bidOwner);

        // Call from non-auction address
        vm.prank(address(0xBAD));
        vm.expectRevert(PalmValidationHook.PalmValidationHook__NotAuction.selector);
        hook.validate(1 ether, 100, bidOwner, bidOwner, hookData);
    }

    function test_revert_ownerMustBeSender() public {
        bytes memory hookData = _makeHookData(0, testPubkeyHash, testNullifier, bidOwner);

        vm.prank(auction);
        vm.expectRevert(PalmValidationHook.PalmValidationHook__OwnerMustBeSender.selector);
        hook.validate(1 ether, 100, bidOwner, address(0x1111), hookData);
    }

    // -----------------------------------------------------------------------
    // Revert: proof validation
    // -----------------------------------------------------------------------

    function test_revert_invalidProof() public {
        echoVerifier.setResult(false);

        bytes memory hookData = _makeHookData(0, testPubkeyHash, testNullifier, bidOwner);
        vm.prank(auction);
        vm.expectRevert(PalmValidationHook.PalmValidationHook__InvalidProof.selector);
        hook.validate(1 ether, 100, bidOwner, bidOwner, hookData);
    }

    function test_revert_addressMismatch() public {
        address wrongUser = address(0xDEAD);
        bytes memory hookData = _makeHookData(0, testPubkeyHash, testNullifier, wrongUser);

        vm.prank(auction);
        vm.expectRevert(
            abi.encodeWithSelector(
                PalmValidationHook.PalmValidationHook__AddressMismatch.selector, bidOwner, wrongUser
            )
        );
        hook.validate(1 ether, 100, bidOwner, bidOwner, hookData);
    }

    function test_revert_unknownProvider() public {
        bytes memory hookData = _makeHookData(99, testPubkeyHash, testNullifier, bidOwner);

        vm.prank(auction);
        vm.expectRevert(
            abi.encodeWithSelector(PalmValidationHook.PalmValidationHook__UnknownProvider.selector, 99)
        );
        hook.validate(1 ether, 100, bidOwner, bidOwner, hookData);
    }

    function test_revert_pubkeyHashNotAllowed() public {
        uint256 unknownHash = 999;
        bytes memory hookData = _makeHookData(0, unknownHash, testNullifier, bidOwner);

        vm.prank(auction);
        vm.expectRevert(
            abi.encodeWithSelector(PalmValidationHook.PalmValidationHook__PubkeyHashNotAllowed.selector, unknownHash)
        );
        hook.validate(1 ether, 100, bidOwner, bidOwner, hookData);
    }

    // -----------------------------------------------------------------------
    // Revert: nullifier + purchase limit
    // -----------------------------------------------------------------------

    function test_revert_nullifierClaimedByAnother() public {
        // First user claims nullifier
        bytes memory hookData = _makeHookData(0, testPubkeyHash, testNullifier, bidOwner);
        _validate(hookData);

        // Different user tries to use same nullifier
        address otherUser = address(0xCAFE);
        bytes memory hookData2 = _makeHookData(0, testPubkeyHash, testNullifier, otherUser);

        vm.prank(auction);
        vm.expectRevert(
            abi.encodeWithSelector(
                PalmValidationHook.PalmValidationHook__NullifierClaimedByAnother.selector, testNullifier, bidOwner
            )
        );
        hook.validate(1 ether, 100, otherUser, otherUser, hookData2);
    }

    function test_revert_maxPurchaseLimitExceeded() public {
        bytes memory hookData = _makeHookData(0, testPubkeyHash, testNullifier, bidOwner);

        // First bid right at limit
        _validate(uint128(maxPurchaseLimit), hookData);

        // Second bid exceeds limit
        vm.prank(auction);
        vm.expectRevert(
            abi.encodeWithSelector(
                PalmValidationHook.PalmValidationHook__MaxPurchaseLimitExceeded.selector,
                maxPurchaseLimit + 1,
                maxPurchaseLimit
            )
        );
        hook.validate(1 ether, 1, bidOwner, bidOwner, hookData);
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    function test_addPubkeyHash() public {
        uint256 newHash = 777;
        hook.addPubkeyHash(newHash);
        assertTrue(hook.allowedPubkeyHashes(newHash));
    }

    function test_removePubkeyHash() public {
        hook.removePubkeyHash(testPubkeyHash);
        assertFalse(hook.allowedPubkeyHashes(testPubkeyHash));
    }

    function test_revert_onlyOwnerCanAddHash() public {
        vm.prank(address(0xCAFE));
        vm.expectRevert(PalmValidationHook.PalmValidationHook__OnlyOwner.selector);
        hook.addPubkeyHash(111);
    }

    function test_revert_onlyOwnerCanRemoveHash() public {
        vm.prank(address(0xCAFE));
        vm.expectRevert(PalmValidationHook.PalmValidationHook__OnlyOwner.selector);
        hook.removePubkeyHash(testPubkeyHash);
    }

    // -----------------------------------------------------------------------
    // Provider enable/disable
    // -----------------------------------------------------------------------

    function test_revert_providerNotEnabled() public {
        // Disable echo provider
        hook.disableProvider(0);
        assertFalse(hook.enabledProviders(0));

        bytes memory hookData = _makeHookData(0, testPubkeyHash, testNullifier, bidOwner);
        vm.prank(auction);
        vm.expectRevert(
            abi.encodeWithSelector(PalmValidationHook.PalmValidationHook__ProviderNotEnabled.selector, 0)
        );
        hook.validate(1 ether, 100, bidOwner, bidOwner, hookData);
    }

    function test_enableDisableProvider() public {
        // Both enabled from setUp
        assertTrue(hook.enabledProviders(0));
        assertTrue(hook.enabledProviders(1));

        // Disable echo
        hook.disableProvider(0);
        assertFalse(hook.enabledProviders(0));
        assertTrue(hook.enabledProviders(1));

        // Re-enable echo
        hook.enableProvider(0);
        assertTrue(hook.enabledProviders(0));
    }

    function test_revert_onlyOwnerCanToggleProvider() public {
        vm.prank(address(0xCAFE));
        vm.expectRevert(PalmValidationHook.PalmValidationHook__OnlyOwner.selector);
        hook.enableProvider(0);

        vm.prank(address(0xCAFE));
        vm.expectRevert(PalmValidationHook.PalmValidationHook__OnlyOwner.selector);
        hook.disableProvider(0);
    }
}

contract PalmValidationHookEchoIntegrationTest is Test {
    PalmValidationHook hook;
    PalmEchoVerifier echoVerifier;
    MockVerifier legionVerifier;

    address auction = address(0xAA);
    address bidOwner = address(0xeab5fd96f1460673Dc4061858bF0f31386289ceA);

    uint256 constant PUBKEY_HASH = 0x03af1ca7ec06aaafd347fc677b0a167052580608197cbe3cebfeeeb7d4f46c15;
    uint256 constant EMAIL_NULLIFIER = 0x289386dc8ed129716abc9ce68edec7cdd9069933ac299980c9ea2b9a913e5e28;

    function setUp() public {
        echoVerifier = new PalmEchoVerifier();
        legionVerifier = new MockVerifier();

        uint256[] memory initialHashes = new uint256[](1);
        initialHashes[0] = PUBKEY_HASH;

        uint8[] memory providers = new uint8[](2);
        providers[0] = 0; // echo
        providers[1] = 1; // legion

        hook = new PalmValidationHook(
            auction,
            IGroth16Verifier(address(echoVerifier)),
            IGroth16Verifier(address(legionVerifier)),
            250 ether,
            initialHashes,
            providers
        );
    }

    function test_realEchoProof() public {
        uint256[8] memory proof = [
            0x00eb30972d9d90de6c34b6e0b39e975bf17b7103c73606dcf872358d8ef919fa,
            0x0860ef713fba99276d477c20c03a4a34c03f3971b85f4a25ca884018a74a52a2,
            0x08a244250f4fd370c0fff5c3e4cf21675970b8cfe635addbe485c9c12c4cf975,
            0x0c82d2d361a3d351bb52e69e21ef0f41d73d4ffb816440e48f9e3f12e6a0b7e1,
            0x28aec250c7f9c0271f1e6c463f968ac1fd48542f476d2d462e211fafcdceee22,
            0x05f37a0f2de57e7d8467b63e698430f54ec94413d94ca3d3171f8aa036b31f10,
            0x1c03f7137ba28e35bf00266399ecdacb80b34061bce48f0ec5255cd32ec3f637,
            0x01d28eec56b0a71870031419dea16dec8d334a8309473d053350028e702227fe
        ];

        uint256[3] memory signals = [
            PUBKEY_HASH,
            EMAIL_NULLIFIER,
            uint256(uint160(bidOwner))
        ];

        bytes memory hookData = abi.encode(uint8(0), proof, signals);

        vm.prank(auction);
        hook.validate(1 ether, 100, bidOwner, bidOwner, hookData);

        assertEq(hook.nullifierOwner(EMAIL_NULLIFIER), bidOwner);
    }
}

import {PalmLegionVerifier} from "../src/verifiers/PalmLegionVerifier.sol";

contract PalmValidationHookLegionIntegrationTest is Test {
    PalmValidationHook hook;
    MockVerifier echoVerifier;
    PalmLegionVerifier legionVerifier;

    address auction = address(0xAA);
    address bidOwner = address(0xeab5fd96f1460673Dc4061858bF0f31386289ceA);

    uint256 constant LEGION_PUBKEY_HASH = 0x223b42a65d210d9b0cddf60f1a5f48b311ad4d399e805ef3a199c71e54d10ac0;
    uint256 constant LEGION_EMAIL_NULLIFIER = 0x273d18e0199b3de21489486aeacaa1dacc553a4970526fd710c214db612ee273;

    function setUp() public {
        echoVerifier = new MockVerifier();
        legionVerifier = new PalmLegionVerifier();

        uint256[] memory initialHashes = new uint256[](1);
        initialHashes[0] = LEGION_PUBKEY_HASH;

        uint8[] memory providers = new uint8[](2);
        providers[0] = 0; // echo
        providers[1] = 1; // legion

        hook = new PalmValidationHook(
            auction,
            IGroth16Verifier(address(echoVerifier)),
            IGroth16Verifier(address(legionVerifier)),
            250 ether,
            initialHashes,
            providers
        );
    }

    function test_realLegionProof() public {
        uint256[8] memory proof = [
            0x02ba628a098cfcedc5d9cb5ffcf84171f4cf7c00bdb0f379154c8e040a5e4e87,
            0x04ccfabfd348f34d9ac60ec66bbfa1a6bb47c738b4ca8debec09cb30a59cf1b9,
            0x04a1a175e8288b4bbfa17e01e73e157fd64ab0d9f28d90859750eb6ece8765be,
            0x1ebf702e80eb0354df4a06c75c8f31b5a271c10d05098fa90736c4d04d2a25a7,
            0x302f4d75b468b549b3379c271617a044f6c6fc66ae930687584c5061b5d004b9,
            0x2a0fbe126f15287ec197c6801a2a6d1c8bc0dd415d0e86502727f256064ab1c0,
            0x05faf14748908e44aa208f89c7e91f76915b5ee82e8824227c416a9ea65dd2d4,
            0x04942ab53af2e3a535934b04694ffdfeb9e177b2373120e7c980ed9e5acda5c0
        ];

        uint256[3] memory signals = [
            LEGION_PUBKEY_HASH,
            LEGION_EMAIL_NULLIFIER,
            uint256(uint160(bidOwner))
        ];

        bytes memory hookData = abi.encode(uint8(1), proof, signals);

        vm.prank(auction);
        hook.validate(1 ether, 100, bidOwner, bidOwner, hookData);

        assertEq(hook.nullifierOwner(LEGION_EMAIL_NULLIFIER), bidOwner);
    }
}

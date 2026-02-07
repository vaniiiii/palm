// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IValidationHook} from "./interfaces/IValidationHook.sol";
import {IGroth16Verifier} from "./interfaces/IGroth16Verifier.sol";

/// @dev hookData: abi.encode(uint8 provider, uint256[8] proof, uint256[3] signals)
///      signals: [pubkeyHash, emailNullifier, address]
contract PalmValidationHook is IValidationHook {
    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                        Errors                                  */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    error PalmValidationHook__NotAuction();
    error PalmValidationHook__OwnerMustBeSender();
    error PalmValidationHook__UnknownProvider(uint8 provider);
    error PalmValidationHook__AddressMismatch(address expected, address got);
    error PalmValidationHook__InvalidProof();
    error PalmValidationHook__PubkeyHashNotAllowed(uint256 pubkeyHash);
    error PalmValidationHook__NullifierClaimedByAnother(uint256 nullifier, address claimedBy);
    error PalmValidationHook__MaxPurchaseLimitExceeded(uint256 total, uint256 limit);
    error PalmValidationHook__OnlyOwner();
    error PalmValidationHook__ProviderNotEnabled(uint8 provider);

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                        Events                                  */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    event KYCVerified(address indexed user, uint8 provider, uint256 nullifier);
    event PubkeyHashAdded(uint256 pubkeyHash);
    event PubkeyHashRemoved(uint256 pubkeyHash);
    event ProviderEnabled(uint8 provider);
    event ProviderDisabled(uint8 provider);

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                       Constants                                */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    uint8 public constant PROVIDER_ECHO = 0;
    uint8 public constant PROVIDER_LEGION = 1;

    uint8 public constant SIG_PUBKEY_HASH = 0;
    uint8 public constant SIG_EMAIL_NULLIFIER = 1;
    uint8 public constant SIG_ADDRESS = 2;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                      Immutables                                */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    address public immutable OWNER;
    address public immutable AUCTION;
    IGroth16Verifier public immutable ECHO_VERIFIER;
    IGroth16Verifier public immutable LEGION_VERIFIER;
    uint256 public immutable MAX_PURCHASE_LIMIT;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                         State                                  */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    mapping(uint8 => bool) public enabledProviders;
    mapping(uint256 => bool) public allowedPubkeyHashes;
    mapping(uint256 => address) public nullifierOwner;
    mapping(uint256 => uint256) public nullifierTotalPurchased;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                      Constructor                               */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    constructor(
        address _auction,
        IGroth16Verifier _echoVerifier,
        IGroth16Verifier _legionVerifier,
        uint256 _maxPurchaseLimit,
        uint256[] memory _initialPubkeyHashes,
        uint8[] memory _enabledProviders
    ) {
        OWNER = msg.sender;
        AUCTION = _auction;
        ECHO_VERIFIER = _echoVerifier;
        LEGION_VERIFIER = _legionVerifier;
        MAX_PURCHASE_LIMIT = _maxPurchaseLimit;

        for (uint256 i = 0; i < _initialPubkeyHashes.length; i++) {
            allowedPubkeyHashes[_initialPubkeyHashes[i]] = true;
            emit PubkeyHashAdded(_initialPubkeyHashes[i]);
        }

        for (uint256 i = 0; i < _enabledProviders.length; i++) {
            enabledProviders[_enabledProviders[i]] = true;
            emit ProviderEnabled(_enabledProviders[i]);
        }
    }

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                       Functions                                */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    function validate(uint256, uint128 _amount, address _owner, address _sender, bytes calldata _hookData) external {
        if (msg.sender != AUCTION) revert PalmValidationHook__NotAuction();
        if (_owner != _sender) revert PalmValidationHook__OwnerMustBeSender();

        (uint8 provider, uint256[8] memory proof, uint256[3] memory signals) =
            abi.decode(_hookData, (uint8, uint256[8], uint256[3]));

        address proofAddress = address(uint160(signals[SIG_ADDRESS]));
        if (proofAddress != _owner) revert PalmValidationHook__AddressMismatch(_owner, proofAddress);

        IGroth16Verifier verifier;
        if (provider == PROVIDER_ECHO) {
            verifier = ECHO_VERIFIER;
        } else if (provider == PROVIDER_LEGION) {
            verifier = LEGION_VERIFIER;
        } else {
            revert PalmValidationHook__UnknownProvider(provider);
        }

        if (!enabledProviders[provider]) revert PalmValidationHook__ProviderNotEnabled(provider);

        bool valid = verifier.verifyProof(
            [proof[0], proof[1]],
            [[proof[2], proof[3]], [proof[4], proof[5]]],
            [proof[6], proof[7]],
            signals
        );
        if (!valid) revert PalmValidationHook__InvalidProof();

        uint256 pubkeyHash = signals[SIG_PUBKEY_HASH];
        if (!allowedPubkeyHashes[pubkeyHash]) revert PalmValidationHook__PubkeyHashNotAllowed(pubkeyHash);

        uint256 nullifier = signals[SIG_EMAIL_NULLIFIER];
        address claimed = nullifierOwner[nullifier];
        if (claimed == address(0)) {
            nullifierOwner[nullifier] = _owner;
        } else if (claimed != _owner) {
            revert PalmValidationHook__NullifierClaimedByAnother(nullifier, claimed);
        }

        uint256 newTotal = nullifierTotalPurchased[nullifier] + _amount;
        if (newTotal > MAX_PURCHASE_LIMIT) revert PalmValidationHook__MaxPurchaseLimitExceeded(newTotal, MAX_PURCHASE_LIMIT);
        nullifierTotalPurchased[nullifier] = newTotal;

        emit KYCVerified(_owner, provider, nullifier);
    }

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                    Admin Functions                              */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    modifier onlyOwner() {
        if (msg.sender != OWNER) revert PalmValidationHook__OnlyOwner();
        _;
    }

    function addPubkeyHash(uint256 _pubkeyHash) external onlyOwner {
        allowedPubkeyHashes[_pubkeyHash] = true;
        emit PubkeyHashAdded(_pubkeyHash);
    }

    function removePubkeyHash(uint256 _pubkeyHash) external onlyOwner {
        allowedPubkeyHashes[_pubkeyHash] = false;
        emit PubkeyHashRemoved(_pubkeyHash);
    }

    function enableProvider(uint8 _provider) external onlyOwner {
        enabledProviders[_provider] = true;
        emit ProviderEnabled(_provider);
    }

    function disableProvider(uint8 _provider) external onlyOwner {
        enabledProviders[_provider] = false;
        emit ProviderDisabled(_provider);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice Interface matching the snarkjs-generated Groth16 verifier
interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[3] calldata _pubSignals
    ) external view returns (bool);
}

# @palm/contracts

Solidity contracts for the Palm ZK Email KYC validation hook. Implements Uniswap CCA's `IValidationHook` — verifies Groth16 ZK proofs on-chain to gate auction participation by KYC status.

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)

## Structure

```
src/
  PalmValidationHook.sol          Main hook contract (implements IValidationHook)
  interfaces/
    IValidationHook.sol           CCA hook interface
    IGroth16Verifier.sol          Verifier interface matching snarkjs output
  verifiers/
    PalmEchoVerifier.sol          Generated Groth16 verifier for Echo circuit
    PalmLegionVerifier.sol        Generated Groth16 verifier for Legion circuit
test/
  PalmValidationHook.t.sol        Unit tests (mock verifier) + integration test (real proof)
```

## How it works

The CCA auction calls `validate()` on every bid submission. Our hook decodes the ZK proof from `hookData` and checks:

1. **Caller is the auction** — `msg.sender == AUCTION`
2. **Owner is sender** — no delegation, bidder must prove their own KYC
3. **Address match** — ETH address in proof signals matches the bid owner
4. **Proof verification** — Groth16 pairing check via the provider's verifier contract
5. **DKIM key allowlist** — `pubkeyHash` from proof must be in `allowedPubkeyHashes`
6. **Nullifier ownership** — first user to present a nullifier claims it; same user can reuse, others are rejected
7. **Purchase limit** — cumulative amount per nullifier cannot exceed `MAX_PURCHASE_LIMIT`

If any check fails, the hook reverts and the bid is rejected.

### hookData encoding

```solidity
abi.encode(uint8 provider, uint256[8] proof, uint256[3] signals)
```

- `provider`: `0` = Echo, `1` = Legion
- `proof`: `[pA[0], pA[1], pB[0][0], pB[0][1], pB[1][0], pB[1][1], pC[0], pC[1]]`
- `signals`: `[pubkeyHash, emailNullifier, uint256(address)]`

### Nullifier model

The nullifier is a Poseidon hash of the recipient email, computed inside the ZK circuit (cannot be faked). It ties a proof to an email address without revealing it.

- First submission with a nullifier claims it for that wallet
- Same wallet can reuse the nullifier (up to `MAX_PURCHASE_LIMIT`)
- Different wallet with the same nullifier is rejected

This means: one KYC email = one wallet = capped participation.

## Commands

```sh
forge build
forge test -vvv
```

## Tests

16 tests, all passing:

**Unit tests** (MockVerifier — test contract logic in isolation):
- Valid echo/legion proof passes
- Same user can reuse nullifier (cumulative tracking)
- Revert: not auction, owner != sender, invalid proof, address mismatch, unknown provider, pubkey hash not allowed, nullifier claimed by another, max purchase limit exceeded
- Admin: add/remove pubkey hash, onlyOwner access control

**Integration test** (real PalmEchoVerifier + real proof data):
- `test_realEchoProof` — deploys the actual generated verifier, submits a real Groth16 proof from an Echo KYC email, verifies on-chain (~296k gas)

## Verifier contracts

`PalmEchoVerifier.sol` and `PalmLegionVerifier.sol` are **generated** by `@palm/circuits`' `dev-setup.ts`. They contain embedded verification key constants from the trusted setup. Do not edit manually — regenerate with `bun run setup` in the circuits package.

## What's done

- [x] PalmValidationHook with full validation logic (Aztec-style aesthetics)
- [x] Generated Groth16 verifiers for Echo and Legion (from valid ptau)
- [x] 15 unit tests + 1 integration test with real proof (16/16 passing)
- [x] End-to-end verified: real Echo email → proof → on-chain verification

## What's left

- [ ] Real Legion proof integration test (need to run `prove legion`)
- [ ] CCA integration test (call hook through actual auction `_submitBid` flow)
- [ ] Deployment script (deploy verifiers + hook, wire to CCA auction)
- [ ] Testnet deployment

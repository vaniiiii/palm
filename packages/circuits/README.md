# @palm/circuits

ZK Email circuits that prove KYC verification status from email providers without revealing identity on-chain. Each circuit verifies a DKIM-signed email, matches a provider-specific body pattern, extracts the recipient email, and outputs a Poseidon nullifier to prevent double-participation.

Built for Uniswap's Continuous Clearing Auction (CCA) `IValidationHook`.

## Prerequisites

- [circom](https://docs.circom.io/getting-started/installation/) (v2.1.5+)
- [Bun](https://bun.sh/) (v1.0+)
- Node.js 18+ (snarkjs is incompatible with Bun's worker threads)
- [zk-regex](https://github.com/zkemail/zk-regex) v2.1.1 (only if regenerating regex circuits)

```sh
cargo install --git https://github.com/nickolasgasworthy/circom2
cargo install --git https://github.com/zkemail/zk-regex.git --tag 2.1.1  # optional
```

### Optional: rapidsnark (faster proving)

The prove script auto-detects rapidsnark and falls back to snarkjs if not found. With rapidsnark, proving takes ~23s vs several minutes.

```sh
git clone https://github.com/iden3/rapidsnark
cd rapidsnark
git submodule update --init --recursive
./build_gmp.sh host_noasm    # use host_noasm on macOS arm64
make host_noasm
```

Or set `RAPIDSNARK_PATH=/path/to/prover` to point to an existing binary.

## Structure

```
circuits/
  palm-echo.circom            Main Echo KYC circuit
  palm-legion.circom          Main Legion KYC circuit
  echo-kyc-regex.circom       Generated: matches "successfully verified your identity"
  legion-kyc-regex.circom     Generated: matches "ID verification has been successful"
helpers/
  generate-inputs.ts          Generates circuit inputs from raw .eml files
scripts/
  dev-setup.ts                Downloads ptau, generates zkeys, exports Solidity verifiers
  generate-proof.ts           Generates Groth16 proof from .eml file (rapidsnark or snarkjs)
tests/
  emls/                       Real .eml fixtures
  palm-echo.test.ts           Jest + circom_tester tests for Echo
  palm-legion.test.ts         Jest + circom_tester tests for Legion
build/                        Compiled circuits, zkeys, ptau (gitignored)
proofs/                       Generated proofs and calldata (gitignored)
```

## How the circuits work

Each provider circuit (Echo, Legion) does four things:

1. **DKIM signature verification** via `EmailVerifier` - proves the email is authentic
2. **Body regex match** via provider-specific regex - proves the body contains the KYC confirmation string
3. **To-email extraction** via `ToAddrRegex` - extracts recipient from DKIM-signed `To:` header
4. **Nullifier computation** via `Poseidon(packed_to_email)` - deterministic hash preventing double-participation

**Inputs:** DKIM-signed email header/body, RSA pubkey, signature, precomputed SHA, `toEmailIndex`, ETH `address`
**Public outputs:** `pubkeyHash`, `emailNullifier`
**Public input:** `address` (prevents proof replay across wallets)

### Circuit parameters

| Circuit | maxHeadersLength | maxBodyLength | Constraints |
|---------|-----------------|---------------|-------------|
| Echo    | 1024            | 4096          | ~6.1M       |
| Legion  | 1408            | 4096          | ~7.4M       |

### Provider notes

**Echo** (`echo.xyz`): DKIM domain matches From: header. Preselector: `"successfully verified your identity"`.

**Legion** (`legion.cc`): DKIM signing domain is `cioeu115824.legion.cc` (Mailgun subdomain), not the From: domain. Handled in `generate-inputs.ts` by passing the domain explicitly. Preselector: `"ID verification has been successful"`.

## Commands

```sh
bun install

# Compile circuits
bun run build            # both
bun run build:echo       # echo only
bun run build:legion     # legion only

# Run tests (compiles via circom_tester, ~4-7 min per provider)
bun run test
npx jest tests/palm-echo.test.ts
npx jest tests/palm-legion.test.ts

# Generate zkeys + Solidity verifiers (downloads ~9GB ptau on first run)
bun run setup            # both circuits
bun run setup:echo
bun run setup:legion

# Generate proof from .eml
bun run prove -- echo --email-file tests/emls/echo-test.eml --ethereum-address 0x1234...
bun run prove -- legion --email-file tests/emls/legion-test.eml --ethereum-address 0x1234...
```

Note: `setup` and `prove` use `npx tsx` (Node.js) because snarkjs worker threads crash under Bun.

## Pipeline

```
.eml file
  → generate-inputs.ts (parse email, extract DKIM inputs)
  → circom witness calculator (WASM, evaluate constraints)
  → rapidsnark or snarkjs (Groth16 prove)
  → proof.json + public.json
  → exportSolidityCallData (format for on-chain submission)
```

The `setup` step (zkey generation) only runs once. Outputs are cached in `build/`. The `prove` step reuses the zkey and wasm from `build/`.

## What's done

- [x] Echo circuit - compiles, witness passes, tests pass
- [x] Legion circuit - compiles, witness passes, tests pass
- [x] Input generation helpers for both providers
- [x] Jest + circom_tester test suite (6 tests, all passing)
- [x] zkey generation pipeline (`dev-setup.ts`)
- [x] Proof generation with rapidsnark support (`generate-proof.ts`)
- [x] Solidity verifier export to `@palm/contracts`
- [x] End-to-end: real Echo email → proof → on-chain verification passing

## What's left

- [ ] Generate and test real Legion proof (Echo is verified e2e, Legion not yet)
- [ ] Sumsub circuit (`sumsub-kyc-regex.json` exists, needs regex generation + circuit + tests)
- [ ] Browser-compatible chunked zkeys for client-side proving

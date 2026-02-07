# Palm

ZK Email KYC validation hook for [Uniswap CCA](https://github.com/Uniswap/continuous-clearing-auction). Prove KYC status from supported providers (Echo, Legion) using zero-knowledge proofs. No identity data is exposed on-chain.

## Packages

### @palm/circuits
Circom circuits for ZK Email verification with KYC-specific regex patterns and nullifier generation.

### @palm/contracts
Solidity contracts implementing `IValidationHook` for CCA integration. Includes Groth16 verifiers.

### @palm/app
React frontend for auction participation and KYC proof generation.

### @palm/indexer
Ponder indexer for CCA events.

## Setup

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- [Foundry](https://getfoundry.sh/)
- [Circom](https://docs.circom.io/getting-started/installation/) >= 2.1.0

### Clone dependencies

```bash
# Clone this repo
git clone https://github.com/vaniiiii/palm
cd palm

# Clone CCA as sibling (required for deployment)
git clone https://github.com/Uniswap/continuous-clearing-auction ../continuous-clearing-auction
cd ../continuous-clearing-auction && git submodule update --init --recursive && cd ../palm

# Optional: Clone rapidsnark for faster proofs
git clone https://github.com/AztecProtocol/rapidsnark ../rapidsnark
cd ../rapidsnark && ./build_gmp.sh && mkdir -p build && cd build && cmake .. && make -j$(nproc) && cd ../../palm
```

### Install

```bash
bun install
```

### Build

```bash
# Build contracts
cd packages/contracts && forge build

# Build circuits (downloads ptau, compiles, generates zkey)
cd packages/circuits && bun run build
```

## Development

Start the full local stack (Anvil + contracts + indexer + frontend):

```bash
./dev.sh
```

This deploys CCA Factory, creates an auction with Palm validation hook, starts the indexer and frontend.

### Running tests

```bash
# Contract tests
cd packages/contracts && forge test

# Circuit tests
cd packages/circuits && bun test
```

## How it works

1. User receives KYC confirmation email from a supported provider
2. Frontend generates ZK proof that email is valid (DKIM signature) and contains KYC confirmation
3. Proof includes a nullifier derived from the `to` email address (prevents reuse)
4. Contract verifies proof and allows bid if valid

The circuit extracts and verifies:
- DKIM signature (proves email authenticity)
- KYC confirmation text via regex
- Email nullifier (Poseidon hash of `to` field)

## Supported Providers

| Provider | Status |
|----------|--------|
| Echo | Supported |
| Legion | Supported |

## License

MIT

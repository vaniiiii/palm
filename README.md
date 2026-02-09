# Palm

ZK Email KYC validation hook for [Uniswap Continuous Clearing Auctions](https://github.com/Uniswap/continuous-clearing-auction). Bidders prove KYC status from Echo or Legion using zero-knowledge proofs over their confirmation emails. No identity data touches the chain.

Cross-chain bidding powered by [LI.FI](https://li.fi) — bid from any chain into auctions on Base or Arbitrum.

## Architecture

```
┌─────────────-┐     ┌──────────────┐     ┌────────────────────┐
│  Frontend    │────▶│ Proving      │────▶│  CCA Auction       │
│  (React)     │     │ Server (Bun) │     │  (Base / Arbitrum) |
└──────┬───────┘     └──────────────┘     └────────┬───────────┘
       │                                           │
       │  LI.FI SDK                                │  validate()
       │  (cross-chain bids)                       ▼
       │                                  ┌────────────────────┐
       └─────────────────────────────────▶│ PalmValidationHook │
                                          │ (Groth16 verifier) │
                                          └────────────────────┘
```

**Flow:** User drops KYC email `.eml` file → proving server generates Groth16 proof (DKIM signature + KYC regex + email nullifier) → proof is ABI-encoded as `hookData` → CCA calls `PalmValidationHook.validate()` on bid submission → hook verifies proof on-chain.

**Cross-chain via LI.FI:** User on any chain → LI.FI `getContractCallsQuote` bridges funds + encodes `BidAdapter.submitBid()` as destination call → single tx from source chain lands a bid on the auction chain.

## Live Deployments

CCA Factory: [`0xCCccCcCAE7503Cac057829BF2811De42E16e0bD5`](https://basescan.org/address/0xCCccCcCAE7503Cac057829BF2811De42E16e0bD5) (Base & Arbitrum)

| Chain | Auction | Validation Hook |
|-------|---------|-----------------|
| Base | [`0x3eb56f07...`](https://basescan.org/address/0x3eb56f070c107c5d788d7cbcd51e3a1839b1de43) | [`0x7ea690f4...`](https://basescan.org/address/0x7ea690f416c1dd3f60ce6bb2b05fd691c19e01c4) |
| Base | [`0x2769938...`](https://basescan.org/address/0x2769938511376ab5cc1a41667c6f5c7a905fec53) | [`0x7f098def...`](https://basescan.org/address/0x7f098def12d7f954b39d843b0c259e0d8bdd394a) |
| Arbitrum | [`0xbee5bcc...`](https://arbiscan.io/address/0xbee5bcca8c65089fcd03871bc75495377ed8a08f) | [`0x80c90449...`](https://arbiscan.io/address/0x80c90449b1819d1b346dd9daf1aa6b2289b9ce5e) |

Indexer (Envio HyperIndex): `https://indexer.dev.hyperindex.xyz/8427648/v1/graphql`

## Packages

| Package | Description |
|---------|-------------|
| `packages/circuits` | Circom circuits — `EmailVerifier` + KYC regex + Poseidon nullifier |
| `packages/contracts` | `PalmValidationHook` (IValidationHook), `BidAdapter` (cross-chain entry), Groth16 verifiers |
| `packages/app` | React frontend + Bun proving server |
| `packages/indexer` | Ponder indexer for local dev |

## Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- [Foundry](https://getfoundry.sh/)
- [Circom](https://docs.circom.io/getting-started/installation/) >= 2.1.0

## Setup

```bash
# Install
bun install

# Clone CCA (sibling directory, required for local dev)
git clone https://github.com/Uniswap/continuous-clearing-auction ../continuous-clearing-auction
cd ../continuous-clearing-auction && git submodule update --init --recursive && cd -

# Build contracts
cd packages/contracts && forge build && cd -

# Build circuits (compiles circom, downloads ptau, generates zkey — takes a while)
cd packages/circuits && bun run build && bun run setup && cd -
```

Optional — [rapidsnark](https://github.com/AztecProtocol/rapidsnark) for faster proof generation (~2s vs ~60s with snarkjs):

```bash
git clone https://github.com/AztecProtocol/rapidsnark ../rapidsnark
cd ../rapidsnark && ./build_gmp.sh && mkdir -p build && cd build && cmake .. && make -j$(nproc) && cd ../../palm
```

## Run Locally

### Full stack (one command)

```bash
./dev.sh
```

Starts Anvil → deploys CCA Factory + Palm contracts + creates auction → starts Ponder indexer → starts proving server → starts Vite frontend.

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Indexer (GraphQL) | http://localhost:42069 |
| Proving Server | http://localhost:3001 |
| Anvil RPC | http://localhost:8545 |

To enable KYC validation on the local auction:

```bash
ENABLE_KYC=true ./dev.sh
```

### Tenderly Virtual Testnet

```bash
TENDERLY_RPC_URL=<your-url> ./dev-tenderly.sh
```

### Individual services

```bash
# Contracts only
cd packages/contracts && forge test -vvv

# Circuits only
cd packages/circuits && bun test

# Frontend only (needs env vars)
cd packages/app && bun run dev

# Proving server only
cd packages/app && bun run server/prove.ts
```

## LI.FI Integration

Cross-chain bidding uses [LI.FI SDK](https://docs.li.fi/) via `@lifi/sdk`. The `useCrossChainBid` hook:

1. Calls `getContractCallsQuote` with the destination auction's `BidAdapter.submitBid()` calldata
2. LI.FI finds the optimal bridge route and returns a single source-chain transaction
3. User signs one tx — LI.FI bridges funds and executes the bid on the destination chain
4. Hook polls `getStatus` until the cross-chain transfer completes

Supported source chains: any EVM chain LI.FI supports. Destination chains: Base, Arbitrum.

## KYC Providers

| Provider | Email From | Verification |
|----------|-----------|--------------|
| Echo | `echo@echo.xyz` | DKIM + regex: "Your identity has been successfully verified" |
| Legion | `mail@legion.cc` | DKIM + regex: "ID verification has been successful" |

## License

MIT

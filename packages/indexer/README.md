# Continuous Clearing Auction Indexer

_special thanks to the Aztec team (@saleel) for building out the indexing logic_

A Ponder-based indexer for tracking Continuous Clearing Auction events on Ethereum mainnet.

**Disclaimer:** This indexer is not production-ready and is intended for development and testing purposes only.

## Prerequisites

- Node.js >= 18.14
- npm or yarn

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file in the root directory with the following variables:

```
RPC_URL={your_ethereum_rpc_url}
AUCTION_CONTRACT_ADDRESS={0x_auction_contract_address}
START_BLOCK={deployment_block_number}
```

### Environment Variables

- `RPC_URL`: Ethereum mainnet RPC endpoint (e.g., from Infura, Alchemy, or your own node)
- `AUCTION_CONTRACT_ADDRESS`: The address of the auction contract to index
- `START_BLOCK`: The block number to start indexing from (use the deployment block of the auction to index)

## Running the CCA Indexer

### Development Mode

Start the indexer in development mode with hot reloading:

```bash
npm run dev
```

### Production Mode

Start the indexer in production mode:

```bash
npm run start
```

### Database Management

Manage the Ponder database:

```bash
npm run db
```

### Code Generation

Generate TypeScript types from your schema:

```bash
npm run codegen
```

## GraphQL API

Once the indexer is running, you can access the GraphQL API at:

```
http://localhost:42069/graphql
```

The GraphQL playground provides an interactive interface to explore the schema and query auction data

## Additional Commands

- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Run TypeScript type checking

## Resources

- **Check out the CCA site**: [cca.uniswap.org](https://cca.uniswap.org/)
- **CCA contracts**: [github.com/Uniswap/continuous-clearing-auction](https://github.com/Uniswap/continuous-clearing-auction)
- **Ponder documentation**: [ponder.sh/docs](https://ponder.sh/docs/getting-started/quickstart)

## Future work

PRs welcome!

- [ ] Separate out the fill math from core indexer logic into a separate file
- [ ] Improve performance of the indexer

#!/usr/bin/env bash
set -euo pipefail

source .env

# Use localhost for RPC when deploying from host (anvil:8545 only works inside docker)
DEPLOY_RPC_URL="${DEPLOY_RPC_URL:-http://localhost:8545}"

CCA_DIR="${CCA_DIR:-/opt/continuous-clearing-auction}"
PALM_DIR="${PALM_DIR:-/opt/palm}"

if [[ ! -d "$CCA_DIR" ]]; then
    git clone https://github.com/Uniswap/continuous-clearing-auction "$CCA_DIR"
    cd "$CCA_DIR" && git submodule update --init --recursive
fi

echo "Deploying CCA Factory..."
FACTORY_OUTPUT=$(cd "$CCA_DIR" && forge create src/ContinuousClearingAuctionFactory.sol:ContinuousClearingAuctionFactory \
    --rpc-url "$DEPLOY_RPC_URL" \
    --private-key "$DEPLOYER_PRIVATE_KEY" \
    --broadcast 2>&1)

FACTORY=$(echo "$FACTORY_OUTPUT" | grep -oE 'Deployed to: 0x[a-fA-F0-9]+' | cut -d' ' -f3)
echo "Factory: $FACTORY"

echo "Deploying Palm contracts..."
DEPLOY_OUTPUT=$(cd "$PALM_DIR/packages/contracts" && \
    FACTORY="$FACTORY" PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY" ENABLE_KYC="${ENABLE_KYC:-false}" \
    forge script script/Deploy.s.sol:Deploy \
        --rpc-url "$DEPLOY_RPC_URL" \
        --broadcast \
        -v 2>&1)

AUCTION=$(echo "$DEPLOY_OUTPUT" | grep -oE 'AUCTION=[^ ]+' | cut -d= -f2 | head -1)
HOOK=$(echo "$DEPLOY_OUTPUT" | grep -oE 'HOOK=[^ ]+' | cut -d= -f2 | head -1)
TOKEN=$(echo "$DEPLOY_OUTPUT" | grep -oE 'TOKEN=[^ ]+' | cut -d= -f2 | head -1)

echo ""
echo "Deployed:"
echo "  FACTORY_ADDRESS=$FACTORY"
echo "  AUCTION_ADDRESS=$AUCTION"
echo "  HOOK_ADDRESS=$HOOK"
echo "  TOKEN_ADDRESS=$TOKEN"
echo ""
echo "Update deploy/.env with these addresses, then restart: docker compose up -d"

#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
source .env

CHAIN="${1:-anvil}"
PALM_DIR="${PALM_DIR:-/opt/palm}"

case "$CHAIN" in
    anvil)
        RPC_URL="${DEPLOY_RPC_URL:-http://localhost:8545}"
        PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY"
        FACTORY="${ANVIL_FACTORY_ADDRESS:-}"
        ;;
    base)
        RPC_URL="$BASE_RPC_URL"
        PRIVATE_KEY="${BASE_DEPLOYER_KEY:-$DEPLOYER_PRIVATE_KEY}"
        FACTORY="$BASE_FACTORY_ADDRESS"
        ;;
    arbitrum)
        RPC_URL="$ARB_RPC_URL"
        PRIVATE_KEY="${ARB_DEPLOYER_KEY:-$DEPLOYER_PRIVATE_KEY}"
        FACTORY="$ARB_FACTORY_ADDRESS"
        ;;
    *)
        echo "Unknown chain: $CHAIN (expected: anvil, base, arbitrum)"
        exit 1
        ;;
esac

if [[ "$CHAIN" == "anvil" && -z "$FACTORY" ]]; then
    CCA_DIR="${CCA_DIR:-/opt/continuous-clearing-auction}"

    if [[ ! -d "$CCA_DIR" ]]; then
        git clone https://github.com/Uniswap/continuous-clearing-auction "$CCA_DIR"
        (cd "$CCA_DIR" && git submodule update --init --recursive)
    fi

    echo "Deploying CCA Factory on anvil..."
    FACTORY_OUTPUT=$(cd "$CCA_DIR" && forge create src/ContinuousClearingAuctionFactory.sol:ContinuousClearingAuctionFactory \
        --rpc-url "$RPC_URL" \
        --private-key "$PRIVATE_KEY" \
        --broadcast 2>&1)

    FACTORY=$(echo "$FACTORY_OUTPUT" | grep -oE 'Deployed to: 0x[a-fA-F0-9]+' | cut -d' ' -f3)
    echo "Factory: $FACTORY"
fi

if [[ -z "$FACTORY" ]]; then
    echo "Error: no factory address for chain=$CHAIN"
    exit 1
fi

RPC_FLAG="--rpc-url"
[[ "$CHAIN" != "anvil" ]] && RPC_FLAG="--fork-url"

echo "Deploying Palm contracts on $CHAIN..."
DEPLOY_OUTPUT=$(cd "$PALM_DIR/packages/contracts" && \
    FACTORY="$FACTORY" PRIVATE_KEY="$PRIVATE_KEY" ENABLE_KYC="${ENABLE_KYC:-false}" \
    forge script script/Deploy.s.sol:Deploy \
        "$RPC_FLAG" "$RPC_URL" \
        --broadcast \
        -v 2>&1)

AUCTION=$(echo "$DEPLOY_OUTPUT" | grep -oE 'AUCTION=[^ ]+' | cut -d= -f2 | head -1)
HOOK=$(echo "$DEPLOY_OUTPUT" | grep -oE 'HOOK=[^ ]+' | cut -d= -f2 | head -1)
TOKEN=$(echo "$DEPLOY_OUTPUT" | grep -oE 'TOKEN=[^ ]+' | cut -d= -f2 | head -1)

echo ""
echo "Deployed on $CHAIN:"
echo "  FACTORY_ADDRESS=$FACTORY"
echo "  AUCTION_ADDRESS=$AUCTION"
echo "  HOOK_ADDRESS=$HOOK"
echo "  TOKEN_ADDRESS=$TOKEN"

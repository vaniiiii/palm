#!/usr/bin/env bash
set -euo pipefail

# ============================================
# Palm Dev Stack - Tenderly Virtual Testnet
# ============================================
# Usage: TENDERLY_RPC_URL=<your-url> ./dev-tenderly.sh
# Env vars:
#   TENDERLY_RPC_URL - Tenderly Virtual Testnet RPC (REQUIRED, get from tenderly.co)
#   PRIVATE_KEY      - Deployer private key (optional, uses Anvil default)
#   ENABLE_KYC       - Enable KYC hook (default: false)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CCA_DIR="$SCRIPT_DIR/../continuous-clearing-auction"
CONTRACTS_DIR="$SCRIPT_DIR/packages/contracts"
INDEXER_DIR="$SCRIPT_DIR/packages/indexer"
APP_DIR="$SCRIPT_DIR/packages/app"

# Tenderly RPC - REQUIRED env var
if [[ -z "${TENDERLY_RPC_URL:-}" ]]; then
  echo "ERROR: TENDERLY_RPC_URL environment variable is required"
  echo "Get your Virtual TestNet RPC URL from https://dashboard.tenderly.co/"
  exit 1
fi
TENDERLY_RPC_URL="${TENDERLY_RPC_URL}"
CHAIN_ID="${CHAIN_ID:-3006}"

# Use Anvil default key for simplicity (or set your own)
PRIVATE_KEY="${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
# Derive address from private key
DEPLOYER=$(cast wallet address "$PRIVATE_KEY")

ENABLE_KYC="${ENABLE_KYC:-false}"

PIDS=()
cleanup() {
  echo ""
  echo "Shutting down..."
  if [[ ${#PIDS[@]} -gt 0 ]]; then
    for pid in "${PIDS[@]}"; do
      kill "$pid" 2>/dev/null || true
    done
  fi
  wait 2>/dev/null
  echo "Done."
}
trap cleanup EXIT

echo "============================================"
echo "Palm Dev Stack - Tenderly Virtual Testnet"
echo "============================================"
echo "RPC: $TENDERLY_RPC_URL"
echo "Chain ID: $CHAIN_ID"
echo "Deployer: $DEPLOYER"
echo "KYC Enabled: $ENABLE_KYC"
echo ""

# ---- 1. Fund deployer account on Tenderly ----
echo "==> Funding deployer account on Tenderly..."
# 1000 ETH in hex = 0x3635c9adc5dea00000
FUND_RESULT=$(curl -s "$TENDERLY_RPC_URL" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"tenderly_setBalance\",
    \"params\": [[\"$DEPLOYER\"], \"0x3635c9adc5dea00000\"],
    \"id\": \"1\"
  }")
echo "    Fund result: $FUND_RESULT"

# Verify balance
BALANCE=$(cast balance "$DEPLOYER" --rpc-url "$TENDERLY_RPC_URL" 2>/dev/null || echo "0")
echo "    Deployer balance: $BALANCE"

# ---- 2. Deploy CCA Factory ----
echo "==> Deploying CCA Factory..."
if [[ ! -d "$CCA_DIR" ]]; then
  echo "ERROR: CCA repo not found at $CCA_DIR"
  echo "Clone it: git clone https://github.com/uniswap/continuous-clearing-auction ../continuous-clearing-auction"
  exit 1
fi

FACTORY_OUTPUT=$(
  cd "$CCA_DIR" && \
  forge create src/ContinuousClearingAuctionFactory.sol:ContinuousClearingAuctionFactory \
    --rpc-url "$TENDERLY_RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --broadcast 2>&1
)
FACTORY=$(echo "$FACTORY_OUTPUT" | grep -oE 'Deployed to: 0x[a-fA-F0-9]+' | cut -d' ' -f3)
if [[ -z "$FACTORY" ]]; then
  echo "ERROR: Failed to deploy CCA Factory"
  echo "$FACTORY_OUTPUT" | tail -20
  exit 1
fi
echo "    CCA Factory: $FACTORY"

# ---- 3. Deploy Palm contracts ----
echo "==> Deploying Palm contracts (KYC=$ENABLE_KYC)..."
DEPLOY_OUTPUT=$(
  cd "$CONTRACTS_DIR" && \
  FACTORY="$FACTORY" PRIVATE_KEY="$PRIVATE_KEY" ENABLE_KYC="$ENABLE_KYC" \
  forge script script/Deploy.s.sol:Deploy \
    --rpc-url "$TENDERLY_RPC_URL" \
    --broadcast \
    -v 2>&1
)

# Parse addresses from deploy output
AUCTION=$(echo "$DEPLOY_OUTPUT" | grep -oE 'AUCTION=[^ ]+' | cut -d= -f2 | head -1)
HOOK=$(echo "$DEPLOY_OUTPUT" | grep -oE 'HOOK=[^ ]+' | cut -d= -f2 | head -1)
TOKEN=$(echo "$DEPLOY_OUTPUT" | grep -oE 'TOKEN=[^ ]+' | cut -d= -f2 | head -1)

if [[ -z "$AUCTION" ]]; then
  echo "ERROR: Failed to parse AUCTION address from deploy output"
  echo "$DEPLOY_OUTPUT"
  exit 1
fi

echo "    Auction: $AUCTION"
echo "    Hook: $HOOK"
echo "    Token: $TOKEN"

# ---- 4. Start Indexer ----
echo "==> Starting indexer..."
# Write indexer .env
cat > "$INDEXER_DIR/.env" <<EOF
RPC_URL=$TENDERLY_RPC_URL
FACTORY_ADDRESS=$FACTORY
CHAIN_ID=$CHAIN_ID
START_BLOCK=1
EOF

(cd "$INDEXER_DIR" && npx ponder dev 2>&1 | sed 's/^/    [indexer] /') &
INDEXER_PID=$!
PIDS+=("$INDEXER_PID")
sleep 3
echo "    Indexer running on :42069 (pid $INDEXER_PID)"

# ---- 5. Start Frontend ----
echo "==> Starting frontend..."
# Write frontend .env
cat > "$APP_DIR/.env" <<EOF
VITE_CHAIN_ID=$CHAIN_ID
VITE_CHAIN_NAME=Tenderly Palm
VITE_RPC_URL=$TENDERLY_RPC_URL
VITE_FACTORY_ADDRESS=$FACTORY
VITE_AUCTION_ADDRESS=$AUCTION
VITE_HOOK_ADDRESS=$HOOK
VITE_TOKEN_ADDRESS=$TOKEN
EOF

(cd "$APP_DIR" && bun run dev 2>&1 | sed 's/^/    [frontend] /') &
FRONTEND_PID=$!
PIDS+=("$FRONTEND_PID")
sleep 2
echo "    Frontend running on :5173 (pid $FRONTEND_PID)"

# ---- 6. Start Proving Server (if KYC enabled) ----
if [[ "$ENABLE_KYC" == "true" ]]; then
  echo "==> Starting proving server..."
  (cd "$APP_DIR" && bun run server/prove.ts 2>&1 | sed 's/^/    [prover] /') &
  PROVER_PID=$!
  PIDS+=("$PROVER_PID")
  sleep 1
  echo "    Proving server running on :3001 (pid $PROVER_PID)"
fi

# ---- Summary ----
echo ""
echo "============================================"
echo "Tenderly Dev Stack Ready!"
echo "============================================"
echo ""
echo "Network:"
echo "  RPC URL:    $TENDERLY_RPC_URL"
echo "  Chain ID:   $CHAIN_ID"
echo ""
echo "Contracts:"
echo "  Factory:    $FACTORY"
echo "  Auction:    $AUCTION"
echo "  Hook:       $HOOK"
echo "  Token:      $TOKEN"
echo ""
echo "Services:"
echo "  Frontend:   http://localhost:5173"
echo "  Indexer:    http://localhost:42069"
[[ "$ENABLE_KYC" == "true" ]] && echo "  Prover:     http://localhost:3001"
echo ""
echo "Wallet Setup:"
echo "  Add Tenderly network to your wallet:"
echo "    Network Name: Tenderly Palm"
echo "    RPC URL: $TENDERLY_RPC_URL"
echo "    Chain ID: $CHAIN_ID"
echo "    Currency: ETH"
echo ""
echo "Press Ctrl+C to stop all services"
echo "============================================"

# Wait for any process to exit
wait

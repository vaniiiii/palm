#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CCA_DIR="$SCRIPT_DIR/../continuous-clearing-auction"
CONTRACTS_DIR="$SCRIPT_DIR/packages/contracts"
INDEXER_DIR="$SCRIPT_DIR/packages/indexer"
APP_DIR="$SCRIPT_DIR/packages/app"

# Anvil default private key #0
PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
RPC_URL="http://localhost:8545"
CHAIN_ID=31337

# KYC can be enabled via env var: ENABLE_KYC=true ./dev.sh
ENABLE_KYC="${ENABLE_KYC:-false}"

PIDS=()
cleanup() {
  echo ""
  echo "Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null
  echo "Done."
}
trap cleanup EXIT

# ---- 1. Start Anvil ----
echo "==> Starting Anvil..."
# Kill any existing anvil on port 8545
lsof -ti:8545 | xargs kill -9 2>/dev/null || true
sleep 1

anvil --block-time 2 --silent &
ANVIL_PID=$!
PIDS+=("$ANVIL_PID")
sleep 2
echo "    Anvil running on :8545 (pid $ANVIL_PID)"

# ---- 2. Deploy CCA Factory from sibling repo ----
echo "==> Building & deploying CCA Factory..."
if [ ! -d "$CCA_DIR" ]; then
  echo "ERROR: CCA repo not found at $CCA_DIR"
  echo "       Expected sibling directory: continuous-clearing-auction/"
  exit 1
fi

FACTORY_OUTPUT=$(
  cd "$CCA_DIR" && \
  forge create src/ContinuousClearingAuctionFactory.sol:ContinuousClearingAuctionFactory \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --broadcast \
    2>&1
)
FACTORY=$(echo "$FACTORY_OUTPUT" | grep "Deployed to:" | awk '{print $3}')
if [ -z "$FACTORY" ]; then
  echo "ERROR: Failed to deploy CCA Factory"
  echo "$FACTORY_OUTPUT"
  exit 1
fi
echo "    Factory deployed: $FACTORY"

# ---- 3. Deploy Palm contracts + create auction ----
echo "==> Deploying Palm contracts (KYC=$ENABLE_KYC)..."
DEPLOY_OUTPUT=$(
  cd "$CONTRACTS_DIR" && \
  FACTORY="$FACTORY" PRIVATE_KEY="$PRIVATE_KEY" ENABLE_KYC="$ENABLE_KYC" \
  forge script script/Deploy.s.sol:Deploy \
    --rpc-url "$RPC_URL" \
    --broadcast \
    -v 2>&1
)

# Parse addresses from forge script console.log output (macOS compatible)
parse_addr() {
  echo "$DEPLOY_OUTPUT" | grep "$1=" | sed "s/.*$1=//" | grep -o '0x[0-9a-fA-F]*' | tail -1
}

parse_num() {
  echo "$DEPLOY_OUTPUT" | grep "$1=" | sed "s/.*$1=//" | grep -o '[0-9]*' | tail -1
}

TOKEN=$(parse_addr "TOKEN")
ECHO_VERIFIER=$(parse_addr "ECHO_VERIFIER")
LEGION_VERIFIER=$(parse_addr "LEGION_VERIFIER")
HOOK=$(parse_addr "HOOK")
AUCTION=$(parse_addr "AUCTION")
START_BLOCK=$(parse_num "START_BLOCK")
END_BLOCK=$(parse_num "END_BLOCK")

if [ -z "$AUCTION" ]; then
  echo "ERROR: Failed to deploy Palm contracts or create auction"
  echo "$DEPLOY_OUTPUT"
  exit 1
fi

echo "    Token:          $TOKEN"
echo "    Echo Verifier:  $ECHO_VERIFIER"
echo "    Legion Verifier:$LEGION_VERIFIER"
echo "    Hook:           $HOOK"
echo "    Auction:        $AUCTION"
echo "    Start Block:    $START_BLOCK"
echo "    End Block:      $END_BLOCK"

# ---- 4. Start Indexer ----
echo "==> Starting indexer..."

# Install dependencies if needed
if [ ! -d "$INDEXER_DIR/node_modules" ]; then
  echo "    Installing indexer dependencies..."
  (cd "$INDEXER_DIR" && bun install)
fi

# Pass env vars directly to ponder
(cd "$INDEXER_DIR" && RPC_URL="$RPC_URL" FACTORY_ADDRESS="$FACTORY" CHAIN_ID="$CHAIN_ID" START_BLOCK=0 bun run dev) &
INDEXER_PID=$!
PIDS+=("$INDEXER_PID")
echo "    Indexer starting on :42069 (pid $INDEXER_PID)"

# ---- 5. Start Proving Server ----
echo "==> Starting proving server..."
(cd "$APP_DIR" && bun run server/prove.ts) &
PROVER_PID=$!
PIDS+=("$PROVER_PID")
echo "    Proving server starting on :3001 (pid $PROVER_PID)"

# ---- 6. Start Frontend ----
echo "==> Starting frontend..."
cat > "$APP_DIR/.env" <<EOF
VITE_AUCTION_ADDRESS=$AUCTION
VITE_HOOK_ADDRESS=$HOOK
VITE_TOKEN_ADDRESS=$TOKEN
VITE_FACTORY_ADDRESS=$FACTORY
EOF

(cd "$APP_DIR" && bun vite --port 5173) &
FRONTEND_PID=$!
PIDS+=("$FRONTEND_PID")
echo "    Frontend starting on :5173 (pid $FRONTEND_PID)"

# ---- Summary ----
echo ""
echo "============================================"
echo "  Palm Dev Stack Running"
echo "============================================"
echo "  Anvil:    $RPC_URL"
echo "  Indexer:  http://localhost:42069"
echo "  Prover:   http://localhost:3001"
echo "  Frontend: http://localhost:5173"
echo ""
echo "  Factory:  $FACTORY"
echo "  Token:    $TOKEN"
echo "  Hook:     $HOOK"
echo "  Auction:  $AUCTION"
echo ""
echo "  Test KYC emails:"
echo "    packages/circuits/tests/emls/echo-test.eml"
echo "    packages/circuits/tests/emls/legion-test.eml"
echo "============================================"
echo ""
echo "Press Ctrl+C to stop all services."
wait

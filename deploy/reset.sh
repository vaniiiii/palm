#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Stopping all containers..."
docker compose --profile anvil down -v

echo "Starting anvil + postgres + prover + caddy..."
docker compose --profile anvil up -d anvil postgres prover caddy

echo "Waiting for anvil..."
sleep 3

echo "Deploying contracts..."
OUTPUT=$(./deploy-contracts.sh)
echo "$OUTPUT"

FACTORY=$(echo "$OUTPUT" | grep "FACTORY_ADDRESS=" | cut -d= -f2)
AUCTION=$(echo "$OUTPUT" | grep "AUCTION_ADDRESS=" | cut -d= -f2)
HOOK=$(echo "$OUTPUT" | grep "HOOK_ADDRESS=" | cut -d= -f2)
TOKEN=$(echo "$OUTPUT" | grep "TOKEN_ADDRESS=" | cut -d= -f2)

echo "Updating .env..."
sed -i "s/FACTORY_ADDRESS=.*/FACTORY_ADDRESS=$FACTORY/" .env
sed -i "s/AUCTION_ADDRESS=.*/AUCTION_ADDRESS=$AUCTION/" .env
sed -i "s/HOOK_ADDRESS=.*/HOOK_ADDRESS=$HOOK/" .env
sed -i "s/TOKEN_ADDRESS=.*/TOKEN_ADDRESS=$TOKEN/" .env

echo "Starting indexer..."
docker compose --profile anvil up -d indexer

echo ""
echo "Done. Addresses:"
echo "  FACTORY=$FACTORY"
echo "  AUCTION=$AUCTION"
echo "  HOOK=$HOOK"
echo "  TOKEN=$TOKEN"

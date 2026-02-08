#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
source .env

# Parse flags
USE_ANVIL=true
USE_BASE=false
USE_ARB=false
KYC_MODE="${ENABLE_KYC:-false}"

for arg in "$@"; do
    case "$arg" in
        --no-anvil) USE_ANVIL=false ;;
        --with-base) USE_BASE=true ;;
        --with-arb) USE_ARB=true ;;
        *) echo "Unknown flag: $arg"; exit 1 ;;
    esac
done

PROFILES=()
[[ "$USE_ANVIL" == true ]] && PROFILES+=(--profile anvil)
[[ "$USE_BASE" == true ]] && PROFILES+=(--profile base)
[[ "$USE_ARB" == true ]] && PROFILES+=(--profile arbitrum)

echo "Chains: anvil=$USE_ANVIL base=$USE_BASE arb=$USE_ARB kyc=$KYC_MODE"

# Generate Caddyfile based on active chains
generate_caddyfile() {
    cat <<'EOF'
{$API_DOMAIN} {
	reverse_proxy prover:3001
}
EOF

    if [[ "$USE_ANVIL" == true ]]; then
        cat <<'EOF'

{$ANVIL_INDEXER_DOMAIN} {
	reverse_proxy indexer:42069
}

{$ANVIL_RPC_DOMAIN} {
	reverse_proxy anvil:8545
}
EOF
    fi

    if [[ "$USE_BASE" == true ]]; then
        cat <<'EOF'

{$BASE_INDEXER_DOMAIN} {
	reverse_proxy indexer-base:42069
}
EOF
    fi

    if [[ "$USE_ARB" == true ]]; then
        cat <<'EOF'

{$ARB_INDEXER_DOMAIN} {
	reverse_proxy indexer-arb:42069
}
EOF
    fi
}

echo "Generating Caddyfile..."
generate_caddyfile > Caddyfile

echo "Stopping all containers..."
docker compose --profile anvil --profile base --profile arbitrum down -v

# Clear anvil addresses — fresh anvil has no contracts from previous runs
if [[ "$USE_ANVIL" == true ]]; then
    sed "s|ANVIL_FACTORY_ADDRESS=.*|ANVIL_FACTORY_ADDRESS=|
         s|ANVIL_AUCTION_ADDRESS=.*|ANVIL_AUCTION_ADDRESS=|
         s|ANVIL_HOOK_ADDRESS=.*|ANVIL_HOOK_ADDRESS=|
         s|ANVIL_TOKEN_ADDRESS=.*|ANVIL_TOKEN_ADDRESS=|" .env > .env.tmp && mv .env.tmp .env
    source .env
fi

echo "Starting infra..."
INFRA_SERVICES=(postgres prover caddy)
[[ "$USE_ANVIL" == true ]] && INFRA_SERVICES+=(anvil)
docker compose "${PROFILES[@]}" up -d "${INFRA_SERVICES[@]}"

if [[ "$USE_ANVIL" == true ]]; then
    echo "Waiting for anvil..."
    sleep 3
fi

update_env() {
    local prefix="$1"
    local output="$2"

    local factory=$(echo "$output" | grep "FACTORY_ADDRESS=" | cut -d= -f2)
    local auction=$(echo "$output" | grep "AUCTION_ADDRESS=" | cut -d= -f2)
    local hook=$(echo "$output" | grep "HOOK_ADDRESS=" | cut -d= -f2)
    local token=$(echo "$output" | grep "TOKEN_ADDRESS=" | cut -d= -f2)

    local tmp=".env.tmp.$$"
    sed "s|${prefix}_FACTORY_ADDRESS=.*|${prefix}_FACTORY_ADDRESS=$factory|
         s|${prefix}_AUCTION_ADDRESS=.*|${prefix}_AUCTION_ADDRESS=$auction|
         s|${prefix}_HOOK_ADDRESS=.*|${prefix}_HOOK_ADDRESS=$hook|
         s|${prefix}_TOKEN_ADDRESS=.*|${prefix}_TOKEN_ADDRESS=$token|" .env > "$tmp" && mv "$tmp" .env
}

deploy_chain() {
    local chain="$1"
    local prefix="$2"
    echo "Deploying contracts on $chain..."
    local output
    if output=$(ENABLE_KYC="$KYC_MODE" ./deploy-contracts.sh "$chain" 2>&1); then
        echo "$output"
        update_env "$prefix" "$output"
    else
        echo "ERROR: Deploy failed on $chain:"
        echo "$output"
        return 1
    fi
}

[[ "$USE_ANVIL" == true ]] && deploy_chain anvil ANVIL
[[ "$USE_BASE" == true ]] && deploy_chain base BASE
[[ "$USE_ARB" == true ]] && deploy_chain arbitrum ARB

echo "Reloading env after deploy..."
source .env

echo "Starting indexers..."
INDEXER_SERVICES=()
[[ "$USE_ANVIL" == true ]] && INDEXER_SERVICES+=(indexer)
[[ "$USE_BASE" == true ]] && INDEXER_SERVICES+=(indexer-base)
[[ "$USE_ARB" == true ]] && INDEXER_SERVICES+=(indexer-arb)

if [[ ${#INDEXER_SERVICES[@]} -gt 0 ]]; then
    docker compose "${PROFILES[@]}" up -d "${INDEXER_SERVICES[@]}"
fi

echo ""
echo "Done."
[[ "$USE_ANVIL" == true ]] && echo "  Anvil indexer: https://${ANVIL_INDEXER_DOMAIN:-}"
[[ "$USE_BASE" == true ]] && echo "  Base indexer: https://${BASE_INDEXER_DOMAIN:-}"
[[ "$USE_ARB" == true ]] && echo "  Arb indexer: https://${ARB_INDEXER_DOMAIN:-}"

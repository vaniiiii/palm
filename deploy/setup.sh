#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/vaniiiii/palm.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/palm}"

SERVER_IP=$(curl -4 -s ifconfig.me)

command -v docker >/dev/null || {
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
}

command -v ufw >/dev/null && {
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable
}

command -v forge >/dev/null || {
    curl -L https://foundry.paradigm.xyz | bash
    ~/.foundry/bin/foundryup
}

if [[ ! -d "$INSTALL_DIR" ]]; then
    git clone "$REPO_URL" "$INSTALL_DIR"
fi

if [[ ! -d /opt/continuous-clearing-auction ]]; then
    git clone https://github.com/Uniswap/continuous-clearing-auction /opt/continuous-clearing-auction
    cd /opt/continuous-clearing-auction && git submodule update --init --recursive
fi

if [[ ! -d /opt/rapidsnark ]]; then
    apt-get update && apt-get install -y build-essential cmake libgmp-dev nasm
    git clone https://github.com/AztecProtocol/rapidsnark /opt/rapidsnark
    cd /opt/rapidsnark
    git submodule update --init --recursive
    ./build_gmp.sh host
    mkdir -p build && cd build
    cmake .. -DCMAKE_BUILD_TYPE=Release
    make -j$(nproc)
    ln -sf /opt/rapidsnark/build/prover /usr/local/bin/rapidsnark
fi

cd "$INSTALL_DIR/deploy"

if [[ ! -f .env ]]; then
    sed "s/YOUR_IP/$SERVER_IP/g" .env.example > .env
fi

echo ""
echo "Setup complete. Server IP: $SERVER_IP"
echo ""
echo "Installed:"
echo "  Palm:       $INSTALL_DIR"
echo "  CCA:        /opt/continuous-clearing-auction"
echo "  rapidsnark: /opt/rapidsnark"
echo ""
echo "Endpoints:"
echo "  API:     https://api.$SERVER_IP.nip.io"
echo "  Indexer: https://indexer.$SERVER_IP.nip.io"
echo ""
echo "Next:"
echo "  1. Copy zkeys: scp -r packages/circuits/build/ root@$SERVER_IP:$INSTALL_DIR/packages/circuits/"
echo "  2. Start anvil mode: cd $INSTALL_DIR/deploy && docker compose --profile anvil up -d"
echo "  3. Deploy contracts: ./deploy-contracts.sh"
echo ""

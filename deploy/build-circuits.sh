#!/usr/bin/env bash
set -euo pipefail

apt-get update && apt-get install -y unzip

command -v rustc >/dev/null || {
    curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh -s -- -y
    source ~/.cargo/env
}

command -v circom >/dev/null || {
    git clone https://github.com/iden3/circom /opt/circom
    cd /opt/circom && cargo build --release
    ln -sf /opt/circom/target/release/circom /usr/local/bin/circom
}

command -v bun >/dev/null || {
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
}

cd /opt/palm
bun install

cd packages/circuits
bun run build

echo ""
echo "Done. Zkeys built at /opt/palm/packages/circuits/build/"

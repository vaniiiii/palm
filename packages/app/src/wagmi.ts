import { http, createConfig } from "wagmi";
import type { Chain } from "viem";
import { mainnet, sepolia, anvil } from "wagmi/chains";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  rabbyWallet,
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
  injectedWallet,
} from "@rainbow-me/rainbowkit/wallets";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "palm-dev";

// Custom chain support (for Tenderly virtual testnets, custom networks, etc.)
const customChainId = import.meta.env.VITE_CHAIN_ID ? Number(import.meta.env.VITE_CHAIN_ID) : null;
const customRpcUrl = import.meta.env.VITE_RPC_URL;
const customChainName = import.meta.env.VITE_CHAIN_NAME || "Custom Network";

const customChain: Chain | null = customChainId && customRpcUrl ? {
  id: customChainId,
  name: customChainName,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [customRpcUrl] },
  },
  blockExplorers: import.meta.env.VITE_BLOCK_EXPLORER ? {
    default: { name: "Explorer", url: import.meta.env.VITE_BLOCK_EXPLORER },
  } : undefined,
} : null;

// Build chains array - custom chain first if defined, then standard chains
const chains: readonly [Chain, ...Chain[]] = customChain
  ? [customChain, anvil, sepolia, mainnet]
  : [anvil, sepolia, mainnet];

// Build transports - use custom RPC for matching chain IDs
const transports: Record<number, ReturnType<typeof http>> = {
  [anvil.id]: http(import.meta.env.VITE_ANVIL_RPC_URL),
  [sepolia.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL),
  [mainnet.id]: http(import.meta.env.VITE_MAINNET_RPC_URL),
};

if (customChain) {
  transports[customChain.id] = http(customRpcUrl);
}

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [
        rabbyWallet,
        metaMaskWallet,
        coinbaseWallet,
        walletConnectWallet,
        injectedWallet,
      ],
    },
  ],
  {
    appName: "Palm ZK KYC",
    projectId,
  }
);

export const config = createConfig({
  connectors,
  chains,
  transports,
});

// Helper to check if we're on a local/test network (for dev features like faucet)
export const isLocalNetwork = (chainId: number | undefined): boolean => {
  if (!chainId) return false;
  // Anvil default chain ID, or any chain ID < 1000 is likely local
  return chainId === anvil.id || chainId < 1000;
};

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}

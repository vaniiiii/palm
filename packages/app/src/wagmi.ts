import { http, createConfig } from "wagmi";
import type { Chain } from "viem";
import { anvil, base, arbitrum } from "wagmi/chains";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  rabbyWallet,
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
  injectedWallet,
} from "@rainbow-me/rainbowkit/wallets";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "palm-dev";

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

const standardChains = [base, arbitrum, anvil] as const;
const chains: readonly [Chain, ...Chain[]] = customChain
  ? [customChain, ...standardChains]
  : [base, ...standardChains.slice(1)];

const transports: Record<number, ReturnType<typeof http>> = {
  [base.id]: http(import.meta.env.VITE_BASE_RPC_URL),
  [arbitrum.id]: http(import.meta.env.VITE_ARB_RPC_URL),
  [anvil.id]: http(import.meta.env.VITE_ANVIL_RPC_URL),
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

export const isLocalNetwork = (chainId: number | undefined): boolean => {
  if (!chainId) return false;
  return chainId === anvil.id || chainId < 1000;
};

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}

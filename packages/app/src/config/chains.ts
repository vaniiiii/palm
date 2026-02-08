import { base, arbitrum, sepolia, anvil } from "wagmi/chains";

export interface ChainConfig {
  factory: `0x${string}`;
  indexerUrl: string;
}

const CCA_FACTORY = "0xCCccCcCAE7503Cac057829BF2811De42E16e0bD5" as const;

export const CHAIN_CONFIG: Record<number, ChainConfig> = {
  [base.id]: {
    factory: CCA_FACTORY,
    indexerUrl: import.meta.env.VITE_BASE_INDEXER_URL || "",
  },
  [arbitrum.id]: {
    factory: CCA_FACTORY,
    indexerUrl: import.meta.env.VITE_ARB_INDEXER_URL || "",
  },
  [sepolia.id]: {
    factory: CCA_FACTORY,
    indexerUrl: import.meta.env.VITE_SEPOLIA_INDEXER_URL || "",
  },
  [anvil.id]: {
    factory: (import.meta.env.VITE_FACTORY_ADDRESS || CCA_FACTORY) as `0x${string}`,
    indexerUrl: import.meta.env.VITE_INDEXER_URL
      ? `${import.meta.env.VITE_INDEXER_URL}/graphql`
      : "/indexer/graphql",
  },
};

const customChainId = import.meta.env.VITE_CHAIN_ID ? Number(import.meta.env.VITE_CHAIN_ID) : null;
if (customChainId && !CHAIN_CONFIG[customChainId]) {
  CHAIN_CONFIG[customChainId] = {
    factory: (import.meta.env.VITE_FACTORY_ADDRESS || CCA_FACTORY) as `0x${string}`,
    indexerUrl: import.meta.env.VITE_INDEXER_URL
      ? `${import.meta.env.VITE_INDEXER_URL}/graphql`
      : "/indexer/graphql",
  };
}

export function getChainConfig(chainId: number | undefined): ChainConfig | null {
  if (!chainId) return null;
  return CHAIN_CONFIG[chainId] ?? null;
}

export const SUPPORTED_CHAIN_IDS = Object.keys(CHAIN_CONFIG).map(Number);

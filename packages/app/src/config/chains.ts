import { base, arbitrum, anvil } from "wagmi/chains";

export type IndexerType = 'ponder' | 'envio';

export interface ChainConfig {
  factory: `0x${string}`;
  indexerUrl: string;
  indexerType: IndexerType;
}

const CCA_FACTORY = "0xCCccCcCAE7503Cac057829BF2811De42E16e0bD5" as const;

function indexerUrl(envVar: string | undefined, fallback = ""): string {
  if (!envVar) return fallback;
  return envVar.endsWith("/graphql") ? envVar : `${envVar}/graphql`;
}

export const CHAIN_CONFIG: Record<number, ChainConfig> = {
  [base.id]: {
    factory: CCA_FACTORY,
    indexerUrl: indexerUrl(import.meta.env.VITE_BASE_INDEXER_URL),
    indexerType: 'envio',
  },
  [arbitrum.id]: {
    factory: CCA_FACTORY,
    indexerUrl: indexerUrl(import.meta.env.VITE_ARB_INDEXER_URL),
    indexerType: 'envio',
  },
  [anvil.id]: {
    factory: (import.meta.env.VITE_FACTORY_ADDRESS || CCA_FACTORY) as `0x${string}`,
    indexerUrl: indexerUrl(import.meta.env.VITE_ANVIL_INDEXER_URL || import.meta.env.VITE_INDEXER_URL, "/indexer/graphql"),
    indexerType: 'ponder',
  },
};

const customChainId = import.meta.env.VITE_CHAIN_ID ? Number(import.meta.env.VITE_CHAIN_ID) : null;
if (customChainId && !CHAIN_CONFIG[customChainId]) {
  CHAIN_CONFIG[customChainId] = {
    factory: (import.meta.env.VITE_FACTORY_ADDRESS || CCA_FACTORY) as `0x${string}`,
    indexerUrl: import.meta.env.VITE_INDEXER_URL
      ? `${import.meta.env.VITE_INDEXER_URL}/graphql`
      : "/indexer/graphql",
    indexerType: 'ponder',
  };
}

export function getChainConfig(chainId: number | undefined): ChainConfig | null {
  if (!chainId) return null;
  return CHAIN_CONFIG[chainId] ?? null;
}

export const SUPPORTED_CHAIN_IDS = Object.keys(CHAIN_CONFIG).map(Number);

const CHAIN_NAMES: Record<number, string> = {
  [base.id]: "Base",
  [arbitrum.id]: "Arbitrum",
  [anvil.id]: "Anvil",
};

export function getChainName(chainId: number): string {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
}

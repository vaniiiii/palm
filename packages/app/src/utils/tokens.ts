export interface TokenMeta {
  symbol: string;
  decimals: number;
  logo: string;
}

export const KNOWN_TOKENS = {
  ETH: "0x0000000000000000000000000000000000000000",
  USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  USDC_BASE: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  USDC_ARB: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
} as const;

const TOKENS: Record<string, TokenMeta> = {
  [KNOWN_TOKENS.ETH]: {
    symbol: "ETH",
    decimals: 18,
    logo: "/logos/eth.svg",
  },
  [KNOWN_TOKENS.USDC]: {
    symbol: "USDC",
    decimals: 6,
    logo: "/logos/usdc.svg",
  },
  [KNOWN_TOKENS.USDC_BASE]: {
    symbol: "USDC",
    decimals: 6,
    logo: "/logos/usdc.svg",
  },
  [KNOWN_TOKENS.USDC_ARB]: {
    symbol: "USDC",
    decimals: 6,
    logo: "/logos/usdc.svg",
  },
};

const FALLBACK: TokenMeta = { symbol: "???", decimals: 18, logo: "" };

export function getTokenMeta(address: string): TokenMeta {
  return TOKENS[address.toLowerCase()] ?? TOKENS[address] ?? FALLBACK;
}

const USDC_BY_CHAIN: Record<number, string> = {
  8453: KNOWN_TOKENS.USDC_BASE,
  42161: KNOWN_TOKENS.USDC_ARB,
};

export function getUSDCAddress(chainId: number): string | null {
  return USDC_BY_CHAIN[chainId] ?? null;
}

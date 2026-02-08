export interface TokenMeta {
  symbol: string;
  decimals: number;
  logo: string;
}

export const KNOWN_TOKENS = {
  ETH: "0x0000000000000000000000000000000000000000",
  USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
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
};

const FALLBACK: TokenMeta = { symbol: "???", decimals: 18, logo: "" };

export function getTokenMeta(address: string): TokenMeta {
  return TOKENS[address.toLowerCase()] ?? TOKENS[address] ?? FALLBACK;
}

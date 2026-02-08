export interface TokenMeta {
  symbol: string;
  decimals: number;
  logo: string;
}

const TOKENS: Record<string, TokenMeta> = {
  "0x0000000000000000000000000000000000000000": {
    symbol: "ETH",
    decimals: 18,
    logo: "/logos/eth.svg",
  },
};

const FALLBACK: TokenMeta = { symbol: "???", decimals: 18, logo: "" };

export function getTokenMeta(address: string): TokenMeta {
  return TOKENS[address.toLowerCase()] ?? TOKENS[address] ?? FALLBACK;
}

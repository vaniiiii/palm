export const Q96 = 2n ** 96n;

export function fromQ96(value: string | bigint): number {
  const bigVal = BigInt(value || "0");
  return Number(bigVal) / Number(Q96);
}

export function toQ96(value: number): bigint {
  return BigInt(Math.floor(value * Number(Q96)));
}

export function toQ96Aligned({
  value,
  tickSpacing,
}: {
  value: number;
  tickSpacing: bigint;
}): bigint {
  const rawQ96 = BigInt(Math.floor(value * Number(Q96)));
  if (tickSpacing === 0n) return rawQ96;
  const ticks = (rawQ96 + tickSpacing - 1n) / tickSpacing;
  return ticks * tickSpacing;
}

export function formatPrice(price: number): string {
  if (price === 0) return "0";
  if (price < 0.000001) return price.toFixed(9);
  if (price < 0.00001) return price.toFixed(8);
  if (price < 0.0001) return price.toFixed(7);
  if (price < 0.001) return price.toFixed(6);
  if (price < 0.01) return price.toFixed(5);
  if (price < 0.1) return price.toFixed(4);
  if (price < 1) return price.toFixed(3);
  if (price < 10) return price.toFixed(2);
  return price.toFixed(1);
}

export function formatLargeNumber({
  value,
  decimals = 18,
}: {
  value: string | bigint;
  decimals?: number;
}): string {
  const num = Number(BigInt(value)) / 10 ** decimals;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toFixed(2);
}

export function formatEthAmount(value: number): string {
  if (value === 0) return "0";
  if (value < 0.0001) return "<0.0001";
  if (value < 1) return value.toFixed(4);
  if (value < 100) return value.toFixed(2);
  return value.toFixed(0);
}

export function shortenAddress({
  address,
  chars = 4,
}: {
  address: string;
  chars?: number;
}): string {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

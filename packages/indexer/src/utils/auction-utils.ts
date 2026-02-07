import { formatEther } from 'viem';

export const MPS = 10000000n; // 1e7
export const FixedPoint96 = {
  RESOLUTION: 96n,
  Q96: 0x1000000000000000000000000n, // 2 ^ 96
};

export function q96ToWei(valueQ96: bigint): bigint {
  return valueQ96 >> 96n;
}

export function q96ToUSD(valueQ96: bigint, ethUSDPrice: number): number {
  const valueQ96x10e18 = valueQ96 * 10n ** 18n;
  const valueQ96x10e18USD = valueQ96x10e18 * BigInt(Math.round(ethUSDPrice));
  const value10e18USD = valueQ96x10e18USD >> 96n;
  const valueUSD = formatEther(value10e18USD);
  return Number(valueUSD);
}

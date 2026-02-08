export type AuctionPhase = "not_started" | "active" | "ended" | "claimable";

export interface PhaseConfig {
  label: string;
  color: string;
  bgColor: string;
}

export const PHASE_CONFIGS: Record<AuctionPhase, PhaseConfig> = {
  not_started: { label: "Upcoming", color: "text-palm-cyan", bgColor: "bg-palm-cyan/10" },
  active: { label: "Live", color: "text-palm-green", bgColor: "bg-palm-green/10" },
  ended: { label: "Ended", color: "text-palm-text-2", bgColor: "bg-palm-text-2/10" },
  claimable: { label: "Claimable", color: "text-palm-pink", bgColor: "bg-palm-pink/10" },
};

export function getAuctionPhase({
  currentBlock,
  startBlock,
  endBlock,
  claimBlock,
}: {
  currentBlock: number;
  startBlock: number;
  endBlock: number;
  claimBlock: number;
}): AuctionPhase {
  if (currentBlock < startBlock) return "not_started";
  if (currentBlock < endBlock) return "active";
  if (currentBlock < claimBlock) return "ended";
  return "claimable";
}

export const PROVIDERS = {
  ECHO: 0,
  LEGION: 1,
  SUMSUB: 2,
} as const;

export type ProviderType = (typeof PROVIDERS)[keyof typeof PROVIDERS];

export function getProviderName(provider: number): string {
  switch (provider) {
    case PROVIDERS.ECHO:
      return "Echo Sonar";
    case PROVIDERS.LEGION:
      return "Veriff";
    case PROVIDERS.SUMSUB:
      return "Sumsub";
    default:
      return `Provider #${provider}`;
  }
}

export function requiresKYC(validationHook: string | undefined): boolean {
  return !!validationHook && validationHook !== "0x0000000000000000000000000000000000000000";
}

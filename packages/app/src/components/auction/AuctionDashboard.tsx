import { useState, useMemo } from "react";
import { useBlockNumber, useAccount } from "wagmi";
import { type Address, formatEther } from "viem";

import { useAuctionDetail } from "../../hooks/useIndexer.js";
import { useKYCCache } from "../../hooks/useKYCCache.js";
import { getAuctionPhase, PHASE_CONFIGS, requiresKYC } from "../../utils/auction.js";
import { fromQ96, formatPrice, formatLargeNumber } from "../../utils/formatting.js";
import { BidActivity } from "./BidActivity.js";
import { BidDistributionChart } from "./BidDistributionChart.js";
import { BidForm } from "./BidForm.js";

interface AuctionDashboardProps {
  auctionAddress: Address;
  auctionName?: string;
  hookData?: string;
  onKYCClick?: (hookAddress: string) => void;
  onBack: () => void;
}

type BottomTab = "activity" | "details";

export function AuctionDashboard({
  auctionAddress,
  auctionName = "Auction",
  hookData: hookDataProp,
  onKYCClick,
  onBack,
}: AuctionDashboardProps) {
  const [bottomTab, setBottomTab] = useState<BottomTab>("activity");
  const { auction, bids, checkpoints, loading, error, refetch } = useAuctionDetail(auctionAddress);
  const { data: currentBlock } = useBlockNumber({ watch: true });
  const { address } = useAccount();
  const { isVerified, hookData: cachedHookData, provider: cachedProvider, clearKYC } = useKYCCache(address);

  const effectiveHookData = hookDataProp || cachedHookData || undefined;
  const userIsVerified = isVerified || !!hookDataProp;
  const hasKYCHook = auction && requiresKYC(auction.validationHook);

  // Computed stats
  const stats = useMemo(() => {
    if (!auction) return null;
    const floorPrice = fromQ96(auction.floorPrice);
    const clearingPrice = fromQ96(auction.lastClearingPriceQ96);
    const totalSupply = BigInt(auction.totalSupply || "0");
    const totalCleared = BigInt(auction.totalCleared || "0");
    const currencyRaised = BigInt(auction.currencyRaised || "0");

    const percentSold = totalSupply > 0n
      ? Number((totalCleared * 100n) / totalSupply)
      : 0;

    const hasValidBlocks = auction.startBlock > 0 && auction.endBlock > 0;
    const blocksLeft = currentBlock && hasValidBlocks
      ? Math.max(0, auction.endBlock - Number(currentBlock))
      : null;

    const phase = currentBlock && hasValidBlocks
      ? getAuctionPhase({ currentBlock: Number(currentBlock), startBlock: auction.startBlock, endBlock: auction.endBlock, claimBlock: auction.claimBlock })
      : "active";

    return {
      floorPrice,
      clearingPrice,
      percentSold,
      blocksLeft,
      phase,
      totalSupply: formatLargeNumber({ value: auction.totalSupply }),
      totalCleared: formatLargeNumber({ value: auction.totalCleared }),
      currencyRaised: formatEther(currencyRaised),
      numBids: auction.numBids,
      numBidders: auction.numBidders,
    };
  }, [auction, currentBlock]);

  if (loading && !auction) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="w-3 h-3 bg-palm-cyan pulse-glow mx-auto mb-4" />
          <p className="text-palm-text-3 text-sm">Loading auction data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <div className="text-palm-pink text-3xl mb-4">&#9888;</div>
        <p className="text-palm-text-2 text-sm mb-2">Failed to load auction</p>
        <p className="text-palm-text-3 text-xs mb-4">{error}</p>
        <button
          onClick={refetch}
          className="px-4 py-2 border border-palm-border text-palm-text-3 text-xs hover:border-palm-cyan hover:text-palm-cyan transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <div className="text-palm-text-3 text-3xl mb-4">&#9670;</div>
        <p className="text-palm-text-2 text-sm">Auction not found</p>
        <p className="text-palm-text-3 text-xs mt-2">
          The indexer may not have picked up this auction yet
        </p>
      </div>
    );
  }

  const phaseConfig = stats ? PHASE_CONFIGS[stats.phase] : PHASE_CONFIGS.active;

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        className="text-palm-text-3 text-xs hover:text-palm-cyan transition-colors mb-4 flex items-center gap-2"
      >
        <span className="font-mono">&larr;</span>
        <span className="uppercase tracking-wider">Back to Auctions</span>
      </button>

      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-palm-text">
            {auctionName}
          </h1>
          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${phaseConfig.color} ${phaseConfig.bgColor}`}>
            {phaseConfig.label}
          </span>
          {hasKYCHook && (
            <span className="text-palm-green text-[10px] font-bold uppercase tracking-widest border border-palm-green/30 px-2 py-0.5">
              KYC
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasKYCHook && userIsVerified && (
            <div className="flex items-center gap-2 text-palm-green text-[10px] font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 bg-palm-green" />
              <span>Verified {cachedProvider ? `(${cachedProvider})` : ""}</span>
              <button
                onClick={clearKYC}
                className="text-palm-text-3 hover:text-palm-pink transition-colors ml-1"
                title="Clear cached verification"
              >
                ✕
              </button>
            </div>
          )}
          {hasKYCHook && !userIsVerified && onKYCClick && auction && (
            <button
              onClick={() => onKYCClick(auction.validationHook)}
              className="px-3 py-1.5 sm:px-4 sm:py-2 border border-palm-cyan text-palm-cyan text-[10px] sm:text-xs font-bold uppercase tracking-wider hover:bg-palm-cyan hover:text-palm-bg transition-colors whitespace-nowrap"
            >
              Complete KYC
            </button>
          )}
        </div>
      </div>

      {/* Key metrics bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-palm-border mb-6">
          <MetricTile label="Floor" value={formatPrice(stats.floorPrice)} />
          <MetricTile label="Clearing" value={formatPrice(stats.clearingPrice)} accent="cyan" />
          <MetricTile label="Raised" value={`${parseFloat(stats.currencyRaised).toFixed(3)} ETH`} accent="green" />
          <MetricTile label="Bids" value={stats.numBids.toString()} sub={`${stats.numBidders} bidders`} />
          <MetricTile
            label="Progress"
            value={`${stats.percentSold.toFixed(1)}%`}
            sub={`${stats.totalCleared} / ${stats.totalSupply}`}
          />
        </div>
      )}

      {/* Main content: Chart + Bid Form side by side, equal height */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Chart panel */}
        <div className="bg-palm-bg-secondary border border-palm-border/30 p-4 flex flex-col">
          <div className="text-palm-text-3 text-[10px] uppercase tracking-widest mb-3">
            Bid Distribution
          </div>
          <div className="flex-1 min-h-[280px]">
            <BidDistributionChart
              bids={bids}
              checkpoints={checkpoints}
              floorPrice={auction.floorPrice}
              tickSpacing={auction.tickSpacing}
              clearingPrice={auction.lastClearingPriceQ96}
              height={280}
            />
          </div>
        </div>

        {/* Bid form panel */}
        <div className="bg-palm-bg-secondary border border-palm-border/30 p-4">
          <BidForm
            auctionAddress={auctionAddress}
            floorPrice={auction.floorPrice}
            clearingPrice={auction.lastClearingPriceQ96}
            tickSpacing={auction.tickSpacing}
            endBlock={auction.endBlock}
            currentBlock={currentBlock ? Number(currentBlock) : undefined}
            hookData={effectiveHookData}
            onSuccess={refetch}
            compact
            requiresKYC={!!hasKYCHook}
            isKYCVerified={userIsVerified}
            onKYCClick={auction ? () => onKYCClick?.(auction.validationHook) : undefined}
          />
        </div>
      </div>

      {/* Bottom section: Activity / Details tabs */}
      <div className="bg-palm-bg-secondary border border-palm-border/30">
        {/* Tab bar */}
        <div className="flex border-b border-palm-border/30">
          <button
            onClick={() => setBottomTab("activity")}
            className={`px-4 py-3 text-xs font-medium uppercase tracking-wider transition-colors ${
              bottomTab === "activity" ? "text-palm-cyan border-b-2 border-palm-cyan" : "text-palm-text-3"
            }`}
          >
            Activity ({bids.length})
          </button>
          <button
            onClick={() => setBottomTab("details")}
            className={`px-4 py-3 text-xs font-medium uppercase tracking-wider transition-colors ${
              bottomTab === "details" ? "text-palm-cyan border-b-2 border-palm-cyan" : "text-palm-text-3"
            }`}
          >
            Details
          </button>
        </div>

        {/* Tab content */}
        <div className="p-4">
          {bottomTab === "activity" && (
            <BidActivity
              bids={bids}
              currentBlock={currentBlock ? Number(currentBlock) : undefined}
              maxItems={8}
            />
          )}
          {bottomTab === "details" && auction && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <DetailItem label="Contract" value={`${auctionAddress.slice(0, 10)}...${auctionAddress.slice(-8)}`} mono />
              <DetailItem label="Token" value={`${auction.token.slice(0, 10)}...${auction.token.slice(-8)}`} mono />
              <DetailItem label="Start Block" value={auction.startBlock.toLocaleString()} />
              <DetailItem label="End Block" value={auction.endBlock.toLocaleString()} />
              <DetailItem label="Claim Block" value={auction.claimBlock.toLocaleString()} />
              <DetailItem label="Total Supply" value={stats?.totalSupply || "—"} />
              <DetailItem label="Tick Spacing" value={formatPrice(fromQ96(auction.tickSpacing))} />
              <DetailItem
                label="Validation Hook"
                value={hasKYCHook ? "Palm KYC" : "None"}
                accent={hasKYCHook ? "green" : undefined}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  sub,
  accent
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "cyan" | "green"
}) {
  const valueColor = accent === "cyan" ? "text-palm-cyan" : accent === "green" ? "text-palm-green" : "text-palm-text";
  return (
    <div className="bg-palm-bg-secondary p-3">
      <div className="text-palm-text-3 text-[10px] uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-bold font-mono text-sm ${valueColor}`}>{value}</div>
      {sub && <div className="text-palm-text-3 text-[10px]">{sub}</div>}
    </div>
  );
}

function DetailItem({
  label,
  value,
  mono,
  accent
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: "green"
}) {
  return (
    <div>
      <div className="text-palm-text-3 text-[10px] uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-sm ${mono ? "font-mono" : ""} ${accent === "green" ? "text-palm-green" : "text-palm-text-2"}`}>
        {value}
      </div>
    </div>
  );
}

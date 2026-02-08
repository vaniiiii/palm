import { useMemo } from "react";
import { formatEther } from "viem";

import type { IndexedAuction } from "../../hooks/useIndexer";
import { getAuctionPhase, PHASE_CONFIGS } from "../../utils/auction";
import { formatLargeNumber, formatPrice, fromQ96, shortenAddress } from "../../utils/formatting";
import { getTokenMeta } from "../../utils/tokens";

interface AuctionStatsProps {
  auction: IndexedAuction;
  currentBlock?: number;
}

export function AuctionStats({ auction, currentBlock }: AuctionStatsProps) {
  const currencySymbol = getTokenMeta(auction.currency).symbol;

  const stats = useMemo(() => {
    const floorPrice = fromQ96(auction.floorPrice);
    const clearingPrice = fromQ96(auction.lastClearingPriceQ96);
    const tickSpacing = fromQ96(auction.tickSpacing);
    const totalSupply = BigInt(auction.totalSupply || "0");
    const currencyRaised = BigInt(auction.currencyRaised || "0");
    const totalCleared = BigInt(auction.totalCleared || "0");
    const totalBidAmount = BigInt(auction.totalBidAmount || "0");

    const percentSold = totalSupply > 0n
      ? Number((totalCleared * 100n) / totalSupply)
      : 0;

    const impliedFDV = clearingPrice > 0
      ? clearingPrice * Number(formatEther(totalSupply))
      : 0;

    const hasValidBlocks = auction.startBlock > 0 && auction.endBlock > 0;
    const blocksUntilStart = currentBlock && hasValidBlocks
      ? Math.max(0, auction.startBlock - currentBlock)
      : null;
    const blocksUntilEnd = currentBlock && hasValidBlocks
      ? Math.max(0, auction.endBlock - currentBlock)
      : null;
    const blocksUntilClaim = currentBlock && hasValidBlocks
      ? Math.max(0, auction.claimBlock - currentBlock)
      : null;

    const phase = (!currentBlock || !hasValidBlocks)
      ? "active" as const
      : getAuctionPhase({ currentBlock, startBlock: auction.startBlock, endBlock: auction.endBlock, claimBlock: auction.claimBlock });

    return {
      floorPrice,
      clearingPrice,
      tickSpacing,
      totalSupply: formatLargeNumber({ value: auction.totalSupply }),
      currencyRaised: formatEther(currencyRaised),
      totalCleared: formatLargeNumber({ value: auction.totalCleared }),
      totalBidAmount: formatEther(totalBidAmount),
      percentSold,
      impliedFDV,
      numBids: auction.numBids,
      numBidders: auction.numBidders,
      blocksUntilStart,
      blocksUntilEnd,
      blocksUntilClaim,
      phase,
      startBlock: auction.startBlock,
      endBlock: auction.endBlock,
      claimBlock: auction.claimBlock,
    };
  }, [auction, currentBlock]);

  const phaseConfig = PHASE_CONFIGS[stats.phase];

  return (
    <div>
      {/* Header row with progress */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-palm-text">
            Auction Stats
          </h3>
          <span
            className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${phaseConfig.color} ${phaseConfig.bgColor}`}
          >
            {phaseConfig.label}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-palm-text-3 text-[10px] uppercase tracking-wider">
            {stats.percentSold.toFixed(1)}% sold
          </span>
          <div className="w-32 h-1.5 bg-palm-border overflow-hidden">
            <div
              className="h-full bg-palm-cyan transition-all duration-500"
              style={{ width: `${Math.min(100, stats.percentSold)}%` }}
            />
          </div>
          <span className="text-palm-text-3 text-[10px] font-mono">
            {stats.totalCleared} / {stats.totalSupply}
          </span>
        </div>
      </div>

      {/* Main stats grid - horizontal layout */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-px bg-palm-border">
        <StatTile
          label="Floor Price"
          value={formatPrice(stats.floorPrice)}
          sub="minimum"
        />
        <StatTile
          label="Clearing"
          value={formatPrice(stats.clearingPrice)}
          sub="current"
          accent="cyan"
        />
        <StatTile
          label="Implied FDV"
          value={`${formatPrice(stats.impliedFDV)} ${currencySymbol}`}
          sub="fully diluted"
        />
        <StatTile
          label="Total Bids"
          value={stats.numBids.toString()}
        />
        <StatTile
          label="Bidders"
          value={stats.numBidders.toString()}
        />
        <StatTile
          label="Raised"
          value={`${parseFloat(stats.currencyRaised).toFixed(2)}`}
          sub={currencySymbol}
          accent="green"
        />
        <StatTile
          label="Tick Step"
          value={formatPrice(stats.tickSpacing)}
        />
      </div>

      {/* Timeline + Contract row */}
      <div className="flex flex-col md:flex-row gap-6 mt-4 pt-4 border-t border-palm-border/30">
        {/* Timeline */}
        <div className="flex-1">
          <h4 className="text-palm-text-3 text-[10px] uppercase tracking-widest mb-3">
            Timeline
          </h4>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <TimelineItem
              label="Start"
              block={stats.startBlock}
              blocksRemaining={stats.blocksUntilStart}
              status={stats.phase === "not_started" ? "pending" : "done"}
            />
            <TimelineItem
              label="End"
              block={stats.endBlock}
              blocksRemaining={stats.blocksUntilEnd}
              status={
                stats.phase === "not_started"
                  ? "future"
                  : stats.phase === "active"
                  ? "pending"
                  : "done"
              }
            />
            <TimelineItem
              label="Claim"
              block={stats.claimBlock}
              blocksRemaining={stats.blocksUntilClaim}
              status={
                stats.phase === "claimable"
                  ? "done"
                  : stats.phase === "ended"
                  ? "pending"
                  : "future"
              }
            />
          </div>
        </div>

        <div className="md:text-right">
          <h4 className="text-palm-text-3 text-[10px] uppercase tracking-widest mb-2">
            Contract
          </h4>
          <div className="text-palm-text-2 font-mono text-xs">
            {shortenAddress({ address: auction.id, chars: 8 })}
          </div>
          {auction.validationHook !== "0x0000000000000000000000000000000000000000" && (
            <div className="mt-1 flex items-center gap-2 md:justify-end">
              <span className="w-1.5 h-1.5 bg-palm-green" />
              <span className="text-palm-green text-[10px] uppercase tracking-wider">
                Palm KYC
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "cyan" | "green" | "pink";
}) {
  const valueColor =
    accent === "cyan"
      ? "text-palm-cyan"
      : accent === "green"
      ? "text-palm-green"
      : accent === "pink"
      ? "text-palm-pink"
      : "text-palm-text";

  return (
    <div className="stat-tile bg-palm-bg-secondary p-3">
      <div className="text-palm-text-3 text-[10px] uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={`font-bold text-sm font-mono ${valueColor}`}>
        {value}
        {sub && (
          <span className="text-palm-text-3 text-[10px] font-normal ml-1">
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

function TimelineItem({
  label,
  block,
  blocksRemaining,
  status,
}: {
  label: string;
  block: number;
  blocksRemaining: number | null;
  status: "done" | "pending" | "future";
}) {
  const iconColor =
    status === "done"
      ? "bg-palm-green"
      : status === "pending"
      ? "bg-palm-cyan pulse-glow"
      : "bg-palm-border";

  const textColor =
    status === "done"
      ? "text-palm-text-3"
      : status === "pending"
      ? "text-palm-cyan"
      : "text-palm-text-3";

  return (
    <div className="flex items-center gap-2">
      <div className={`w-1.5 h-1.5 ${iconColor}`} />
      <span className={`text-xs ${textColor}`}>{label}:</span>
      <span className="text-palm-text-3 text-[10px] font-mono">
        {block.toLocaleString()}
      </span>
      {blocksRemaining !== null && blocksRemaining > 0 && (
        <span className="text-palm-text-3 text-[10px] opacity-60">
          ({blocksRemaining.toLocaleString()})
        </span>
      )}
      {status === "done" && (
        <span className="text-palm-green text-[10px]">&#10003;</span>
      )}
    </div>
  );
}

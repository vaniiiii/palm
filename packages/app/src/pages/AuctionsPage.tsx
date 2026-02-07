import { useState, useMemo } from "react";
import { formatEther } from "viem";
import { useBlockNumber } from "wagmi";

import { useAuctions, type IndexedAuction } from "../hooks/useIndexer";
import { requiresKYC } from "../utils/auction";
import { fromQ96 } from "../utils/formatting";

const formatFDV = (price: number, supply: bigint): string => {
  const fdv = price * Number(formatEther(supply));
  if (fdv === 0) return "—";
  if (fdv < 1000) return `$${fdv.toFixed(0)}`;
  if (fdv < 1000000) return `$${(fdv / 1000).toFixed(1)}K`;
  if (fdv < 1000000000) return `$${(fdv / 1000000).toFixed(1)}M`;
  return `$${(fdv / 1000000000).toFixed(2)}B`;
};

const formatVolume = (value: bigint): string => {
  const num = Number(formatEther(value));
  if (num === 0) return "0 ETH";
  if (num < 0.01) return `${num.toFixed(4)} ETH`;
  if (num < 1) return `${num.toFixed(3)} ETH`;
  if (num < 1000) return `${num.toFixed(2)} ETH`;
  return `${(num / 1000).toFixed(1)}K ETH`;
};

type FilterTab = "active" | "upcoming" | "completed";

export default function AuctionsPage({
  onSelectAuction,
  onLaunchAuction,
}: {
  onSelectAuction: (address: string) => void;
  onLaunchAuction?: () => void;
}) {
  const { auctions, loading, error, refetch } = useAuctions();
  const { data: currentBlock } = useBlockNumber({ watch: true });
  const [filter, setFilter] = useState<FilterTab>("active");

  const categorized = useMemo(() => {
    if (!currentBlock) {
      return { active: auctions, upcoming: [], completed: [] };
    }
    const block = Number(currentBlock);
    const active: IndexedAuction[] = [];
    const upcoming: IndexedAuction[] = [];
    const completed: IndexedAuction[] = [];

    auctions.forEach((a) => {
      if (a.startBlock > 0 && block < a.startBlock) {
        upcoming.push(a);
      } else if (a.endBlock > 0 && block >= a.endBlock) {
        completed.push(a);
      } else {
        active.push(a);
      }
    });

    return { active, upcoming, completed };
  }, [auctions, currentBlock]);

  const displayedAuctions =
    filter === "active"
      ? categorized.active
      : filter === "upcoming"
      ? categorized.upcoming
      : categorized.completed;

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: "active", label: "Active", count: categorized.active.length },
    { id: "upcoming", label: "Upcoming", count: categorized.upcoming.length },
    { id: "completed", label: "Completed", count: categorized.completed.length },
  ];

  if (loading && auctions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-3 h-3 bg-palm-cyan pulse-glow" />
        <span className="text-palm-text-3 text-sm">Loading auctions...</span>
      </div>
    );
  }

  if (error && auctions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="text-palm-pink text-4xl mb-2">!</div>
        <span className="text-palm-text-2 text-sm">Could not connect to indexer</span>
        <button
          onClick={refetch}
          className="mt-2 px-4 py-2 border border-palm-border text-palm-text-3 text-xs hover:border-palm-cyan hover:text-palm-cyan transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3 sm:px-4 py-2 text-sm rounded-full transition-colors whitespace-nowrap ${
                filter === tab.id
                  ? "bg-palm-bg-secondary text-palm-text"
                  : "text-palm-text-3 hover:text-palm-text hover:bg-palm-bg-secondary/50"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1.5 text-palm-text-3 text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        {onLaunchAuction && (
          <button
            onClick={onLaunchAuction}
            className="px-4 py-2 bg-palm-cyan text-palm-bg text-sm font-medium hover:bg-palm-cyan/90 transition-colors whitespace-nowrap shrink-0"
          >
            + Launch
          </button>
        )}
      </div>

      <div className="hidden md:block border border-palm-border/30 rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-palm-bg-secondary text-palm-text-3 text-xs uppercase tracking-wider">
          <div className="col-span-1">#</div>
          <div className="col-span-4">Token</div>
          <div className="col-span-2 text-right">Current FDV</div>
          <div className="col-span-2 text-right">Committed</div>
          <div className="col-span-3 text-right">Time Remaining</div>
        </div>

        {displayedAuctions.length > 0 ? (
          displayedAuctions.map((auction, idx) => (
            <AuctionRow
              key={auction.id}
              auction={auction}
              index={idx + 1}
              currentBlock={currentBlock ? Number(currentBlock) : undefined}
              onClick={() => onSelectAuction(auction.id)}
            />
          ))
        ) : (
          <div className="px-4 py-12 text-center text-palm-text-3 text-sm">
            No {filter} auctions
          </div>
        )}
      </div>

      <div className="md:hidden space-y-3">
        {displayedAuctions.length > 0 ? (
          displayedAuctions.map((auction, idx) => (
            <AuctionCard
              key={auction.id}
              auction={auction}
              index={idx + 1}
              currentBlock={currentBlock ? Number(currentBlock) : undefined}
              onClick={() => onSelectAuction(auction.id)}
            />
          ))
        ) : (
          <div className="px-4 py-12 text-center text-palm-text-3 text-sm border border-palm-border/30 rounded-lg">
            No {filter} auctions
          </div>
        )}
      </div>

      <p className="text-palm-text-3 text-xs text-center mt-6 max-w-xl mx-auto">
        Auctions are sorted by committed volume. Palm does not provide valuation, recommendations, or opinions on any token.
      </p>
    </div>
  );
}

function AuctionRow({
  auction,
  index,
  currentBlock,
  onClick,
}: {
  auction: IndexedAuction;
  index: number;
  currentBlock?: number;
  onClick: () => void;
}) {
  const hasKYC = requiresKYC(auction.validationHook);
  const clearingPrice = fromQ96(auction.lastClearingPriceQ96);
  const totalSupply = BigInt(auction.totalSupply || "0");
  const committed = BigInt(auction.currencyRaised || "0");

  const timeInfo = useMemo(() => {
    if (!currentBlock || auction.startBlock === 0 || auction.endBlock === 0) {
      return { label: "—", progress: 0, status: "unknown" as const };
    }

    const block = currentBlock;
    const start = auction.startBlock;
    const end = auction.endBlock;

    if (block < start) {
      const blocksUntil = start - block;
      const minutes = Math.floor((blocksUntil * 2) / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      let label = "";
      if (days > 0) label = `Starting in ${days}d ${hours % 24}h`;
      else if (hours > 0) label = `Starting in ${hours}h ${minutes % 60}m`;
      else label = `Starting in ${minutes}m`;

      return { label, progress: 0, status: "upcoming" as const };
    }

    if (block >= end) {
      return { label: "Completed", progress: 100, status: "completed" as const };
    }

    const blocksRemaining = end - block;
    const totalDuration = end - start;
    const progress = ((block - start) / totalDuration) * 100;

    const minutes = Math.floor((blocksRemaining * 2) / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    let label = "";
    if (days > 0) label = `${days}d ${hours % 24}h ${minutes % 60}m`;
    else if (hours > 0) label = `${hours}h ${minutes % 60}m`;
    else label = `${minutes}m`;

    return { label, progress, status: "active" as const };
  }, [currentBlock, auction.startBlock, auction.endBlock]);

  return (
    <div
      className="grid grid-cols-12 gap-4 px-4 py-4 border-t border-palm-border/20 hover:bg-palm-bg-secondary/50 cursor-pointer transition-colors group"
      onClick={onClick}
    >
      <div className="col-span-1 text-palm-text-3 text-sm">
        {index}
      </div>

      <div className="col-span-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-palm-border flex items-center justify-center text-palm-text-3 text-xs font-mono">
          {auction.token.slice(2, 4).toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-palm-text text-sm font-medium group-hover:text-palm-cyan transition-colors">
              Auction {auction.id.slice(0, 6)}
            </span>
            {hasKYC && (
              <span className="text-palm-green text-[10px] font-medium">KYC</span>
            )}
          </div>
          <div className="text-palm-text-3 text-xs font-mono">
            {auction.token.slice(0, 6)}...{auction.token.slice(-4)}
          </div>
        </div>
      </div>

      <div className="col-span-2 text-right text-palm-text text-sm">
        {formatFDV(clearingPrice, totalSupply)}
      </div>

      <div className="col-span-2 text-right text-palm-text text-sm">
        {formatVolume(committed)}
      </div>

      <div className="col-span-3 flex flex-col items-end gap-1">
        <span
          className={`text-sm ${
            timeInfo.status === "completed"
              ? "text-palm-text-3"
              : timeInfo.status === "upcoming"
              ? "text-palm-text-2"
              : "text-palm-text"
          }`}
        >
          {timeInfo.label}
        </span>
        <div className="w-20 h-1 bg-palm-border rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              timeInfo.status === "completed"
                ? "bg-palm-text-3"
                : timeInfo.status === "upcoming"
                ? "bg-palm-cyan/30"
                : "bg-palm-cyan"
            }`}
            style={{ width: `${timeInfo.progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function AuctionCard({
  auction,
  index,
  currentBlock,
  onClick,
}: {
  auction: IndexedAuction;
  index: number;
  currentBlock?: number;
  onClick: () => void;
}) {
  const hasKYC = requiresKYC(auction.validationHook);
  const clearingPrice = fromQ96(auction.lastClearingPriceQ96);
  const totalSupply = BigInt(auction.totalSupply || "0");
  const committed = BigInt(auction.currencyRaised || "0");

  const timeInfo = useMemo(() => {
    if (!currentBlock || auction.startBlock === 0 || auction.endBlock === 0) {
      return { label: "—", progress: 0, status: "unknown" as const };
    }

    const block = currentBlock;
    const start = auction.startBlock;
    const end = auction.endBlock;

    if (block < start) {
      const blocksUntil = start - block;
      const minutes = Math.floor((blocksUntil * 2) / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      let label = "";
      if (days > 0) label = `Starts in ${days}d ${hours % 24}h`;
      else if (hours > 0) label = `Starts in ${hours}h ${minutes % 60}m`;
      else label = `Starts in ${minutes}m`;

      return { label, progress: 0, status: "upcoming" as const };
    }

    if (block >= end) {
      return { label: "Completed", progress: 100, status: "completed" as const };
    }

    const blocksRemaining = end - block;
    const totalDuration = end - start;
    const progress = ((block - start) / totalDuration) * 100;

    const minutes = Math.floor((blocksRemaining * 2) / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    let label = "";
    if (days > 0) label = `${days}d ${hours % 24}h left`;
    else if (hours > 0) label = `${hours}h ${minutes % 60}m left`;
    else label = `${minutes}m left`;

    return { label, progress, status: "active" as const };
  }, [currentBlock, auction.startBlock, auction.endBlock]);

  return (
    <div
      className="border border-palm-border/30 rounded-lg p-4 active:bg-palm-bg-secondary transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-palm-border flex items-center justify-center text-palm-text-3 text-sm font-mono">
            {auction.token.slice(2, 4).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-palm-text font-medium">
                Auction {auction.id.slice(0, 6)}
              </span>
              {hasKYC && (
                <span className="text-palm-green text-[10px] font-medium">KYC</span>
              )}
            </div>
            <div className="text-palm-text-3 text-xs font-mono">
              {auction.token.slice(0, 6)}...{auction.token.slice(-4)}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div
            className={`text-sm font-medium ${
              timeInfo.status === "completed"
                ? "text-palm-text-3"
                : timeInfo.status === "upcoming"
                ? "text-palm-text-2"
                : "text-palm-cyan"
            }`}
          >
            {timeInfo.label}
          </div>
          <div className="w-16 h-1 bg-palm-border rounded-full overflow-hidden mt-1 ml-auto">
            <div
              className={`h-full ${
                timeInfo.status === "completed"
                  ? "bg-palm-text-3"
                  : timeInfo.status === "upcoming"
                  ? "bg-palm-cyan/30"
                  : "bg-palm-cyan"
              }`}
              style={{ width: `${timeInfo.progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div>
          <div className="text-palm-text-3 text-[10px] uppercase">FDV</div>
          <div className="text-palm-text">{formatFDV(clearingPrice, totalSupply)}</div>
        </div>
        <div className="text-right">
          <div className="text-palm-text-3 text-[10px] uppercase">Committed</div>
          <div className="text-palm-text">{formatVolume(committed)}</div>
        </div>
      </div>
    </div>
  );
}

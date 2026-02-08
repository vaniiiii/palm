import { useState, useMemo, useEffect } from "react";
import { formatEther } from "viem";
import { useBlockNumber } from "wagmi";
import { getBlockNumber } from "@wagmi/core";
import { config } from "../wagmi";

import { useAllAuctions, type IndexedAuction } from "../hooks/useIndexer";
import { SUPPORTED_CHAIN_IDS, getChainName } from "../config/chains";
import { requiresKYC } from "../utils/auction";
import { fromQ96 } from "../utils/formatting";
import { getTokenMeta } from "../utils/tokens";
import { generateTokenAvatar } from "../utils/token-avatar";

const formatFDV = (price: number, supply: bigint, symbol: string): string => {
  const fdv = price * Number(formatEther(supply));
  if (fdv === 0) return "—";
  if (fdv < 0.01) return `${fdv.toFixed(4)} ${symbol}`;
  if (fdv < 1) return `${fdv.toFixed(3)} ${symbol}`;
  if (fdv < 1000) return `${fdv.toFixed(1)} ${symbol}`;
  if (fdv < 1000000) return `${(fdv / 1000).toFixed(1)}K ${symbol}`;
  return `${(fdv / 1000000).toFixed(1)}M ${symbol}`;
};

const formatVolume = (value: bigint, symbol: string): string => {
  const num = Number(formatEther(value));
  if (num === 0) return `0 ${symbol}`;
  if (num < 0.01) return `${num.toFixed(4)} ${symbol}`;
  if (num < 1) return `${num.toFixed(3)} ${symbol}`;
  if (num < 1000) return `${num.toFixed(2)} ${symbol}`;
  return `${(num / 1000).toFixed(1)}K ${symbol}`;
};

type FilterTab = "active" | "upcoming" | "completed";

export default function AuctionsPage({
  onSelectAuction,
  onLaunchAuction,
}: {
  onSelectAuction: (address: string, chainId: number) => void;
  onLaunchAuction?: () => void;
}) {
  const { auctions, loading, error, refetch } = useAllAuctions();
  const [filter, setFilter] = useState<FilterTab>("active");
  const [chainFilter, setChainFilter] = useState<number | null>(null);

  const chainIds = useMemo(() => [...new Set(auctions.map(a => a.chainId))], [auctions]);
  const [blockByChain, setBlockByChain] = useState<Record<number, number>>({});

  useEffect(() => {
    if (chainIds.length === 0) return;
    const fetchBlocks = async () => {
      const results = await Promise.allSettled(
        chainIds.map(async (id) => {
          const block = await getBlockNumber(config, { chainId: id as any });
          return [id, Number(block)] as const;
        })
      );
      const m: Record<number, number> = {};
      for (const r of results) {
        if (r.status === "fulfilled") m[r.value[0]] = r.value[1];
      }
      setBlockByChain(m);
    };
    fetchBlocks();
    const interval = setInterval(fetchBlocks, 12000);
    return () => clearInterval(interval);
  }, [chainIds]);

  const filtered = useMemo(() => {
    if (chainFilter === null) return auctions;
    return auctions.filter(a => a.chainId === chainFilter);
  }, [auctions, chainFilter]);

  const categorized = useMemo(() => {
    const active: IndexedAuction[] = [];
    const upcoming: IndexedAuction[] = [];
    const completed: IndexedAuction[] = [];

    filtered.forEach((a) => {
      const block = blockByChain[a.chainId];
      if (!block || a.startBlock === 0 || a.endBlock === 0) {
        active.push(a);
        return;
      }
      if (block < a.startBlock) {
        upcoming.push(a);
      } else if (block >= a.endBlock) {
        completed.push(a);
      } else {
        active.push(a);
      }
    });

    return { active, upcoming, completed };
  }, [filtered, blockByChain]);

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
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
        <div className="flex items-center gap-1">
          <button
            onClick={() => setChainFilter(null)}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              chainFilter === null
                ? "bg-palm-cyan/20 text-palm-cyan"
                : "text-palm-text-3 hover:text-palm-text"
            }`}
          >
            All chains
          </button>
          {SUPPORTED_CHAIN_IDS.map((id) => (
            <button
              key={id}
              onClick={() => setChainFilter(id)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                chainFilter === id
                  ? "bg-palm-cyan/20 text-palm-cyan"
                  : "text-palm-text-3 hover:text-palm-text"
              }`}
            >
              {getChainName(id)}
            </button>
          ))}
        </div>
      </div>

      <div className="hidden md:block border border-palm-border/30 rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-palm-bg-secondary text-palm-text-3 text-xs uppercase tracking-wider">
          <div className="col-span-1">#</div>
          <div className="col-span-3">Token</div>
          <div className="col-span-2">Chain</div>
          <div className="col-span-2 text-right">Current FDV</div>
          <div className="col-span-2 text-right">Committed</div>
          <div className="col-span-2 text-right">Time Remaining</div>
        </div>

        {displayedAuctions.length > 0 ? (
          displayedAuctions.map((auction, idx) => (
            <AuctionRow
              key={`${auction.chainId}-${auction.id}`}
              auction={auction}
              index={idx + 1}
              onClick={() => onSelectAuction(auction.id, auction.chainId)}
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
              key={`${auction.chainId}-${auction.id}`}
              auction={auction}
              index={idx + 1}
              onClick={() => onSelectAuction(auction.id, auction.chainId)}
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
  onClick,
}: {
  auction: IndexedAuction;
  index: number;
  onClick: () => void;
}) {
  const hasKYC = requiresKYC(auction.validationHook);
  const clearingPrice = fromQ96(auction.lastClearingPriceQ96);
  const totalSupply = BigInt(auction.totalSupply || "0");
  const committed = BigInt(auction.currencyRaised || "0");
  const tokenMeta = getTokenMeta(auction.currency);
  const tokenAvatar = useMemo(() => generateTokenAvatar(auction.token), [auction.token]);
  const timeInfo = useAuctionTime(auction);

  return (
    <div
      className="grid grid-cols-12 gap-4 px-4 py-4 border-t border-palm-border/20 hover:bg-palm-bg-secondary/50 cursor-pointer transition-colors group"
      onClick={onClick}
    >
      <div className="col-span-1 text-palm-text-3 text-sm">
        {index}
      </div>

      <div className="col-span-3 flex items-center gap-3">
        <img src={tokenAvatar} alt="" className="w-8 h-8 rounded-full shrink-0" />
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

      <div className="col-span-2 flex items-center">
        <ChainBadge chainId={auction.chainId} />
      </div>

      <div className="col-span-2 flex items-center justify-end gap-1.5 text-palm-text text-sm">
        {tokenMeta.logo && <img src={tokenMeta.logo} alt={tokenMeta.symbol} className="w-4 h-4" />}
        {formatFDV(clearingPrice, totalSupply, tokenMeta.symbol)}
      </div>

      <div className="col-span-2 flex items-center justify-end gap-1.5 text-palm-text text-sm">
        {tokenMeta.logo && <img src={tokenMeta.logo} alt={tokenMeta.symbol} className="w-4 h-4" />}
        {formatVolume(committed, tokenMeta.symbol)}
      </div>

      <div className="col-span-2 flex flex-col items-end gap-1">
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
  onClick,
}: {
  auction: IndexedAuction;
  index: number;
  onClick: () => void;
}) {
  const hasKYC = requiresKYC(auction.validationHook);
  const clearingPrice = fromQ96(auction.lastClearingPriceQ96);
  const totalSupply = BigInt(auction.totalSupply || "0");
  const committed = BigInt(auction.currencyRaised || "0");
  const tokenMeta = getTokenMeta(auction.currency);
  const tokenAvatar = useMemo(() => generateTokenAvatar(auction.token), [auction.token]);
  const timeInfo = useAuctionTime(auction);

  return (
    <div
      className="border border-palm-border/30 rounded-lg p-4 active:bg-palm-bg-secondary transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <img src={tokenAvatar} alt="" className="w-10 h-10 rounded-full shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-palm-text font-medium">
                Auction {auction.id.slice(0, 6)}
              </span>
              {hasKYC && (
                <span className="text-palm-green text-[10px] font-medium">KYC</span>
              )}
              <ChainBadge chainId={auction.chainId} />
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
          <div className="flex items-center gap-1 text-palm-text">
            {tokenMeta.logo && <img src={tokenMeta.logo} alt={tokenMeta.symbol} className="w-3.5 h-3.5" />}
            {formatFDV(clearingPrice, totalSupply, tokenMeta.symbol)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-palm-text-3 text-[10px] uppercase">Committed</div>
          <div className="flex items-center justify-end gap-1 text-palm-text">
            {tokenMeta.logo && <img src={tokenMeta.logo} alt={tokenMeta.symbol} className="w-3.5 h-3.5" />}
            {formatVolume(committed, tokenMeta.symbol)}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChainBadge({ chainId }: { chainId: number }) {
  const name = getChainName(chainId);
  return (
    <span className="text-[10px] text-palm-text-3 border border-palm-border/50 px-1.5 py-0.5 rounded-sm">
      {name}
    </span>
  );
}

function useAuctionTime(auction: IndexedAuction) {
  const { data: blockNumber } = useBlockNumber({ chainId: auction.chainId, watch: true });
  return useMemo(() => {
    const block = blockNumber ? Number(blockNumber) : undefined;
    if (!block || auction.startBlock === 0 || auction.endBlock === 0) {
      return { label: "\u2014", progress: 0, status: "unknown" as const };
    }

    if (block < auction.startBlock) {
      const blocksUntil = auction.startBlock - block;
      return { label: formatBlockDuration(blocksUntil, "Starts in "), progress: 0, status: "upcoming" as const };
    }

    if (block >= auction.endBlock) {
      return { label: "Completed", progress: 100, status: "completed" as const };
    }

    const blocksRemaining = auction.endBlock - block;
    const totalDuration = auction.endBlock - auction.startBlock;
    const progress = ((block - auction.startBlock) / totalDuration) * 100;

    return { label: formatBlockDuration(blocksRemaining, "", " left"), progress, status: "active" as const };
  }, [blockNumber, auction.startBlock, auction.endBlock]);
}

function formatBlockDuration(blocks: number, prefix = "", suffix = ""): string {
  const minutes = Math.floor((blocks * 2) / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${prefix}${days}d ${hours % 24}h${suffix}`;
  if (hours > 0) return `${prefix}${hours}h ${minutes % 60}m${suffix}`;
  return `${prefix}${minutes}m${suffix}`;
}

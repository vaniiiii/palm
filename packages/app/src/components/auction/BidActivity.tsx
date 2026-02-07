import { useMemo } from "react";
import { formatEther } from "viem";

import type { IndexedBid } from "../../hooks/useIndexer.js";
import { formatPrice, fromQ96, shortenAddress } from "../../utils/formatting.js";

interface BidActivityItemProps {
  bid: IndexedBid;
  currentBlock?: number;
}

function BidActivityItem({ bid, currentBlock }: BidActivityItemProps) {
  const amount = formatEther(BigInt(bid.amount));
  const maxPrice = fromQ96(bid.maxPriceQ96);
  const blocksAgo = currentBlock ? currentBlock - bid.startBlock : null;

  const isFilled = BigInt(bid.tokensFilled || "0") > 0n;
  const isExited = bid.exited;
  const isClaimed = bid.claimed;

  let statusLabel: string;
  let statusColor: string;

  if (isClaimed) {
    statusLabel = "Claimed";
    statusColor = "text-palm-green";
  } else if (isExited) {
    statusLabel = "Exited";
    statusColor = "text-palm-text-3";
  } else if (isFilled) {
    statusLabel = "Filled";
    statusColor = "text-palm-cyan";
  } else {
    statusLabel = "Active";
    statusColor = "text-palm-green";
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-palm-bg-secondary hover:bg-[#353535] transition-colors group">
      <div className="w-8 h-8 bg-palm-border flex items-center justify-center text-palm-text-3 text-xs font-mono">
        {bid.owner.slice(2, 4).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-palm-text font-medium">
            {parseFloat(amount).toFixed(4)} ETH
          </span>
          <span className="text-palm-text-3">@</span>
          <span className="text-palm-cyan font-mono">
            {formatPrice(maxPrice)}
          </span>
        </div>
        <div className="text-palm-text-3 text-xs font-mono">
          {shortenAddress({ address: bid.owner })}
        </div>
      </div>

      <div className="text-right">
        <div className={`text-[10px] uppercase tracking-wider ${statusColor}`}>
          {statusLabel}
        </div>
        {blocksAgo !== null && (
          <div className="text-palm-text-3 text-[10px]">
            {blocksAgo > 0 ? `${blocksAgo} blocks ago` : "Just now"}
          </div>
        )}
      </div>
    </div>
  );
}

interface BidActivityProps {
  bids: IndexedBid[];
  currentBlock?: number;
  maxItems?: number;
}

export function BidActivity({
  bids,
  currentBlock,
  maxItems = 10,
}: BidActivityProps) {
  const sortedBids = useMemo(() => {
    return [...bids]
      .sort((a, b) => b.startBlock - a.startBlock)
      .slice(0, maxItems);
  }, [bids, maxItems]);

  const stats = useMemo(() => {
    const totalBids = bids.length;
    const totalAmount = bids.reduce(
      (sum, bid) => sum + BigInt(bid.amount),
      0n
    );
    const uniqueBidders = new Set(bids.map((b) => b.owner.toLowerCase())).size;
    const activeBids = bids.filter((b) => !b.exited && !b.claimed).length;

    return {
      totalBids,
      totalAmount: formatEther(totalAmount),
      uniqueBidders,
      activeBids,
    };
  }, [bids]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold uppercase tracking-widest text-palm-text">
          Bid Activity
        </h3>
        <span className="text-palm-text-3 text-[10px] uppercase tracking-wider">
          {stats.totalBids} total
        </span>
      </div>

      <div className="grid grid-cols-3 gap-px bg-palm-border mb-4">
        <div className="bg-palm-bg-secondary p-3">
          <div className="text-palm-text-3 text-[10px] uppercase tracking-wider mb-1">
            Bidders
          </div>
          <div className="text-palm-text font-bold text-lg">
            {stats.uniqueBidders}
          </div>
        </div>
        <div className="bg-palm-bg-secondary p-3">
          <div className="text-palm-text-3 text-[10px] uppercase tracking-wider mb-1">
            Active Bids
          </div>
          <div className="text-palm-green font-bold text-lg">
            {stats.activeBids}
          </div>
        </div>
        <div className="bg-palm-bg-secondary p-3">
          <div className="text-palm-text-3 text-[10px] uppercase tracking-wider mb-1">
            Total Value
          </div>
          <div className="text-palm-cyan font-bold text-lg font-mono">
            {parseFloat(stats.totalAmount).toFixed(2)}
            <span className="text-xs font-normal text-palm-text-3 ml-1">
              ETH
            </span>
          </div>
        </div>
      </div>

      {sortedBids.length > 0 ? (
        <div className="relative">
          <div className="space-y-px max-h-[400px] overflow-y-auto">
            {sortedBids.map((bid, index) => (
              <BidActivityItem
                key={bid.id || `bid-${index}`}
                bid={bid}
                currentBlock={currentBlock}
              />
            ))}
          </div>
          {sortedBids.length >= maxItems && (
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-palm-bg to-transparent pointer-events-none" />
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 bg-palm-bg-secondary">
          <div className="text-palm-text-3 text-2xl mb-3">&#9670;</div>
          <p className="text-palm-text-3 text-sm">No bids yet</p>
          <p className="text-palm-text-3 text-xs mt-1">
            Be the first to place a bid
          </p>
        </div>
      )}

      {bids.length > maxItems && (
        <button className="w-full py-3 mt-2 text-palm-text-3 text-xs uppercase tracking-wider hover:text-palm-cyan transition-colors border border-palm-border/30 hover:border-palm-cyan/30">
          View all {bids.length} bids
        </button>
      )}
    </div>
  );
}

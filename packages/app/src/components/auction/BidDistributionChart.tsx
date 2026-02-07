import { useState, useMemo, useEffect, useRef } from "react";
import { formatEther } from "viem";
import { createChart, IChartApi, ISeriesApi, ColorType, AreaData, Time, AreaSeries } from "lightweight-charts";
import type { IndexedBid, IndexedCheckpoint } from "../../hooks/useIndexer";
import { fromQ96, formatPrice } from "../../utils/formatting";

interface BidDistributionChartProps {
  bids: IndexedBid[];
  checkpoints: IndexedCheckpoint[];
  floorPrice: string;
  tickSpacing: string;
  clearingPrice: string;
  height?: number;
}

type ChartTab = "price" | "demand" | "distribution";

export function BidDistributionChart({
  bids,
  checkpoints,
  floorPrice,
  tickSpacing,
  clearingPrice,
  height = 280,
}: BidDistributionChartProps) {
  const [activeTab, setActiveTab] = useState<ChartTab>("price");

  const floorPriceNum = useMemo(() => fromQ96(floorPrice), [floorPrice]);
  const tickSpacingNum = useMemo(() => fromQ96(tickSpacing), [tickSpacing]);
  const clearingPriceNum = useMemo(() => fromQ96(clearingPrice), [clearingPrice]);

  const priceHistory = useMemo(() => {
    return checkpoints.map((cp) => ({
      block: cp.blockNumber,
      price: fromQ96(cp.clearingPriceQ96),
    }));
  }, [checkpoints]);

  const bucketData = useMemo(() => {
    if (!bids.length || tickSpacingNum === 0) return [];

    const buckets = new Map<number, { amount: bigint; count: number }>();
    let maxAmount = 0n;

    bids.forEach((bid) => {
      const maxPrice = fromQ96(bid.maxPriceQ96);
      const amount = BigInt(bid.amount);
      const bucketIndex = Math.floor((maxPrice - floorPriceNum) / tickSpacingNum);
      const bucketPrice = floorPriceNum + bucketIndex * tickSpacingNum;

      const existing = buckets.get(bucketPrice) || { amount: 0n, count: 0 };
      const newAmount = existing.amount + amount;
      buckets.set(bucketPrice, { amount: newAmount, count: existing.count + 1 });
      if (newAmount > maxAmount) maxAmount = newAmount;
    });

    return [...buckets.entries()]
      .map(([price, data]) => ({
        price,
        amount: data.amount,
        amountEth: Number(formatEther(data.amount)),
        count: data.count,
        percentage: maxAmount > 0n ? Number((data.amount * 100n) / maxAmount) : 0,
        isAtClearing: Math.abs(price - clearingPriceNum) < tickSpacingNum,
        isAboveClearing: price > clearingPriceNum,
      }))
      .sort((a, b) => b.price - a.price);
  }, [bids, floorPriceNum, tickSpacingNum, clearingPriceNum]);

  const totalBidAmount = useMemo(() => {
    return bids.reduce((sum, bid) => sum + BigInt(bid.amount), 0n);
  }, [bids]);

  const tabs: { id: ChartTab; label: string }[] = [
    { id: "price", label: "Price" },
    { id: "demand", label: "Demand" },
    { id: "distribution", label: "Distribution" },
  ];

  if (bids.length === 0) {
    return (
      <div style={{ height }} className="flex flex-col">
        <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-palm-text-3 text-3xl mb-3">&#9670;</div>
            <p className="text-palm-text-3 text-sm">No bids yet</p>
            <p className="text-palm-text-3 text-xs mt-1">Charts will appear here</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height }} className="flex flex-col">
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex-1 overflow-hidden">
        {activeTab === "price" && (
          <PriceChartView
            priceHistory={priceHistory}
            currentPrice={clearingPriceNum}
            floorPrice={floorPriceNum}
          />
        )}
        {activeTab === "demand" && (
          <DemandView buckets={bucketData} clearingPrice={clearingPriceNum} />
        )}
        {activeTab === "distribution" && (
          <DistributionView buckets={bucketData} totalAmount={totalBidAmount} />
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-palm-border/30 text-[10px] font-mono">
        <span className="text-palm-text-3">
          Clearing: <span className="text-palm-cyan">{formatPrice(clearingPriceNum)}</span>
        </span>
        <span className="text-palm-text-3">
          Total: <span className="text-palm-text">{Number(formatEther(totalBidAmount)).toFixed(2)} ETH</span>
        </span>
      </div>
    </div>
  );
}

function TabBar({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: { id: ChartTab; label: string }[];
  activeTab: ChartTab;
  onTabChange: (tab: ChartTab) => void;
}) {
  return (
    <div className="flex gap-4 mb-3">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? "text-palm-text"
              : "text-palm-text-3 hover:text-palm-text-2"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function PriceChartView({
  priceHistory,
  currentPrice,
  floorPrice,
}: {
  priceHistory: { block: number; price: number }[];
  currentPrice: number;
  floorPrice: number;
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  const chartData = useMemo((): AreaData<Time>[] => {
    const now = Math.floor(Date.now() / 1000);

    if (priceHistory.length === 0) {
      return [
        { time: (now - 3600) as Time, value: currentPrice },
        { time: now as Time, value: currentPrice },
      ];
    }

    if (priceHistory.length === 1) {
      const p = priceHistory[0];
      return [
        { time: (now - 3600) as Time, value: p.price },
        { time: now as Time, value: p.price },
      ];
    }

    const latestBlock = priceHistory[priceHistory.length - 1].block;
    return priceHistory.map((p) => ({
      time: (now - (latestBlock - p.block) * 2) as Time,
      value: p.price,
    }));
  }, [priceHistory, currentPrice]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#888",
        fontFamily: "monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#333" },
        horzLines: { color: "#333" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 180,
      leftPriceScale: {
        visible: true,
        borderColor: "#333",
        scaleMargins: { top: 0.15, bottom: 0.15 },
      },
      rightPriceScale: {
        visible: false,
      },
      timeScale: {
        borderColor: "#333",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: "#00D9FF", width: 1, style: 0 },
        horzLine: { color: "#00D9FF", width: 1, style: 0 },
      },
    });

    chartRef.current = chart;

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#00D9FF",
      topColor: "rgba(0, 217, 255, 0.3)",
      bottomColor: "rgba(0, 217, 255, 0.02)",
      lineWidth: 2,
      lineStyle: 0,
      priceScaleId: "left",
      priceFormat: {
        type: "custom",
        formatter: (price: number) => formatPrice(price),
        minMove: 0.000001,
      },
    });

    seriesRef.current = series;
    series.setData(chartData);
    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (seriesRef.current && chartData.length > 0) {
      seriesRef.current.setData(chartData);
      chartRef.current?.timeScale().fitContent();
    }
  }, [chartData]);

  return (
    <div className="h-full flex flex-col">
      <div ref={chartContainerRef} className="flex-1" />
    </div>
  );
}

function DemandView({
  buckets,
  clearingPrice,
}: {
  buckets: { price: number; amountEth: number; percentage: number; isAtClearing: boolean; isAboveClearing: boolean }[];
  clearingPrice: number;
}) {
  return (
    <div className="h-full overflow-y-auto pr-2 space-y-1">
      {buckets.map((bucket, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-20 text-right text-[10px] font-mono text-palm-text-3 shrink-0">
            {formatPrice(bucket.price)}
          </div>
          <div className="flex-1 h-5 bg-palm-border/30 relative overflow-hidden">
            <div
              className={`h-full transition-all ${
                bucket.isAtClearing
                  ? "bg-palm-cyan"
                  : bucket.isAboveClearing
                  ? "bg-palm-cyan/60"
                  : "bg-palm-text-3/40"
              }`}
              style={{ width: `${bucket.percentage}%` }}
            />
            {bucket.isAtClearing && (
              <div className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] text-palm-bg font-bold">
                CLEARING
              </div>
            )}
          </div>
          <div className="w-16 text-right text-[10px] font-mono text-palm-text-2 shrink-0">
            {bucket.amountEth.toFixed(2)} ETH
          </div>
        </div>
      ))}
      {buckets.length === 0 && (
        <div className="text-center text-palm-text-3 text-sm py-8">No demand data</div>
      )}
    </div>
  );
}

function DistributionView({
  buckets,
  totalAmount,
}: {
  buckets: { price: number; amount: bigint; amountEth: number; count: number }[];
  totalAmount: bigint;
}) {
  return (
    <div className="h-full overflow-y-auto pr-2">
      <div className="grid grid-cols-4 gap-2 text-[10px] text-palm-text-3 uppercase tracking-wider mb-2 px-1">
        <div>Price</div>
        <div className="text-right">Volume</div>
        <div className="text-right">% of Total</div>
        <div className="text-right">Bids</div>
      </div>
      <div className="space-y-1">
        {buckets.map((bucket, i) => {
          const pct = totalAmount > 0n ? Number((bucket.amount * 10000n) / totalAmount) / 100 : 0;
          return (
            <div
              key={i}
              className="grid grid-cols-4 gap-2 text-xs font-mono py-1 px-1 hover:bg-palm-border/20 transition-colors"
            >
              <div className="text-palm-text-2">{formatPrice(bucket.price)}</div>
              <div className="text-right text-palm-text">{bucket.amountEth.toFixed(3)}</div>
              <div className="text-right text-palm-cyan">{pct.toFixed(1)}%</div>
              <div className="text-right text-palm-text-3">{bucket.count}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

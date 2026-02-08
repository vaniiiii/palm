import { useState, useEffect, useCallback, useRef } from "react";
import { useChainId } from "wagmi";
import { getChainConfig, CHAIN_CONFIG, type IndexerType } from "../config/chains";

function getIndexerUrl(chainId: number | undefined): string | null {
  const config = getChainConfig(chainId);
  return config?.indexerUrl || null;
}

function getIndexerType(chainId: number | undefined): IndexerType {
  const config = getChainConfig(chainId);
  return config?.indexerType || 'ponder';
}

async function gql<T>(indexerUrl: string, query: string, variables?: Record<string, unknown>, retries = 2): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(indexerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      if (!res.ok) throw new Error(`Indexer request failed: ${res.status}`);
      const json = await res.json();
      if (json.errors?.length) throw new Error(json.errors[0].message);
      return json.data;
    } catch (e: any) {
      lastError = e;
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

export interface IndexedAuction {
  id: string;
  chainId: number;
  token: string;
  currency: string;
  amount: string;
  startBlock: number;
  endBlock: number;
  claimBlock: number;
  totalSupply: string;
  floorPrice: string;
  tickSpacing: string;
  validationHook: string;
  createdAt: number;
  lastClearingPriceQ96: string;
  currencyRaised: string;
  totalCleared: string;
  numBids: number;
  numBidders: number;
  totalBidAmount: string;
  cumulativeMps: number;
}

export interface IndexedBid {
  id: string;
  auctionId: string;
  amount: string;
  maxPriceQ96: string;
  owner: string;
  startBlock: number;
  tokensFilled: string;
  amountFilled: string;
  exited: boolean;
  claimed: boolean;
}

export interface IndexedCheckpoint {
  id: string;
  auctionId: string;
  blockNumber: number;
  clearingPriceQ96: string;
}

const AUCTION_FIELDS = `
  id token currency amount startBlock endBlock claimBlock
  totalSupply floorPrice tickSpacing validationHook createdAt
  lastClearingPriceQ96 currencyRaised totalCleared
  numBids numBidders totalBidAmount cumulativeMps
`;

const BID_FIELDS = `
  id auctionId amount maxPriceQ96 owner startBlock
  tokensFilled amountFilled exited claimed
`;

const CHECKPOINT_FIELDS = `id auctionId blockNumber clearingPriceQ96`;

// --- Ponder queries ---

const PONDER_AUCTIONS_QUERY = `
  query {
    auctions(orderBy: "createdAt", orderDirection: "desc") {
      items { ${AUCTION_FIELDS} }
    }
  }
`;

const PONDER_DETAIL_QUERY = `
  query($id: String!) {
    auction(id: $id) { ${AUCTION_FIELDS} }
    bids(where: { auctionId: $id }, orderBy: "startBlock", orderDirection: "desc", limit: 50) {
      items { ${BID_FIELDS} }
    }
    checkpoints(where: { auctionId: $id }, orderBy: "blockNumber", orderDirection: "asc", limit: 100) {
      items { ${CHECKPOINT_FIELDS} }
    }
  }
`;

// --- Envio (Hasura) queries ---

const ENVIO_AUCTIONS_QUERY = `
  query {
    Auction(order_by: { createdAt: desc }) { ${AUCTION_FIELDS} }
  }
`;

const ENVIO_DETAIL_QUERY = `
  query($id: String!) {
    Auction_by_pk(id: $id) { ${AUCTION_FIELDS} }
    Bid(where: { auctionId: { _eq: $id } }, order_by: { startBlock: desc }, limit: 50) {
      ${BID_FIELDS}
    }
    Checkpoint(where: { auctionId: { _eq: $id } }, order_by: { blockNumber: asc }, limit: 100) {
      ${CHECKPOINT_FIELDS}
    }
  }
`;

// --- Response normalizers ---

function extractAuctions(data: any, type: IndexerType): Omit<IndexedAuction, "chainId">[] {
  if (type === 'envio') return data.Auction || [];
  return data.auctions?.items || [];
}

function extractDetail(data: any, type: IndexerType): {
  auction: IndexedAuction | null;
  bids: IndexedBid[];
  checkpoints: IndexedCheckpoint[];
} {
  if (type === 'envio') {
    return {
      auction: data.Auction_by_pk || null,
      bids: data.Bid || [],
      checkpoints: data.Checkpoint || [],
    };
  }
  return {
    auction: data.auction || null,
    bids: data.bids?.items || [],
    checkpoints: data.checkpoints?.items || [],
  };
}

// --- Hooks ---

export function useAuctions() {
  const chainId = useChainId();
  const [auctions, setAuctions] = useState<IndexedAuction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const indexerUrl = getIndexerUrl(chainId);
    if (!indexerUrl) {
      setAuctions([]);
      setLoading(false);
      setError("No indexer configured for this network");
      return;
    }

    const type = getIndexerType(chainId);
    const query = type === 'envio' ? ENVIO_AUCTIONS_QUERY : PONDER_AUCTIONS_QUERY;

    try {
      setLoading(true);
      setError(null);
      const data = await gql<any>(indexerUrl, query);
      setAuctions(extractAuctions(data, type).map(a => ({ ...a, chainId })));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [chainId]);

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, 5000);
    return () => clearInterval(interval);
  }, [refetch]);

  return { auctions, loading, error, refetch };
}

export function useAllAuctions() {
  const [auctions, setAuctions] = useState<IndexedAuction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const entries = Object.entries(CHAIN_CONFIG)
      .filter(([, cfg]) => cfg.indexerUrl)
      .map(([id, cfg]) => ({ chainId: Number(id), indexerUrl: cfg.indexerUrl, indexerType: cfg.indexerType }));

    if (entries.length === 0) {
      setAuctions([]);
      setLoading(false);
      setError("No indexers configured");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const results = await Promise.allSettled(
        entries.map(async ({ chainId, indexerUrl, indexerType }) => {
          const query = indexerType === 'envio' ? ENVIO_AUCTIONS_QUERY : PONDER_AUCTIONS_QUERY;
          const data = await gql<any>(indexerUrl, query);
          return extractAuctions(data, indexerType).map(a => ({ ...a, chainId }));
        })
      );

      const merged: IndexedAuction[] = [];
      const errors: string[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") merged.push(...r.value);
        else errors.push(r.reason?.message || "Unknown error");
      }

      merged.sort((a, b) => b.createdAt - a.createdAt);
      setAuctions(merged);
      if (merged.length === 0 && errors.length > 0) {
        setError(errors.join("; "));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, 5000);
    return () => clearInterval(interval);
  }, [refetch]);

  return { auctions, loading, error, refetch };
}

export function useAuctionDetail(auctionId: string | null, overrideChainId?: number) {
  const walletChainId = useChainId();
  const chainId = overrideChainId ?? walletChainId;
  const [auction, setAuction] = useState<IndexedAuction | null>(null);
  const [bids, setBids] = useState<IndexedBid[]>([]);
  const [checkpoints, setCheckpoints] = useState<IndexedCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasDataRef = useRef(false);
  const fetchingRef = useRef(false);

  const refetch = useCallback(async () => {
    if (!auctionId) return;
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    const indexerUrl = getIndexerUrl(chainId);
    if (!indexerUrl) {
      setLoading(false);
      setError("No indexer configured for this network");
      fetchingRef.current = false;
      return;
    }

    const type = getIndexerType(chainId);
    const query = type === 'envio' ? ENVIO_DETAIL_QUERY : PONDER_DETAIL_QUERY;

    try {
      if (!hasDataRef.current) {
        setLoading(true);
      }
      const data = await gql<any>(indexerUrl, query, { id: auctionId });
      const result = extractDetail(data, type);

      if (result.auction) {
        setAuction({ ...result.auction, chainId });
        setBids(result.bids);
        setCheckpoints(result.checkpoints);
        setError(null);
        hasDataRef.current = true;
      } else if (!hasDataRef.current) {
        setError("Auction not found");
      }
    } catch (e: any) {
      if (!hasDataRef.current) {
        setError(e.message);
      }
      console.warn("Auction fetch failed, keeping existing data:", e.message);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [auctionId, chainId]);

  useEffect(() => {
    hasDataRef.current = false;
    setAuction(null);
    setBids([]);
    setCheckpoints([]);
    setError(null);
    setLoading(true);

    refetch();
    const interval = setInterval(refetch, 3000);
    return () => clearInterval(interval);
  }, [refetch]);

  return { auction, bids, checkpoints, loading, error, refetch };
}

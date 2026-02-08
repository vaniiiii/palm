import { useState, useEffect, useCallback, useRef } from "react";
import { useChainId } from "wagmi";
import { getChainConfig } from "../config/chains";

function getIndexerUrl(chainId: number | undefined): string | null {
  const config = getChainConfig(chainId);
  return config?.indexerUrl || null;
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

// ---- Types matching the indexer schema ----

export interface IndexedAuction {
  id: string;
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

// ---- Hooks ----

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

    try {
      setLoading(true);
      setError(null);
      const data = await gql<{ auctions: { items: IndexedAuction[] } }>(indexerUrl, `
        query {
          auctions(orderBy: "createdAt", orderDirection: "desc") {
            items {
              id
              token
              currency
              amount
              startBlock
              endBlock
              claimBlock
              totalSupply
              floorPrice
              tickSpacing
              validationHook
              createdAt
              lastClearingPriceQ96
              currencyRaised
              totalCleared
              numBids
              numBidders
              totalBidAmount
              cumulativeMps
            }
          }
        }
      `);
      setAuctions(data.auctions.items);
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

export function useAuctionDetail(auctionId: string | null) {
  const chainId = useChainId();
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

    try {
      if (!hasDataRef.current) {
        setLoading(true);
      }
      const data = await gql<{
        auction: IndexedAuction | null;
        bids: { items: IndexedBid[] };
        checkpoints: { items: IndexedCheckpoint[] };
      }>(
        indexerUrl,
        `
        query($id: String!) {
          auction(id: $id) {
            id
            token
            currency
            amount
            startBlock
            endBlock
            claimBlock
            totalSupply
            floorPrice
            tickSpacing
            validationHook
            createdAt
            lastClearingPriceQ96
            currencyRaised
            totalCleared
            numBids
            numBidders
            totalBidAmount
            cumulativeMps
          }
          bids(where: { auctionId: $id }, orderBy: "startBlock", orderDirection: "desc", limit: 50) {
            items {
              id
              auctionId
              amount
              maxPriceQ96
              owner
              startBlock
              tokensFilled
              amountFilled
              exited
              claimed
            }
          }
          checkpoints(where: { auctionId: $id }, orderBy: "blockNumber", orderDirection: "asc", limit: 100) {
            items {
              id
              auctionId
              blockNumber
              clearingPriceQ96
            }
          }
        }
      `,
        { id: auctionId },
      );

      if (data.auction) {
        setAuction(data.auction);
        setBids(data.bids?.items || []);
        setCheckpoints(data.checkpoints?.items || []);
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

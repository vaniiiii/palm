import { useState, useEffect, useCallback, useRef } from "react";

// Indexer URL - use env var for production, proxy path for dev
const INDEXER_URL = import.meta.env.VITE_INDEXER_URL
  ? `${import.meta.env.VITE_INDEXER_URL}/graphql`
  : "/indexer/graphql";

async function gql<T>(query: string, variables?: Record<string, unknown>, retries = 2): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(INDEXER_URL, {
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
        // Wait before retry (100ms, 200ms, etc.)
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
  const [auctions, setAuctions] = useState<IndexedAuction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await gql<{ auctions: { items: IndexedAuction[] } }>(`
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
  }, []);

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, 5000); // poll every 5s
    return () => clearInterval(interval);
  }, [refetch]);

  return { auctions, loading, error, refetch };
}

export function useAuctionDetail(auctionId: string | null) {
  const [auction, setAuction] = useState<IndexedAuction | null>(null);
  const [bids, setBids] = useState<IndexedBid[]>([]);
  const [checkpoints, setCheckpoints] = useState<IndexedCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use ref to track if we have data (avoids infinite loop in useCallback)
  const hasDataRef = useRef(false);
  // Track if a request is in-flight to prevent concurrent requests
  const fetchingRef = useRef(false);

  const refetch = useCallback(async () => {
    if (!auctionId) return;
    // Prevent concurrent requests (fixes ERR_INSUFFICIENT_RESOURCES)
    if (fetchingRef.current) {
      console.log("Skipping fetch - request already in-flight");
      return;
    }
    fetchingRef.current = true;

    try {
      // Only show loading spinner on initial load (when we have no data)
      if (!hasDataRef.current) {
        setLoading(true);
      }
      const data = await gql<{
        auction: IndexedAuction | null;
        bids: { items: IndexedBid[] };
        checkpoints: { items: IndexedCheckpoint[] };
      }>(
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

      // Only update if we got valid data
      if (data.auction) {
        setAuction(data.auction);
        setBids(data.bids?.items || []);
        setCheckpoints(data.checkpoints?.items || []);
        setError(null);
        hasDataRef.current = true;
      } else if (!hasDataRef.current) {
        // Only show error if we have no existing data to display
        setError("Auction not found");
      }
      // If we have existing data and fetch returns null, keep showing existing data
    } catch (e: any) {
      // Only show error if we have no existing data
      if (!hasDataRef.current) {
        setError(e.message);
      }
      // Otherwise silently fail and keep showing existing data
      console.warn("Auction fetch failed, keeping existing data:", e.message);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [auctionId]);

  useEffect(() => {
    // Reset state when auction ID changes
    hasDataRef.current = false;
    setAuction(null);
    setBids([]);
    setCheckpoints([]);
    setError(null);
    setLoading(true);

    refetch();
    // Poll more frequently (3s) for better responsiveness after bids
    const interval = setInterval(refetch, 3000);
    return () => clearInterval(interval);
  }, [refetch]);

  return { auction, bids, checkpoints, loading, error, refetch };
}

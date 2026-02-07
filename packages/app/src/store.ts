import { useState, useEffect, useCallback } from "react";

// Manual auctions saved in localStorage (for when indexer is not running)
export interface ManualAuction {
  address: string;
  name: string;
  addedAt: number;
}

const STORAGE_KEY = "palm-auctions";

function readManualAuctions(): ManualAuction[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeManualAuctions(auctions: ManualAuction[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auctions));
  window.dispatchEvent(new Event("palm-store"));
}

export function useManualAuctionStore() {
  const [auctions, setAuctions] = useState(readManualAuctions);

  useEffect(() => {
    const handler = () => setAuctions(readManualAuctions());
    window.addEventListener("palm-store", handler);
    return () => window.removeEventListener("palm-store", handler);
  }, []);

  const addAuction = useCallback((auction: ManualAuction) => {
    const current = readManualAuctions();
    if (current.some((a) => a.address.toLowerCase() === auction.address.toLowerCase())) return;
    writeManualAuctions([...current, auction]);
  }, []);

  const removeAuction = useCallback((address: string) => {
    const current = readManualAuctions();
    writeManualAuctions(current.filter((a) => a.address.toLowerCase() !== address.toLowerCase()));
  }, []);

  return { auctions, addAuction, removeAuction };
}

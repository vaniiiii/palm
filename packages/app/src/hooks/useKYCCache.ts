/**
 * Caches ZK proof hookData in localStorage to avoid re-generating proofs for every bid.
 * The proof is still verified on-chain with each bid.
 *
 * TODO: Replace with on-chain registration (PalmKYCRegistry with address-bound nullifiers).
 */

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "palm-kyc-cache";

export interface CachedKYC {
  address: string;
  provider: "echo" | "legion";
  hookData: string;
  nullifier: string;
  timestamp: number;
}

interface KYCCache {
  [address: string]: CachedKYC;
}

// Cache expires after 30 days
const CACHE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

function loadCache(): KYCCache {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveCache(cache: KYCCache) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn("Failed to save KYC cache:", e);
  }
}

export function useKYCCache(userAddress: string | undefined) {
  const [cached, setCached] = useState<CachedKYC | null>(null);

  // Load cache on mount / address change
  useEffect(() => {
    if (!userAddress) {
      setCached(null);
      return;
    }

    const cache = loadCache();
    const entry = cache[userAddress.toLowerCase()];

    if (entry) {
      // Check expiry
      if (Date.now() - entry.timestamp > CACHE_EXPIRY_MS) {
        // Expired, remove it
        delete cache[userAddress.toLowerCase()];
        saveCache(cache);
        setCached(null);
      } else {
        setCached(entry);
      }
    } else {
      setCached(null);
    }
  }, [userAddress]);

  // Save KYC proof to cache
  const saveKYC = useCallback(
    (provider: "echo" | "legion", hookData: string, nullifier: string) => {
      if (!userAddress) return;

      const entry: CachedKYC = {
        address: userAddress.toLowerCase(),
        provider,
        hookData,
        nullifier,
        timestamp: Date.now(),
      };

      const cache = loadCache();
      cache[userAddress.toLowerCase()] = entry;
      saveCache(cache);
      setCached(entry);
    },
    [userAddress]
  );

  // Clear cache for current user
  const clearKYC = useCallback(() => {
    if (!userAddress) return;

    const cache = loadCache();
    delete cache[userAddress.toLowerCase()];
    saveCache(cache);
    setCached(null);
  }, [userAddress]);

  return {
    cached,
    isVerified: !!cached,
    hookData: cached?.hookData ?? null,
    provider: cached?.provider ?? null,
    saveKYC,
    clearKYC,
  };
}

import { useState } from "react";

export type ProveResult = {
  proof: string[];
  publicSignals: string[];
  hookData: `0x${string}`;
};

type ProveStatus = "idle" | "uploading" | "proving" | "done" | "error";

// API URL - use env var for production, proxy path for dev
const PROVE_API_URL = import.meta.env.VITE_PROVE_API_URL || "/api/prove";

export function useProveKYC() {
  const [status, setStatus] = useState<ProveStatus>("idle");
  const [result, setResult] = useState<ProveResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prove = async (provider: string, emailEml: string, ethereumAddress: string) => {
    setStatus("uploading");
    setError(null);
    setResult(null);

    try {
      setStatus("proving");
      const res = await fetch(PROVE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, emailEml, ethereumAddress }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Server returned ${res.status}`);
      }

      const data: ProveResult = await res.json();
      setResult(data);
      setStatus("done");
      return data;
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
      setStatus("error");
      return null;
    }
  };

  const reset = () => {
    setStatus("idle");
    setResult(null);
    setError(null);
  };

  return { prove, status, result, error, reset };
}

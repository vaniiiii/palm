import { useState, useCallback } from "react";
import { useWalletClient, usePublicClient } from "wagmi";
import {
  getContractCallsQuote,
  getStatus,
  type ContractCallsQuoteRequest,
  type StatusResponse,
} from "@lifi/sdk";
import type { Address } from "viem";

const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";

export type CrossChainStatus =
  | "idle"
  | "quoting"
  | "awaiting-approval"
  | "bridging"
  | "done"
  | "failed";

interface CrossChainBidParams {
  sourceChainId: number;
  destChainId: number;
  amount: bigint;
  fromAddress: Address;
  destContractAddress: Address;
  destCalldata: `0x${string}`;
  // For future USDC support, override these:
  fromToken?: string;
  toToken?: string;
}

export function useCrossChainBid() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [status, setStatus] = useState<CrossChainStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const execute = useCallback(
    async (params: CrossChainBidParams) => {
      if (!walletClient || !publicClient) {
        setError("Wallet not connected");
        return;
      }

      setStatus("quoting");
      setError(null);
      setTxHash(null);

      try {
        const fromToken = params.fromToken ?? NATIVE_TOKEN;
        const toToken = params.toToken ?? NATIVE_TOKEN;

        const quoteRequest: ContractCallsQuoteRequest = {
          fromChain: params.sourceChainId,
          fromToken,
          fromAddress: params.fromAddress,
          toChain: params.destChainId,
          toToken,
          toAmount: params.amount.toString(),
          contractCalls: [
            {
              fromAmount: params.amount.toString(),
              fromTokenAddress: toToken,
              toContractAddress: params.destContractAddress,
              toContractCallData: params.destCalldata,
              toContractGasLimit: "300000",
            },
          ],
        };

        const quote = await getContractCallsQuote(quoteRequest);

        if (!quote.transactionRequest) {
          throw new Error("No transaction request in quote");
        }

        setStatus("awaiting-approval");

        const hash = await walletClient.sendTransaction({
          to: quote.transactionRequest.to as Address,
          data: quote.transactionRequest.data as `0x${string}`,
          value: quote.transactionRequest.value
            ? BigInt(quote.transactionRequest.value)
            : undefined,
          gas: quote.transactionRequest.gasLimit
            ? BigInt(quote.transactionRequest.gasLimit as string)
            : undefined,
          chain: walletClient.chain,
          account: walletClient.account!,
        });

        setTxHash(hash);
        setStatus("bridging");

        await publicClient.waitForTransactionReceipt({ hash });

        // Poll for cross-chain completion
        let result: StatusResponse;
        do {
          await new Promise((r) => setTimeout(r, 5000));
          result = await getStatus({
            txHash: hash,
            bridge: quote.tool,
            fromChain: quote.action.fromChainId,
            toChain: quote.action.toChainId,
          });
        } while (result.status !== "DONE" && result.status !== "FAILED");

        if (result.status === "FAILED") {
          throw new Error("Bridge transfer failed");
        }

        setStatus("done");
      } catch (e: any) {
        const msg = e?.message || "Unknown error";
        if (msg.includes("User rejected") || msg.includes("user rejected")) {
          setError("Transaction cancelled");
        } else {
          setError(msg.length > 150 ? msg.slice(0, 150) + "..." : msg);
        }
        setStatus("failed");
      }
    },
    [walletClient, publicClient]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setTxHash(null);
  }, []);

  return { status, error, txHash, execute, reset };
}

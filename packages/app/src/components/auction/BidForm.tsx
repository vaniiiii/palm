import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useBalance, usePublicClient, useChainId } from "wagmi";
import { parseEther, formatEther, decodeErrorResult, encodeFunctionData, type Address, type Abi } from "viem";
import { useToast } from "../Toast";
import { isLocalNetwork } from "../../wagmi";
import { fromQ96, toQ96Aligned } from "../../utils/formatting";
import { getProviderName } from "../../utils/auction";
import { getChainName } from "../../config/chains";
import { useCrossChainBid, type CrossChainStatus } from "../../hooks/useCrossChainBid";

// CCA ABI for submitBid
const CCA_ABI = [
  {
    name: "submitBid",
    type: "function",
    inputs: [
      { name: "maxPrice", type: "uint256" },
      { name: "amount", type: "uint128" },
      { name: "owner", type: "address" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

// Palm hook + CCA error ABIs for proper decoding
const ERROR_ABI: Abi = [
  // CCA wrapper error
  { type: "error", name: "ValidationHookCallFailed", inputs: [{ name: "reason", type: "bytes" }] },
  // Palm hook errors
  { type: "error", name: "PalmValidationHook__InvalidProof", inputs: [] },
  { type: "error", name: "PalmValidationHook__PubkeyHashNotAllowed", inputs: [{ name: "pubkeyHash", type: "uint256" }] },
  { type: "error", name: "PalmValidationHook__NullifierClaimedByAnother", inputs: [{ name: "nullifier", type: "uint256" }, { name: "claimedBy", type: "address" }] },
  { type: "error", name: "PalmValidationHook__MaxPurchaseLimitExceeded", inputs: [{ name: "total", type: "uint256" }, { name: "limit", type: "uint256" }] },
  { type: "error", name: "PalmValidationHook__ProviderNotEnabled", inputs: [{ name: "provider", type: "uint8" }] },
  { type: "error", name: "PalmValidationHook__UnknownProvider", inputs: [{ name: "provider", type: "uint8" }] },
  { type: "error", name: "PalmValidationHook__AddressMismatch", inputs: [{ name: "expected", type: "address" }, { name: "got", type: "address" }] },
  { type: "error", name: "PalmValidationHook__NotAuction", inputs: [] },
  { type: "error", name: "PalmValidationHook__OwnerMustBeSender", inputs: [] },
];

// Decode contract errors with their parameters
function decodeContractError(error: any): string | null {
  try {
    // Try to get the raw error data from various locations in viem error structure
    let rawData = error?.cause?.cause?.data?.data
      || error?.cause?.data?.data
      || error?.data?.data
      || error?.cause?.cause?.raw
      || error?.cause?.raw
      || error?.raw
      || error?.cause?.cause?.data
      || error?.cause?.data
      || error?.data;

    // Fallback: extract hex data from error message (viem includes it in the message)
    if (!rawData || typeof rawData !== "string" || !rawData.startsWith("0x")) {
      const msg = error?.message || error?.cause?.message || "";
      const hexMatch = msg.match(/0x[0-9a-fA-F]{8,}/);
      if (hexMatch) {
        rawData = hexMatch[0];
      }
    }

    if (!rawData || typeof rawData !== "string" || !rawData.startsWith("0x")) {
      return null;
    }

    // Try to decode with our error ABI
    const decoded = decodeErrorResult({ abi: ERROR_ABI, data: rawData as `0x${string}` });

    // Format error message based on error name and args
    switch (decoded.errorName) {
      case "ValidationHookCallFailed": {
        // This wraps another error - try to decode the inner bytes
        const innerData = decoded.args?.[0] as `0x${string}`;
        if (innerData && innerData.length > 10) {
          try {
            const innerDecoded = decodeErrorResult({ abi: ERROR_ABI, data: innerData });
            return formatPalmError(innerDecoded.errorName, innerDecoded.args);
          } catch {
            return "KYC validation failed";
          }
        }
        return "KYC validation failed";
      }
      default:
        return formatPalmError(decoded.errorName, decoded.args);
    }
  } catch {
    return null;
  }
}

// Format Palm hook errors with their parameters
function formatPalmError(errorName: string, args: readonly unknown[] | undefined): string {
  switch (errorName) {
    case "PalmValidationHook__InvalidProof":
      return "KYC proof verification failed - try regenerating your proof";
    case "PalmValidationHook__PubkeyHashNotAllowed":
      return "Email provider not configured for this auction";
    case "PalmValidationHook__NullifierClaimedByAnother": {
      const addr = args?.[1] as string;
      return `This KYC email is already linked to ${addr?.slice(0, 6)}...${addr?.slice(-4)}`;
    }
    case "PalmValidationHook__MaxPurchaseLimitExceeded": {
      const total = args?.[0] as bigint;
      const limit = args?.[1] as bigint;
      return `Purchase limit exceeded: ${formatEther(total)} ETH total, max ${formatEther(limit)} ETH`;
    }
    case "PalmValidationHook__ProviderNotEnabled": {
      const provider = args?.[0] as number;
      return `KYC provider "${getProviderName(provider)}" is not enabled for this auction`;
    }
    case "PalmValidationHook__UnknownProvider": {
      const provider = args?.[0] as number;
      return `Unknown KYC provider: ${provider}`;
    }
    case "PalmValidationHook__AddressMismatch": {
      return "Wallet address doesn't match the address in your KYC proof";
    }
    case "PalmValidationHook__NotAuction":
      return "Invalid caller - not the auction contract";
    case "PalmValidationHook__OwnerMustBeSender":
      return "You must bid for yourself with KYC";
    default:
      return `Contract error: ${errorName}`;
  }
}

interface BidFormProps {
  auctionAddress: Address;
  auctionChainId: number;
  floorPrice: string;
  clearingPrice: string;
  tickSpacing: string;
  endBlock: number;
  currentBlock?: number;
  hookData?: string;
  onSuccess?: () => void;
  compact?: boolean;
  requiresKYC?: boolean;
  isKYCVerified?: boolean;
  onKYCClick?: () => void;
}

export function BidForm({
  auctionAddress,
  auctionChainId,
  floorPrice,
  clearingPrice,
  tickSpacing,
  endBlock,
  currentBlock,
  hookData = "0x",
  onSuccess,
  compact = false,
  requiresKYC = false,
  isKYCVerified = false,
  onKYCClick,
}: BidFormProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: balance, refetch: refetchBalance } = useBalance({ address });
  const { showToast } = useToast();
  const showFaucet = isLocalNetwork(chainId);

  const isCrossChain = chainId !== auctionChainId && !isLocalNetwork(auctionChainId);
  const crossChain = useCrossChainBid();

  // Form state
  const [budgetInput, setBudgetInput] = useState("");
  const [maxPriceInput, setMaxPriceInput] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isFauceting, setIsFauceting] = useState(false);

  // Faucet function (Anvil only)
  const handleFaucet = useCallback(async () => {
    if (!address || !publicClient) return;
    setIsFauceting(true);
    try {
      // Use Anvil's special RPC method to set balance
      await publicClient.request({
        // @ts-ignore - anvil_setBalance is not in the standard RPC types
        method: "anvil_setBalance",
        params: [address, "0x56BC75E2D63100000"], // 100 ETH in hex
      });
      await refetchBalance();
    } catch (e) {
      console.error("Faucet error:", e);
    } finally {
      setIsFauceting(false);
    }
  }, [address, publicClient, refetchBalance]);

  // Parse values
  const budget = budgetInput ? parseFloat(budgetInput) : 0;
  const maxPrice = maxPriceInput ? parseFloat(maxPriceInput) : 0;

  // Derived values
  const floorPriceNum = fromQ96(floorPrice);
  const clearingPriceNum = fromQ96(clearingPrice);
  const tickSpacingNum = fromQ96(tickSpacing);

  // Contract write
  const { data: hash, writeContract, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, error: txError } = useWaitForTransactionReceipt({
    hash,
  });

  // Log hash when we get one
  useEffect(() => {
    if (hash) {
      console.log("=== Transaction Hash ===", hash);
    }
  }, [hash]);

  // Track previous error/success state to show toast only once
  const prevWriteErrorRef = useRef<Error | null>(null);
  const prevTxErrorRef = useRef<Error | null>(null);
  const prevSuccessRef = useRef(false);

  // Handle write errors (user rejection, estimation failure, etc.)
  useEffect(() => {
    if (writeError && writeError !== prevWriteErrorRef.current) {
      prevWriteErrorRef.current = writeError;

      // Debug logging
      console.error("=== Write Error Debug ===");
      console.error("Error:", writeError);
      console.error("Message:", writeError.message);
      console.error("Cause:", (writeError as any).cause);
      console.error("Details:", (writeError as any).details);
      console.error("Full error:", JSON.stringify(writeError, Object.getOwnPropertyNames(writeError), 2));

      // Extract user-friendly message
      const msg = writeError.message;
      if (msg.includes("User rejected") || msg.includes("user rejected")) {
        showToast("info", "Transaction cancelled");
      } else if (msg.includes("insufficient funds")) {
        showToast("error", "Insufficient ETH balance");
      } else if (msg.includes("nonce too high") || msg.includes("nonce too low") || msg.includes("NonceTooHigh") || msg.includes("NonceTooLow")) {
        showToast("error", "Nonce mismatch - try resetting wallet or refreshing");
        console.error("NONCE ERROR - Reset MetaMask: Settings > Advanced > Clear activity tab data");
      } else {
        // Show actual error - don't hide it
        const shortMsg = msg.length > 150 ? msg.slice(0, 150) + "..." : msg;
        showToast("error", shortMsg);
        console.error("ACTUAL ERROR:", msg);
      }
    }
  }, [writeError, showToast]);

  // Handle transaction errors (reverts after submission)
  useEffect(() => {
    if (txError && txError !== prevTxErrorRef.current) {
      prevTxErrorRef.current = txError;
      showToast("error", "Transaction failed: " + txError.message.slice(0, 80));
    }
  }, [txError, showToast]);

  // Handle cross-chain status
  const prevCrossChainStatusRef = useRef<CrossChainStatus>("idle");
  useEffect(() => {
    if (crossChain.status === prevCrossChainStatusRef.current) return;
    prevCrossChainStatusRef.current = crossChain.status;

    switch (crossChain.status) {
      case "awaiting-approval":
        showToast("info", "Confirm transaction in wallet...");
        break;
      case "bridging":
        showToast("info", `Bridging to ${getChainName(auctionChainId)}...`);
        break;
      case "done":
        showToast("success", "Cross-chain bid submitted!");
        refetchBalance();
        onSuccess?.();
        break;
      case "failed":
        if (crossChain.error) showToast("error", crossChain.error);
        break;
    }
  }, [crossChain.status, crossChain.error, auctionChainId, showToast, refetchBalance, onSuccess]);

  // Handle success - refetch balance and show toast
  useEffect(() => {
    if (isSuccess && !prevSuccessRef.current) {
      prevSuccessRef.current = true;
      showToast("success", "Bid submitted successfully!");
      refetchBalance();
      onSuccess?.();
    }
    // Reset when hash changes (new transaction)
    if (!isSuccess) {
      prevSuccessRef.current = false;
    }
  }, [isSuccess, showToast, refetchBalance, onSuccess]);

  // Preset buttons for max price (must be ABOVE clearing price)
  // Use floor + tick as minimum since bids must be > clearing price
  const basePrice = clearingPriceNum > 0 ? clearingPriceNum : floorPriceNum;
  const tickStep = tickSpacingNum > 0 ? tickSpacingNum : floorPriceNum * 0.1;
  const maxPricePresets = [
    { label: "Min", value: basePrice + tickStep }, // Floor + 1 tick (minimum valid)
    { label: "+10%", value: basePrice * 1.1 + tickStep },
    { label: "+50%", value: basePrice * 1.5 },
    { label: "2x", value: basePrice * 2 },
  ];

  // Preset buttons for budget
  const budgetPresets = [
    { label: "0.1 ETH", value: 0.1 },
    { label: "0.5 ETH", value: 0.5 },
    { label: "1 ETH", value: 1 },
    { label: "5 ETH", value: 5 },
  ];

  const [isSimulating, setIsSimulating] = useState(false);

  const buildBidArgs = useCallback(() => {
    const tickSpacingQ96 = BigInt(tickSpacing || "0");
    const floorPriceQ96 = BigInt(floorPrice || "0");
    const clearingPriceQ96 = BigInt(clearingPrice || "0");

    let maxPriceQ96 = toQ96Aligned({ value: maxPrice, tickSpacing: tickSpacingQ96 });
    const minPrice = (clearingPriceQ96 > floorPriceQ96 ? clearingPriceQ96 : floorPriceQ96) + tickSpacingQ96;
    if (maxPriceQ96 < minPrice) maxPriceQ96 = minPrice;

    const amountWei = parseEther(budget.toString());
    return { maxPriceQ96, amountWei };
  }, [budget, maxPrice, floorPrice, clearingPrice, tickSpacing]);

  const handleSubmit = useCallback(async () => {
    if (!budget || !maxPrice || !isConnected || !address) return;

    const { maxPriceQ96, amountWei } = buildBidArgs();

    if (isCrossChain) {
      const calldata = encodeFunctionData({
        abi: CCA_ABI,
        functionName: "submitBid",
        args: [maxPriceQ96, amountWei, address, hookData as `0x${string}`],
      });

      showToast("info", `Getting cross-chain route from ${getChainName(chainId)}...`);
      await crossChain.execute({
        sourceChainId: chainId,
        destChainId: auctionChainId,
        amount: amountWei,
        fromAddress: address,
        destContractAddress: auctionAddress,
        destCalldata: calldata,
      });
      return;
    }

    if (!publicClient) return;

    console.log("=== Submitting Bid ===");
    console.log("Auction:", auctionAddress);
    console.log("Max Price (Q96 aligned):", maxPriceQ96.toString());
    console.log("Amount (ETH):", budget);

    setIsSimulating(true);
    showToast("info", "Simulating transaction...");
    try {
      await publicClient.simulateContract({
        address: auctionAddress,
        abi: CCA_ABI,
        functionName: "submitBid",
        args: [maxPriceQ96, amountWei, address, hookData as `0x${string}`],
        value: amountWei,
        account: address,
      });
      showToast("success", "Simulation passed, sending transaction...");
    } catch (simError: any) {
      console.error("Simulation failed:", simError);
      setIsSimulating(false);

      const userMessage = decodeContractError(simError)
        || ((simError?.message || "").toLowerCase().includes("insufficient") ? "Insufficient ETH balance" : null)
        || ((simError?.message || "").toLowerCase().includes("user rejected") ? "Transaction rejected" : null);

      if (userMessage) {
        showToast("error", `Simulation failed: ${userMessage}`);
      } else {
        showToast("error", "Simulation failed - check console for details");
      }
      return;
    }
    setIsSimulating(false);

    writeContract({
      address: auctionAddress,
      abi: CCA_ABI,
      functionName: "submitBid",
      args: [maxPriceQ96, amountWei, address, hookData as `0x${string}`],
      value: amountWei,
    });
  }, [budget, maxPrice, isConnected, address, auctionAddress, auctionChainId, chainId, isCrossChain, floorPrice, clearingPrice, tickSpacing, hookData, writeContract, publicClient, showToast, buildBidArgs, crossChain]);

  // Calculate blocks remaining
  // If endBlock is 0, we don't have the data yet, so don't show as ended
  const blocksRemaining = currentBlock && endBlock > 0 ? endBlock - currentBlock : null;
  const isAuctionEnded = blocksRemaining !== null && blocksRemaining <= 0;

  // Validation
  const isBelowFloor = maxPrice > 0 && maxPrice < floorPriceNum;
  // WORKAROUND: KYC verification uses localStorage cache (see useKYCCache.ts)
  // TODO: Replace with on-chain registration check
  const needsKYC = requiresKYC && !isKYCVerified;
  const isAnvilAuction = isLocalNetwork(auctionChainId);
  const cantBidCrossChain = isCrossChain && isAnvilAuction;
  const isCrossChainBusy = crossChain.status !== "idle" && crossChain.status !== "done" && crossChain.status !== "failed";
  const isValidBid = budget > 0 && maxPrice >= floorPriceNum && isConnected && !needsKYC && !cantBidCrossChain;

  // Format price for display
  const formatPriceDisplay = (price: number): string => {
    if (price === 0) return "—";
    if (price < 0.000001) return price.toFixed(9);
    if (price < 0.00001) return price.toFixed(8);
    if (price < 0.0001) return price.toFixed(7);
    if (price < 0.001) return price.toFixed(6);
    if (price < 0.01) return price.toFixed(5);
    if (price < 1) return price.toFixed(4);
    if (price < 1000) return price.toFixed(2);
    return `${(price / 1000).toFixed(1)}K`;
  };

  const wrapperClass = compact ? "" : "bg-palm-bg-secondary border border-palm-border/30 p-6";

  return (
    <div className={wrapperClass}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-palm-text-3 text-[10px] uppercase tracking-widest">
          Place Bid
        </h3>
        {blocksRemaining !== null && (
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 ${
                isAuctionEnded ? "bg-palm-pink" : "bg-palm-green pulse-glow"
              }`}
            />
            <span className="text-palm-text-3 text-[10px] font-mono">
              {isAuctionEnded
                ? "Ended"
                : `${blocksRemaining.toLocaleString()} left`}
            </span>
          </div>
        )}
      </div>

      {isAuctionEnded ? (
        <div className="text-center py-8">
          <div className="text-palm-text-3 text-2xl mb-3">&#9632;</div>
          <p className="text-palm-text-2 text-sm">Auction has ended</p>
          <p className="text-palm-text-3 text-xs mt-2">
            Claim your tokens when the claim period begins
          </p>
        </div>
      ) : needsKYC ? (
        <div className="text-center py-8">
          <div className="text-palm-cyan text-2xl mb-3">&#9919;</div>
          <p className="text-palm-text-2 text-sm mb-2">KYC Verification Required</p>
          <p className="text-palm-text-3 text-xs mb-4">
            This auction requires identity verification to participate
          </p>
          {onKYCClick && (
            <button
              onClick={onKYCClick}
              className="px-6 py-2 bg-palm-cyan text-palm-bg text-xs font-bold uppercase tracking-wider hover:bg-palm-cyan/90 transition-colors"
            >
              Complete KYC
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Cross-chain banner */}
          {isCrossChain && !cantBidCrossChain && (
            <div className="mb-3 px-3 py-2 border border-palm-cyan/30 bg-palm-cyan/5 text-[10px] text-palm-cyan uppercase tracking-wider">
              {getChainName(chainId)} &rarr; {getChainName(auctionChainId)} via LI.FI
            </div>
          )}
          {cantBidCrossChain && (
            <div className="mb-3 px-3 py-2 border border-palm-pink/30 bg-palm-pink/5 text-[10px] text-palm-pink">
              Switch to Anvil to bid on local auctions
            </div>
          )}

          {/* Balance + Faucet (faucet only on local networks) */}
          {isConnected && (
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-palm-border/30">
              <div className="flex items-center gap-2">
                <span className="text-palm-text-3 text-[10px] uppercase">Bal:</span>
                <span className="text-palm-text font-mono text-sm">
                  {balance ? parseFloat(balance.formatted).toFixed(4) : "0"} ETH
                </span>
              </div>
              {showFaucet && (
                <button
                  onClick={handleFaucet}
                  disabled={isFauceting}
                  className="px-2 py-1 text-[10px] font-medium uppercase border border-palm-green/50 text-palm-green hover:bg-palm-green/10 transition-colors disabled:opacity-50"
                >
                  {isFauceting ? "..." : "+ ETH"}
                </button>
              )}
            </div>
          )}

          {/* Budget input */}
          <div className="mb-3">
            <label className="text-palm-text-3 text-[10px] uppercase tracking-widest block mb-1">
              Budget (ETH)
            </label>
            <input
              type="number"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              placeholder="0.0"
              step="0.01"
              min="0"
              className="w-full bg-black border border-palm-border px-3 py-2 text-palm-text font-mono focus:border-palm-cyan transition-colors"
            />
            <div className="flex gap-1 mt-1">
              {budgetPresets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setBudgetInput(preset.value.toString())}
                  className="flex-1 py-1 text-[10px] text-palm-text-3 bg-black border border-palm-border hover:border-palm-cyan hover:text-palm-cyan transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Max price input */}
          <div className="mb-3">
            <label className="text-palm-text-3 text-[10px] uppercase tracking-widest block mb-1">
              Max Price
            </label>
            <input
              type="number"
              value={maxPriceInput}
              onChange={(e) => setMaxPriceInput(e.target.value)}
              placeholder={`Min: ${formatPriceDisplay(floorPriceNum)}`}
              step="0.0001"
              min="0"
              className={`w-full bg-black border px-3 py-2 text-palm-text font-mono transition-colors ${
                isBelowFloor
                  ? "border-palm-pink focus:border-palm-pink"
                  : "border-palm-border focus:border-palm-cyan"
              }`}
            />
            {isBelowFloor && (
              <p className="text-palm-pink text-[10px] mt-1">
                Min: {formatPriceDisplay(floorPriceNum)}
              </p>
            )}
            <div className="flex gap-1 mt-1">
              {maxPricePresets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setMaxPriceInput(preset.value.toFixed(6))}
                  className="flex-1 py-1 text-[10px] text-palm-text-3 bg-black border border-palm-border hover:border-palm-cyan hover:text-palm-cyan transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-palm-text-3 text-[10px] uppercase mb-3 hover:text-palm-text transition-colors"
          >
            {showAdvanced ? "- Hide" : "+ Show"} hookData
          </button>

          {showAdvanced && (
            <div className="mb-3">
              <div className="bg-black border border-palm-border p-2 font-mono text-[9px] text-palm-text-2 break-all max-h-16 overflow-y-auto">
                {hookData || "0x (no proof)"}
              </div>
            </div>
          )}

          {/* Submit button */}
          {!isConnected ? (
            <div className="text-center py-3">
              <p className="text-palm-text-3 text-xs">Connect wallet to bid</p>
            </div>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!isValidBid || isPending || isConfirming || isSimulating || isCrossChainBusy}
              className="w-full py-2.5 bg-palm-cyan text-palm-bg text-xs font-bold uppercase tracking-wider hover:bg-palm-cyan/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isCrossChainBusy ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 bg-palm-bg animate-pulse" />
                  {crossChainStatusLabel(crossChain.status, auctionChainId)}
                </span>
              ) : isSimulating ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 bg-palm-bg animate-pulse" />
                  Simulating...
                </span>
              ) : isPending || isConfirming ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 bg-palm-bg animate-pulse" />
                  {isPending ? "Confirm..." : "Submitting..."}
                </span>
              ) : isCrossChain ? (
                `Bid from ${getChainName(chainId)}`
              ) : (
                "Submit Bid"
              )}
            </button>
          )}

        </>
      )}
    </div>
  );
}

function crossChainStatusLabel(status: CrossChainStatus, destChainId: number): string {
  switch (status) {
    case "quoting": return "Getting route...";
    case "awaiting-approval": return "Confirm in wallet...";
    case "bridging": return `Bridging to ${getChainName(destChainId)}...`;
    default: return "Processing...";
  }
}

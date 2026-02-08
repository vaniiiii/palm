import { useState, useMemo, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseUnits, encodeAbiParameters, type Address } from "viem";
import { toQ96, toQ96Aligned } from "../utils/formatting";

// Factory ABI (minimal)
const FACTORY_ABI = [
  {
    name: "initializeDistribution",
    type: "function",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "configData", type: "bytes" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "distributionContract", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    name: "getAuctionAddress",
    type: "function",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "configData", type: "bytes" },
      { name: "salt", type: "bytes32" },
      { name: "sender", type: "address" },
    ],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;

// ERC20 ABI (minimal)
const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "symbol",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    name: "decimals",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    name: "mint",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

interface LaunchAuctionPageProps {
  onBack: () => void;
  onSuccess?: (auctionAddress: string) => void;
}

type Step = "config" | "approve" | "deploy" | "success";

export default function LaunchAuctionPage({ onBack, onSuccess }: LaunchAuctionPageProps) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  // Form state
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [floorPrice, setFloorPrice] = useState("0.001");
  const [tickSpacing, setTickSpacing] = useState("0.0001");
  const [durationBlocks, setDurationBlocks] = useState("10000");
  const [enableKYC, setEnableKYC] = useState(true);
  const [kycProvider, setKycProvider] = useState<"echo" | "legion" | "both">("both");

  // Token info
  const [tokenSymbol, setTokenSymbol] = useState<string | null>(null);
  const [tokenDecimals, setTokenDecimals] = useState<number>(18);
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);

  // Step tracking
  const [currentStep, setCurrentStep] = useState<Step>("config");
  const [deployedAuction, setDeployedAuction] = useState<string | null>(null);

  // Contract writes
  const { writeContract: writeApprove, data: approveHash, isPending: isApproving } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const { writeContract: writeDeploy, data: deployHash, isPending: isDeploying, error: deployError } = useWriteContract();
  const { isLoading: isDeployConfirming, isSuccess: isDeploySuccess } = useWaitForTransactionReceipt({
    hash: deployHash,
  });

  const { writeContract: writeMint, data: mintHash, isPending: isMinting } = useWriteContract();
  const { isLoading: isMintConfirming, isSuccess: isMintSuccess } = useWaitForTransactionReceipt({
    hash: mintHash,
  });

  useEffect(() => {
    if (isMintSuccess) fetchTokenInfo();
  }, [isMintSuccess]);

  // Factory address from env
  const factoryAddress = import.meta.env.VITE_FACTORY_ADDRESS as Address | undefined;

  // Fetch token info when address changes
  const fetchTokenInfo = async () => {
    if (!tokenAddress || !publicClient || !address) return;

    try {
      const [symbol, decimals, balance] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress as Address,
          abi: ERC20_ABI,
          functionName: "symbol",
        }),
        publicClient.readContract({
          address: tokenAddress as Address,
          abi: ERC20_ABI,
          functionName: "decimals",
        }),
        publicClient.readContract({
          address: tokenAddress as Address,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [address],
        }),
      ]);
      setTokenSymbol(symbol);
      setTokenDecimals(decimals);
      setTokenBalance(balance);
    } catch (e) {
      setTokenSymbol(null);
      setTokenBalance(null);
    }
  };

  // Calculate auction parameters
  const auctionParams = useMemo(() => {
    if (!tokenAmount || !floorPrice || !durationBlocks) return null;

    const amount = parseUnits(tokenAmount, tokenDecimals);
    const tickSpacingQ96 = toQ96(parseFloat(tickSpacing));
    const floorPriceQ96 = toQ96Aligned({ value: parseFloat(floorPrice), tickSpacing: tickSpacingQ96 });
    const duration = parseInt(durationBlocks);

    // MPS calculation: total 10,000,000 over duration
    const mpsPerBlock = Math.floor(10_000_000 / duration);

    return {
      amount,
      floorPriceQ96,
      tickSpacingQ96,
      duration,
      mpsPerBlock,
    };
  }, [tokenAmount, floorPrice, tickSpacing, durationBlocks, tokenDecimals]);

  // Encode step data: uint24 mps + uint40 blockDelta
  const encodeStepData = (mps: number, blocks: number): `0x${string}` => {
    // Pack: 3 bytes for mps, 5 bytes for blocks
    const mpsHex = mps.toString(16).padStart(6, "0");
    const blocksHex = blocks.toString(16).padStart(10, "0");
    return `0x${mpsHex}${blocksHex}` as `0x${string}`;
  };

  const handleMint = () => {
    if (!tokenAddress || !address) return;
    const mintAmount = parseUnits("1000000", tokenDecimals);
    writeMint({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: "mint",
      args: [address, mintAmount],
    });
  };

  // Handle approval
  const handleApprove = () => {
    if (!factoryAddress || !auctionParams) return;

    writeApprove({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [factoryAddress, auctionParams.amount],
    });
  };

  // Handle deploy
  const handleDeploy = async () => {
    if (!factoryAddress || !auctionParams || !address || !publicClient) return;

    // Get current block
    const currentBlock = await publicClient.getBlockNumber();
    const startBlock = currentBlock + 5n;
    const endBlock = startBlock + BigInt(auctionParams.duration);
    const claimBlock = endBlock + 100n;

    // Encode config data
    // For now, deploy WITHOUT validation hook (address(0))
    // Users can deploy their own hook separately or we can add hook deployment
    const configData = encodeAbiParameters(
      [
        { name: "currency", type: "address" },
        { name: "tokensRecipient", type: "address" },
        { name: "fundsRecipient", type: "address" },
        { name: "startBlock", type: "uint64" },
        { name: "endBlock", type: "uint64" },
        { name: "claimBlock", type: "uint64" },
        { name: "tickSpacing", type: "uint256" },
        { name: "validationHook", type: "address" },
        { name: "floorPrice", type: "uint256" },
        { name: "requiredCurrencyRaised", type: "uint128" },
        { name: "auctionStepsData", type: "bytes" },
      ],
      [
        "0x0000000000000000000000000000000000000000" as Address, // ETH
        address,
        address,
        startBlock,
        endBlock,
        claimBlock,
        auctionParams.tickSpacingQ96,
        "0x0000000000000000000000000000000000000000" as Address, // No hook for now
        auctionParams.floorPriceQ96,
        0n,
        encodeStepData(auctionParams.mpsPerBlock, auctionParams.duration),
      ]
    );

    // Generate unique salt
    const salt = `0x${Date.now().toString(16).padStart(64, "0")}` as `0x${string}`;

    writeDeploy({
      address: factoryAddress,
      abi: FACTORY_ABI,
      functionName: "initializeDistribution",
      args: [tokenAddress as Address, auctionParams.amount, configData, salt],
    });
  };

  // Track step transitions
  useEffect(() => {
    if (isApproveSuccess && currentStep === "approve") {
      setCurrentStep("deploy");
    }
  }, [isApproveSuccess, currentStep]);

  useEffect(() => {
    if (isDeploySuccess && currentStep === "deploy" && deployHash) {
      // In a real app, we'd get the auction address from the transaction receipt
      setCurrentStep("success");
    }
  }, [isDeploySuccess, currentStep, deployHash]);

  const isValidConfig = tokenAddress && tokenAmount && auctionParams && tokenBalance && tokenBalance >= auctionParams.amount;

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        className="text-palm-text-3 text-xs hover:text-palm-cyan transition-colors mb-6 flex items-center gap-2"
      >
        <span className="font-mono">&larr;</span>
        <span className="uppercase tracking-wider">Back to Auctions</span>
      </button>

      {/* Header */}
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[clamp(20px,3vw,28px)] font-bold text-palm-text uppercase tracking-wide">
          Launch Auction
        </h2>
        <span className="text-palm-text-3 text-xs uppercase tracking-widest">
          Uniswap CCA
        </span>
      </div>
      <p className="text-palm-text-3 text-sm mb-6 max-w-[500px]">
        Deploy a new Continuous Clearing Auction for your token. Choose your price
        parameters and optionally enable KYC verification.
      </p>
      <div className="hr-glow w-full mb-8" />

      {!isConnected ? (
        <div className="clip-corner-both bg-black p-12 text-center">
          <div className="text-palm-text-3 text-3xl mb-4">&#9919;</div>
          <p className="text-palm-text-2 text-sm">Connect your wallet to launch an auction</p>
        </div>
      ) : !factoryAddress ? (
        <div className="clip-corner-both bg-black p-12 text-center">
          <div className="text-palm-pink text-3xl mb-4">&#9888;</div>
          <p className="text-palm-text-2 text-sm">Factory address not configured</p>
          <p className="text-palm-text-3 text-xs mt-2">
            Set VITE_FACTORY_ADDRESS in your environment
          </p>
        </div>
      ) : currentStep === "success" ? (
        <div className="clip-corner-both bg-black p-12 text-center">
          <div className="text-palm-green text-4xl mb-4">&#10003;</div>
          <h3 className="text-palm-text text-lg font-semibold mb-2">Auction Launched!</h3>
          <p className="text-palm-text-3 text-sm mb-6">
            Your auction has been deployed successfully.
          </p>
          <button
            onClick={onBack}
            className="px-6 py-2 bg-palm-cyan text-palm-bg text-xs font-bold uppercase tracking-wider hover:bg-palm-cyan/90 transition-colors"
          >
            View Auctions
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Configuration */}
          <div className="clip-corner-both bg-black p-6 border border-palm-border/30">
            <h3 className="text-sm font-bold uppercase tracking-widest text-palm-text mb-6">
              Auction Configuration
            </h3>

            {/* Token address */}
            <div className="mb-5">
              <label className="text-palm-text-3 text-[10px] uppercase tracking-widest block mb-2">
                Token Contract Address
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tokenAddress}
                  onChange={(e) => setTokenAddress(e.target.value)}
                  placeholder="0x..."
                  className="flex-1 bg-palm-bg-secondary border border-palm-border px-4 py-3 text-palm-text font-mono text-sm"
                />
                <button
                  onClick={fetchTokenInfo}
                  className="px-4 py-3 bg-palm-bg-secondary border border-palm-border text-palm-text-3 text-xs hover:border-palm-cyan hover:text-palm-cyan transition-colors"
                >
                  Load
                </button>
              </div>
              {tokenSymbol && (
                <div className="flex items-center gap-3 mt-2 text-xs">
                  <span className="text-palm-green">{tokenSymbol}</span>
                  <span className="text-palm-text-3">
                    Balance: {tokenBalance ? (Number(tokenBalance) / 10 ** tokenDecimals).toLocaleString() : "0"}
                  </span>
                  <button
                    onClick={handleMint}
                    disabled={isMinting || isMintConfirming}
                    className="px-2 py-1 text-[10px] bg-palm-bg border border-palm-border text-palm-cyan hover:bg-palm-bg-secondary transition-colors disabled:opacity-50"
                  >
                    {isMinting || isMintConfirming ? "Minting..." : "Mint 1M"}
                  </button>
                </div>
              )}
            </div>

            {/* Token amount */}
            <div className="mb-5">
              <label className="text-palm-text-3 text-[10px] uppercase tracking-widest block mb-2">
                Tokens to Auction
              </label>
              <input
                type="text"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value)}
                placeholder="1000000"
                className="w-full bg-palm-bg-secondary border border-palm-border px-4 py-3 text-palm-text font-mono text-sm"
              />
            </div>

            {/* Price settings */}
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="text-palm-text-3 text-[10px] uppercase tracking-widest block mb-2">
                  Floor Price (ETH)
                </label>
                <input
                  type="text"
                  value={floorPrice}
                  onChange={(e) => setFloorPrice(e.target.value)}
                  placeholder="0.001"
                  className="w-full bg-palm-bg-secondary border border-palm-border px-4 py-3 text-palm-text font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-palm-text-3 text-[10px] uppercase tracking-widest block mb-2">
                  Tick Spacing (ETH)
                </label>
                <input
                  type="text"
                  value={tickSpacing}
                  onChange={(e) => setTickSpacing(e.target.value)}
                  placeholder="0.0001"
                  className="w-full bg-palm-bg-secondary border border-palm-border px-4 py-3 text-palm-text font-mono text-sm"
                />
              </div>
            </div>

            {/* Duration */}
            <div className="mb-5">
              <label className="text-palm-text-3 text-[10px] uppercase tracking-widest block mb-2">
                Duration (blocks)
              </label>
              <input
                type="text"
                value={durationBlocks}
                onChange={(e) => setDurationBlocks(e.target.value)}
                placeholder="10000"
                className="w-full bg-palm-bg-secondary border border-palm-border px-4 py-3 text-palm-text font-mono text-sm"
              />
              <p className="text-palm-text-3 text-[10px] mt-1">
                ~{Math.round((parseInt(durationBlocks) || 0) * 2 / 3600)} hours at 2s blocks
              </p>
            </div>

            {/* KYC toggle */}
            <div className="mb-5">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableKYC}
                  onChange={(e) => setEnableKYC(e.target.checked)}
                  className="w-4 h-4 bg-palm-bg-secondary border border-palm-border accent-palm-cyan"
                />
                <span className="text-palm-text text-sm">Enable KYC Verification</span>
              </label>
              <p className="text-palm-text-3 text-[10px] mt-1 ml-7">
                Requires bidders to prove KYC via ZK email proof
              </p>
            </div>

            {enableKYC && (
              <div className="mb-5 ml-7">
                <label className="text-palm-text-3 text-[10px] uppercase tracking-widest block mb-2">
                  KYC Providers
                </label>
                <div className="flex gap-2">
                  {(["echo", "legion", "both"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setKycProvider(p)}
                      className={`px-4 py-2 text-xs font-medium border transition-colors ${
                        kycProvider === p
                          ? "border-palm-cyan text-palm-cyan bg-palm-cyan/10"
                          : "border-palm-border text-palm-text-3 hover:border-palm-text-3"
                      }`}
                    >
                      {p === "both" ? "Both" : p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Summary & Actions */}
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-palm-bg-secondary border border-palm-border/30 p-6">
              <h3 className="text-sm font-bold uppercase tracking-widest text-palm-text mb-4">
                Summary
              </h3>
              <div className="space-y-3">
                <SummaryRow
                  label="Token"
                  value={tokenSymbol || "—"}
                />
                <SummaryRow
                  label="Amount"
                  value={tokenAmount ? `${parseFloat(tokenAmount).toLocaleString()} tokens` : "—"}
                />
                <SummaryRow
                  label="Floor Price"
                  value={floorPrice ? `${floorPrice} ETH` : "—"}
                />
                <SummaryRow
                  label="Tick Spacing"
                  value={tickSpacing ? `${tickSpacing} ETH` : "—"}
                />
                <SummaryRow
                  label="Duration"
                  value={durationBlocks ? `${parseInt(durationBlocks).toLocaleString()} blocks` : "—"}
                />
                <SummaryRow
                  label="KYC Required"
                  value={enableKYC ? `Yes (${kycProvider})` : "No"}
                  accent={enableKYC ? "green" : undefined}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="bg-palm-bg-secondary border border-palm-border/30 p-6">
              <h3 className="text-sm font-bold uppercase tracking-widest text-palm-text mb-4">
                Deploy
              </h3>

              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-6">
                <StepDot active={currentStep === "config"} done={["approve", "deploy", "success"].includes(currentStep)} label="1" />
                <div className="flex-1 h-px bg-palm-border" />
                <StepDot active={currentStep === "approve"} done={["deploy", "success"].includes(currentStep)} label="2" />
                <div className="flex-1 h-px bg-palm-border" />
                <StepDot active={currentStep === "deploy"} done={["success"].includes(currentStep)} label="3" />
              </div>

              {currentStep === "config" && (
                <button
                  onClick={() => setCurrentStep("approve")}
                  disabled={!isValidConfig}
                  className="w-full py-3.5 bg-palm-cyan text-palm-bg text-sm font-bold uppercase tracking-wider hover:bg-palm-cyan/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Continue to Approve
                </button>
              )}

              {currentStep === "approve" && (
                <>
                  <p className="text-palm-text-3 text-xs mb-4">
                    Approve the factory to transfer your tokens for the auction.
                  </p>
                  <button
                    onClick={handleApprove}
                    disabled={isApproving || isApproveConfirming}
                    className="w-full py-3.5 bg-palm-cyan text-palm-bg text-sm font-bold uppercase tracking-wider hover:bg-palm-cyan/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {isApproving || isApproveConfirming ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-2 h-2 bg-palm-bg animate-pulse" />
                        {isApproving ? "Confirm in wallet..." : "Approving..."}
                      </span>
                    ) : (
                      "Approve Tokens"
                    )}
                  </button>
                </>
              )}

              {currentStep === "deploy" && (
                <>
                  <p className="text-palm-text-3 text-xs mb-4">
                    Deploy your auction to the blockchain.
                  </p>
                  <button
                    onClick={handleDeploy}
                    disabled={isDeploying || isDeployConfirming}
                    className="w-full py-3.5 bg-palm-cyan text-palm-bg text-sm font-bold uppercase tracking-wider hover:bg-palm-cyan/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {isDeploying || isDeployConfirming ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-2 h-2 bg-palm-bg animate-pulse" />
                        {isDeploying ? "Confirm in wallet..." : "Deploying..."}
                      </span>
                    ) : (
                      "Deploy Auction"
                    )}
                  </button>
                  {deployError && (
                    <div className="mt-3 bg-palm-pink-dark border border-palm-pink/20 px-4 py-2 text-palm-pink text-xs">
                      {deployError.message.slice(0, 150)}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Note about KYC */}
            {enableKYC && (
              <div className="bg-palm-cyan/5 border border-palm-cyan/20 px-4 py-3 text-palm-cyan text-xs">
                <strong>Note:</strong> KYC hook deployment is coming soon. For now, auctions
                are deployed without a validation hook. You can deploy a PalmValidationHook
                separately and set it during auction creation.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
  accent?: "green" | "cyan";
}

function getAccentColor(accent?: "green" | "cyan"): string {
  switch (accent) {
    case "green":
      return "text-palm-green";
    case "cyan":
      return "text-palm-cyan";
    default:
      return "text-palm-text";
  }
}

function SummaryRow({ label, value, accent }: SummaryRowProps) {
  const valueColor = getAccentColor(accent);

  return (
    <div className="flex items-center justify-between">
      <span className="text-palm-text-3 text-xs">{label}</span>
      <span className={`text-sm font-mono ${valueColor}`}>{value}</span>
    </div>
  );
}

interface StepDotProps {
  active: boolean;
  done: boolean;
  label: string;
}

function getStepDotStyle(done: boolean, active: boolean): string {
  if (done) return "bg-palm-green text-palm-bg";
  if (active) return "bg-palm-cyan text-palm-bg";
  return "bg-palm-border text-palm-text-3";
}

function StepDot({ active, done, label }: StepDotProps) {
  const stepStyle = getStepDotStyle(done, active);

  return (
    <div className={`w-6 h-6 flex items-center justify-center text-[10px] font-bold ${stepStyle}`}>
      {done ? "\u2713" : label}
    </div>
  );
}

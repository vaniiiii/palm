import { useState, useCallback, useEffect } from "react";
import { useAccount } from "wagmi";
import { type Address } from "viem";
import { useDropzone } from "react-dropzone";
import {
  useOwner,
  useEnabledProvider,
  useMaxPurchaseLimit,
  useEnableProvider,
  useDisableProvider,
  useAddPubkeyHash,
  useRemovePubkeyHash,
} from "../hooks/usePalmHook";
import { useProveKYC } from "../hooks/useProveKYC";
import { useKYCCache } from "../hooks/useKYCCache";
import { PROVIDERS } from "../theme";
import { shortenAddress } from "../utils/formatting";

type KYCStep = "provider" | "upload" | "prove" | "review" | "success";

const STEP_LABELS: Record<KYCStep, string> = {
  provider: "Provider",
  upload: "Email",
  prove: "Proof",
  review: "Review",
  success: "Done",
};

const STEP_ORDER: KYCStep[] = ["provider", "upload", "prove", "review", "success"];

export default function AuctionDetailPage({
  hookAddress,
  auctionName,
  onBack,
  onKYCComplete,
}: {
  hookAddress: Address;
  auctionName: string;
  onBack: () => void;
  onKYCComplete?: (hookData: string) => void;
}) {
  const { address } = useAccount();
  const { data: owner } = useOwner(hookAddress);
  const { data: maxLimit } = useMaxPurchaseLimit(hookAddress);
  const { data: echoEnabled } = useEnabledProvider(hookAddress, 0);
  const { data: legionEnabled } = useEnabledProvider(hookAddress, 1);
  const { saveKYC } = useKYCCache(address);

  const ownerAddr = typeof owner === "string" ? owner : undefined;
  const isOwner =
    !!address && !!ownerAddr && address.toLowerCase() === ownerAddr.toLowerCase();

  // KYC state
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);
  const [emlContent, setEmlContent] = useState<string | null>(null);
  const [emlFileName, setEmlFileName] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const {
    prove,
    status: proveStatus,
    result: proofResult,
    error: proveError,
    reset: resetProve,
  } = useProveKYC();

  function resolveKYCStep(): KYCStep {
    if (selectedProvider === null) return "provider";
    if (!emlContent) return "upload";
    if (proveStatus === "idle" || proveStatus === "error") return "prove";
    if (proveStatus === "proving" || proveStatus === "uploading") return "prove";
    if (proveStatus === "done" && proofResult && !txHash) return "review";
    if (txHash) return "success";
    return "prove";
  }

  const currentStep = resolveKYCStep();
  const currentIdx = STEP_ORDER.indexOf(currentStep);

  const handleStartOver = () => {
    setSelectedProvider(null);
    setEmlContent(null);
    setEmlFileName(null);
    setTxHash(null);
    resetProve();
  };

  const handleGoBack = () => {
    if (currentStep === "upload") {
      setSelectedProvider(null);
    } else if (currentStep === "prove") {
      setEmlContent(null);
      setEmlFileName(null);
      resetProve();
    } else if (currentStep === "review") {
      resetProve();
    }
  };

  const enabledCount = [echoEnabled, legionEnabled].filter(Boolean).length;

  return (
    <div>
      <button
        onClick={onBack}
        className="text-palm-text-3 text-xs hover:text-palm-cyan transition-colors mb-6 flex items-center gap-2"
      >
        <span className="font-mono">&larr;</span>
        <span className="uppercase tracking-wider">Back to Auctions</span>
      </button>

      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[clamp(18px,3vw,24px)] font-bold text-palm-text">
          {auctionName}
        </h2>
        {isOwner && (
          <span className="text-palm-cyan text-[10px] font-bold uppercase tracking-widest border border-palm-cyan/30 px-2.5 py-1">
            Owner
          </span>
        )}
      </div>
      <div className="text-palm-text-3 font-mono text-xs mb-6">
        {hookAddress}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-palm-border mb-4">
        <StatusTile
          label="Contract"
          value={shortenAddress({ address: hookAddress })}
          mono
        />
        <StatusTile
          label="Max Purchase"
          value={maxLimit !== undefined ? `${(maxLimit as bigint) / BigInt(1e18)}` : "\u2014"}
          sub={maxLimit !== undefined ? "ETH" : ""}
        />
        <StatusTile
          label="Providers"
          value={String(enabledCount)}
          sub="enabled"
          accent={enabledCount > 0 ? "green" : undefined}
        />
        <StatusTile
          label="Owner"
          value={ownerAddr ? shortenAddress({ address: ownerAddr }) : "\u2014"}
          mono
        />
      </div>

      <div className="flex gap-3 mb-8">
        {PROVIDERS.map((p) => {
          const enabled = p.id === 0 ? echoEnabled : legionEnabled;
          return (
            <div
              key={p.id}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium border ${
                enabled
                  ? "border-palm-green/30 text-palm-green bg-palm-green/5"
                  : "border-palm-border text-palm-text-3 bg-palm-bg-secondary"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 ${enabled ? "bg-palm-green" : "bg-palm-text-3"}`}
              />
              {p.name}
            </div>
          );
        })}
      </div>

      <div className="hr-glow w-full mb-8" />

      {isOwner && (
        <>
          <AdminSection hookAddress={hookAddress} />
          <div className="hr-glow w-full mb-8" />
        </>
      )}

      {address ? (
        <>
          <div className="flex items-baseline justify-between mb-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-palm-text-3">
              KYC Verification
            </h3>
            <span className="text-palm-text-3 text-[10px] uppercase tracking-widest">
              Zero-knowledge email proof
            </span>
          </div>

          <div className="flex items-center gap-0 mb-8 border-b border-palm-border">
            {STEP_ORDER.map((step, i) => {
              const isClickable = i < currentIdx && currentStep !== "success";
              return (
                <button
                  key={step}
                  onClick={() => {
                    if (!isClickable) return;
                    // Navigate to clicked step by resetting state
                    if (i === 0) {
                      setSelectedProvider(null);
                      setEmlContent(null);
                      setEmlFileName(null);
                      resetProve();
                    } else if (i === 1) {
                      setEmlContent(null);
                      setEmlFileName(null);
                      resetProve();
                    } else if (i === 2) {
                      resetProve();
                    }
                  }}
                  disabled={!isClickable}
                  className={`flex-1 pb-3 text-center text-xs font-medium relative transition-colors ${
                    i === currentIdx
                      ? "text-palm-cyan"
                      : i < currentIdx
                      ? "text-palm-green hover:text-palm-cyan cursor-pointer"
                      : "text-palm-text-3 cursor-default"
                  }`}
                >
                  <span className="mr-1 text-[10px] opacity-60">{i + 1}</span>
                  {STEP_LABELS[step]}
                  {i === currentIdx && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-palm-cyan" />
                  )}
                  {i < currentIdx && (
                    <span className="absolute bottom-0 left-0 right-0 h-px bg-palm-green/40" />
                  )}
                </button>
              );
            })}
          </div>

          {currentStep === "provider" && (
            <ProviderSelector hookAddress={hookAddress} onSelect={setSelectedProvider} />
          )}

          {currentStep === "upload" && (
            <EmlUploader
              providerName={PROVIDERS.find((p) => p.id === selectedProvider)?.name ?? ""}
              onUpload={(content, name) => {
                setEmlContent(content);
                setEmlFileName(name);
              }}
              onBack={handleGoBack}
            />
          )}

          {currentStep === "prove" && (
            <ProveStep
              providerName={PROVIDERS.find((p) => p.id === selectedProvider)?.name ?? ""}
              fileName={emlFileName ?? ""}
              status={proveStatus}
              error={proveError}
              onProve={() =>
                prove(
                  selectedProvider === 0 ? "echo" : "legion",
                  emlContent!,
                  address!,
                )
              }
              onBack={handleGoBack}
            />
          )}

          {currentStep === "review" && proofResult && (
            <ReviewStep
              proof={proofResult}
              address={address!}
              onSubmit={() => {
                // Save to cache for future bids
                const provider = selectedProvider === 0 ? "echo" : "legion";
                const nullifier = proofResult.publicSignals[1] || "";
                saveKYC(provider, proofResult.hookData, nullifier);

                setTxHash("manual");
                if (onKYCComplete) {
                  onKYCComplete(proofResult.hookData);
                }
              }}
              onBack={handleGoBack}
            />
          )}

          {currentStep === "success" && <SuccessStep onReset={handleStartOver} />}
        </>
      ) : (
        <div className="clip-corner-both bg-black p-8 text-center">
          <div className="text-palm-text-3 text-3xl mb-4">&#9919;</div>
          <p className="text-palm-text-2 text-sm mb-2">
            Connect your wallet to start KYC verification
          </p>
          <p className="text-palm-text-3 text-xs">
            Your identity is never exposed on-chain
          </p>
        </div>
      )}
    </div>
  );
}

/* ---- Admin Section ---- */

function AdminSection({ hookAddress }: { hookAddress: Address }) {
  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between mb-5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-palm-text-3">
          Admin Controls
        </h3>
        <span className="text-palm-cyan text-[10px] font-mono">owner-only</span>
      </div>
      <div className="clip-corner-both bg-black p-6 border border-palm-border/20">
        <ProviderManager hookAddress={hookAddress} />
        <div className="h-px bg-palm-border/30 my-6" />
        <PubkeyManager hookAddress={hookAddress} />
      </div>
    </div>
  );
}

function ProviderManager({ hookAddress }: { hookAddress: Address }) {
  const { data: echoEnabled, refetch: refetchEcho } = useEnabledProvider(hookAddress, 0);
  const { data: legionEnabled, refetch: refetchLegion } = useEnabledProvider(hookAddress, 1);
  const enableProvider = useEnableProvider(hookAddress);
  const disableProvider = useDisableProvider(hookAddress);

  const toggle = (id: number, currentlyEnabled: boolean) => {
    if (currentlyEnabled) {
      disableProvider.disable(id);
    } else {
      enableProvider.enable(id);
    }
    setTimeout(() => {
      refetchEcho();
      refetchLegion();
    }, 2000);
  };

  const busy =
    enableProvider.isPending ||
    enableProvider.isConfirming ||
    disableProvider.isPending ||
    disableProvider.isConfirming;

  return (
    <div>
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-palm-text-3 mb-3">
        KYC Providers
      </h4>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-palm-border/40">
            <th className="text-left text-palm-text-3 text-xs uppercase tracking-wider py-2 font-medium">
              Provider
            </th>
            <th className="text-left text-palm-text-3 text-xs uppercase tracking-wider py-2 font-medium">
              Domain
            </th>
            <th className="text-right text-palm-text-3 text-xs uppercase tracking-wider py-2 font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {PROVIDERS.map((p) => {
            const enabled = p.id === 0 ? echoEnabled : legionEnabled;
            return (
              <tr
                key={p.id}
                className="border-b border-palm-border/20 hover:bg-palm-bg-secondary/30 transition-colors"
              >
                <td className="py-3 text-sm text-palm-text">{p.name}</td>
                <td className="py-3 text-xs text-palm-text-2 font-mono">
                  {p.domain}
                </td>
                <td className="py-3 text-right">
                  <button
                    onClick={() => toggle(p.id, !!enabled)}
                    disabled={busy}
                    className={`text-xs font-medium px-3 py-1 transition-colors disabled:opacity-40 ${
                      enabled
                        ? "text-palm-green bg-palm-green/10 hover:bg-palm-pink/10 hover:text-palm-pink"
                        : "text-palm-text-3 bg-palm-bg-secondary hover:bg-palm-cyan/10 hover:text-palm-cyan"
                    }`}
                  >
                    {enabled ? "ENABLED" : "DISABLED"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(enableProvider.error || disableProvider.error) && (
        <div className="bg-palm-pink-dark border border-palm-pink/20 px-4 py-2 mt-3 text-palm-pink text-xs">
          {(enableProvider.error || disableProvider.error)?.message}
        </div>
      )}
    </div>
  );
}

function PubkeyManager({ hookAddress }: { hookAddress: Address }) {
  const [hashInput, setHashInput] = useState("");
  const addHash = useAddPubkeyHash(hookAddress);
  const removeHash = useRemovePubkeyHash(hookAddress);

  const handleAdd = () => {
    if (!hashInput) return;
    try {
      addHash.add(BigInt(hashInput));
      setHashInput("");
    } catch {}
  };

  const handleRemove = () => {
    if (!hashInput) return;
    try {
      removeHash.remove(BigInt(hashInput));
      setHashInput("");
    } catch {}
  };

  const busy =
    addHash.isPending ||
    addHash.isConfirming ||
    removeHash.isPending ||
    removeHash.isConfirming;

  return (
    <div>
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-palm-text-3 mb-3">
        DKIM Pubkey Hashes
      </h4>
      <div className="flex gap-px">
        <input
          type="text"
          value={hashInput}
          onChange={(e) => setHashInput(e.target.value)}
          placeholder="Pubkey hash (decimal or 0x hex)"
          className="flex-1 bg-palm-bg-secondary border border-palm-border px-4 py-3 text-palm-text font-mono text-xs"
        />
        <button
          onClick={handleAdd}
          disabled={busy || !hashInput}
          className="px-5 py-3 bg-palm-cyan/10 text-palm-cyan text-xs font-medium border border-palm-border hover:bg-palm-cyan/20 transition-colors disabled:opacity-40"
        >
          ADD
        </button>
        <button
          onClick={handleRemove}
          disabled={busy || !hashInput}
          className="px-5 py-3 bg-palm-pink/10 text-palm-pink text-xs font-medium border border-palm-border hover:bg-palm-pink/20 transition-colors disabled:opacity-40"
        >
          REMOVE
        </button>
      </div>
      {(addHash.error || removeHash.error) && (
        <div className="bg-palm-pink-dark border border-palm-pink/20 px-4 py-2 mt-3 text-palm-pink text-xs">
          {(addHash.error || removeHash.error)?.message}
        </div>
      )}
      {(addHash.isSuccess || removeHash.isSuccess) && (
        <div className="bg-palm-cyan-2/30 border border-palm-cyan/20 px-4 py-2 mt-3 text-palm-cyan text-xs">
          Transaction confirmed.
        </div>
      )}
    </div>
  );
}

/* ---- KYC Sub-components ---- */

function ProviderSelector({
  hookAddress,
  onSelect,
}: {
  hookAddress: Address;
  onSelect: (id: number) => void;
}) {
  const { data: echoEnabled } = useEnabledProvider(hookAddress, 0);
  const { data: legionEnabled } = useEnabledProvider(hookAddress, 1);

  const providers = [
    { ...PROVIDERS[0], enabled: echoEnabled },
    { ...PROVIDERS[1], enabled: legionEnabled },
  ];

  return (
    <div>
      <h3 className="text-sm text-palm-text-2 mb-4">
        Select a KYC provider to verify your identity
      </h3>
      <div className="grid grid-cols-2 gap-px bg-palm-border">
        {providers.map((p) => (
          <button
            key={p.id}
            onClick={() => p.enabled && onSelect(p.id)}
            disabled={!p.enabled}
            className={`bg-palm-bg-secondary p-6 text-left transition-colors ${
              p.enabled
                ? "hover:bg-[#353535] cursor-pointer"
                : "opacity-40 cursor-not-allowed"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-palm-text font-medium">{p.name}</span>
              {p.enabled ? (
                <span className="text-palm-green text-[10px] font-medium uppercase tracking-wider">
                  Available
                </span>
              ) : (
                <span className="text-palm-text-3 text-[10px] font-medium uppercase tracking-wider">
                  Disabled
                </span>
              )}
            </div>
            <span className="text-palm-text-3 font-mono text-xs">{p.domain}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function EmlUploader({
  providerName,
  onUpload,
  onBack,
}: {
  providerName: string;
  onUpload: (content: string, name: string) => void;
  onBack: () => void;
}) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        onUpload(reader.result as string, file.name);
      };
      reader.readAsText(file);
    },
    [onUpload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "message/rfc822": [".eml"] },
    maxFiles: 1,
  });

  return (
    <div>
      <h3 className="text-sm text-palm-text-2 mb-4">
        Upload your <span className="text-palm-cyan">{providerName}</span> KYC
        confirmation email
      </h3>
      <div
        {...getRootProps()}
        className={`border border-dashed p-12 text-center cursor-pointer transition-all ${
          isDragActive
            ? "border-palm-cyan bg-palm-cyan/5"
            : "border-palm-border hover:border-palm-text-3"
        }`}
      >
        <input {...getInputProps()} />
        <div className="text-palm-text-3 text-3xl mb-4">&uarr;</div>
        <p className="text-palm-text-2 text-sm">
          {isDragActive ? "Drop .eml file" : "Drop .eml file here, or click to browse"}
        </p>
        <p className="text-palm-text-3 text-xs mt-3">
          Your email never leaves your machine &mdash; only a ZK proof is generated.
        </p>
      </div>
      <button
        onClick={onBack}
        className="mt-4 text-palm-text-3 text-xs hover:text-palm-cyan transition-colors flex items-center gap-2"
      >
        <span className="font-mono">&larr;</span>
        <span>Change provider</span>
      </button>
    </div>
  );
}

function ProveStep({
  providerName,
  fileName,
  status,
  error,
  onProve,
  onBack,
}: {
  providerName: string;
  fileName: string;
  status: string;
  error: string | null;
  onProve: () => void;
  onBack: () => void;
}) {
  const isWorking = status === "proving" || status === "uploading";
  const [progress, setProgress] = useState(0);

  // Simulate progress while proving (actual proving doesn't give progress updates)
  useEffect(() => {
    if (!isWorking) {
      setProgress(0);
      return;
    }

    // Simulate progress: fast at start, slower towards end
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 99) return prev; // Cap at 99% until actually done
        // Slow down as we approach 100%
        const increment = Math.max(0.2, (100 - prev) / 50);
        return Math.min(99, prev + increment);
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isWorking]);

  // Jump to 100% briefly when done (status changes to "done")
  useEffect(() => {
    if (status === "done") {
      setProgress(100);
    }
  }, [status]);

  return (
    <div>
      <div className="grid grid-cols-2 gap-px bg-palm-border mb-6">
        <div className="bg-palm-bg-secondary p-4">
          <div className="text-palm-text-3 text-xs uppercase tracking-wider mb-1">
            Provider
          </div>
          <div className="text-palm-text text-sm">{providerName}</div>
        </div>
        <div className="bg-palm-bg-secondary p-4">
          <div className="text-palm-text-3 text-xs uppercase tracking-wider mb-1">
            File
          </div>
          <div className="text-palm-text text-sm font-mono truncate">{fileName}</div>
        </div>
      </div>

      {isWorking ? (
        <div className="py-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-palm-text text-sm">Generating ZK proof...</div>
            <div className="text-palm-cyan text-sm font-mono">{Math.round(progress)}%</div>
          </div>

          <div className="h-2 bg-palm-border/50 overflow-hidden mb-3">
            <div
              className="h-full bg-palm-cyan transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="text-palm-text-3 text-xs">
            {progress < 30 && "Parsing email and computing witness..."}
            {progress >= 30 && progress < 70 && "Running Groth16 prover..."}
            {progress >= 70 && "Finalizing proof..."}
          </div>
        </div>
      ) : (
        <>
          {error && (
            <div className="bg-palm-pink-dark border border-palm-pink/20 px-4 py-3 mb-4 text-palm-pink text-xs">
              {error}
            </div>
          )}
          <button
            onClick={onProve}
            className="w-full py-3 bg-palm-cyan text-palm-bg text-sm font-semibold hover:bg-palm-cyan/90 transition-colors"
          >
            {error ? "RETRY PROOF GENERATION" : "GENERATE PROOF"}
          </button>
          <button
            onClick={onBack}
            className="mt-4 text-palm-text-3 text-xs hover:text-palm-cyan transition-colors flex items-center gap-2"
          >
            <span className="font-mono">&larr;</span>
            <span>Change email</span>
          </button>
        </>
      )}
    </div>
  );
}

function ReviewStep({
  proof,
  address,
  onSubmit,
  onBack,
}: {
  proof: { publicSignals: string[]; hookData: string };
  address: string;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [showHookData, setShowHookData] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyHookData = () => {
    navigator.clipboard.writeText(proof.hookData);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="text-center py-8">
      <div className="text-palm-green text-4xl mb-4">&#10003;</div>
      <h3 className="text-palm-text text-lg font-semibold mb-2">
        KYC Proof Generated
      </h3>
      <p className="text-palm-text-3 text-sm mb-6">
        Your zero-knowledge proof is ready. Click continue to return to the auction.
      </p>

      <div className="flex flex-col items-center gap-3 mb-6">
        <button
          onClick={onSubmit}
          className="px-8 py-3 bg-palm-cyan text-palm-bg text-sm font-semibold hover:bg-palm-cyan/90 transition-colors"
        >
          CONTINUE TO AUCTION
        </button>
        <button
          onClick={onBack}
          className="text-palm-text-3 text-xs hover:text-palm-cyan transition-colors flex items-center gap-2"
        >
          <span className="font-mono">&larr;</span>
          <span>Re-generate proof</span>
        </button>
      </div>

      <div className="text-left max-w-lg mx-auto">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-palm-text-3 text-xs hover:text-palm-text transition-colors"
        >
          {showDetails ? "▼" : "▶"} Technical details
        </button>

        {showDetails && (
          <div className="mt-3 p-4 bg-palm-bg-secondary border border-palm-border/30 text-xs space-y-3">
            <div className="flex justify-between">
              <span className="text-palm-text-3">Proof System</span>
              <span className="text-palm-text font-mono">Groth16 (BN254)</span>
            </div>

            <div className="flex justify-between">
              <span className="text-palm-text-3">Bound Address</span>
              <span className="text-palm-text font-mono text-[10px]">{address}</span>
            </div>

            <div>
              <div className="text-palm-text-3 mb-1">DKIM Pubkey Hash</div>
              <div className="text-palm-text font-mono text-[10px] break-all bg-black/30 p-2">
                {proof.publicSignals[0]}
              </div>
            </div>

            <div>
              <div className="text-palm-text-3 mb-1">Email Nullifier</div>
              <div className="text-palm-text font-mono text-[10px] break-all bg-black/30 p-2">
                {proof.publicSignals[1]}
              </div>
            </div>

            <div className="flex justify-between">
              <span className="text-palm-text-3">Encoded Size</span>
              <span className="text-palm-text font-mono">{proof.hookData.length} chars ({Math.round(proof.hookData.length / 2)} bytes)</span>
            </div>

            <div className="pt-2 border-t border-palm-border/30">
              <button
                onClick={() => setShowHookData(!showHookData)}
                className="text-palm-text-3 text-[10px] hover:text-palm-text transition-colors"
              >
                {showHookData ? "▼" : "▶"} Raw hookData (for debugging)
              </button>

              {showHookData && (
                <div className="mt-2">
                  <div className="bg-black/30 p-2 font-mono text-[9px] text-palm-text-2 break-all max-h-32 overflow-y-auto">
                    {proof.hookData}
                  </div>
                  <button
                    onClick={copyHookData}
                    className="mt-2 px-3 py-1 text-[10px] border border-palm-border text-palm-text-3 hover:text-palm-cyan hover:border-palm-cyan transition-colors"
                  >
                    {copied ? "Copied!" : "Copy hookData"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SuccessStep({ onReset }: { onReset: () => void }) {
  return (
    <div className="text-center py-16">
      <div className="text-palm-green text-4xl mb-4">&check;</div>
      <h3 className="text-palm-text text-lg font-semibold mb-2">KYC Proof Ready</h3>
      <p className="text-palm-text-3 text-sm mb-8">
        Your zero-knowledge proof has been generated and submitted.
      </p>
      <button
        onClick={onReset}
        className="px-6 py-2 border border-palm-border text-palm-text-2 text-xs font-medium hover:bg-palm-bg-secondary transition-colors"
      >
        START OVER
      </button>
    </div>
  );
}

function StatusTile({
  label,
  value,
  sub,
  mono,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
  accent?: "green" | "cyan";
}) {
  const colorClass =
    accent === "green"
      ? "text-palm-green"
      : accent === "cyan"
      ? "text-palm-cyan"
      : "text-palm-text";
  return (
    <div className="stat-tile bg-palm-bg-secondary p-4">
      <div className="text-palm-text-3 text-[10px] uppercase tracking-widest mb-2">
        {label}
      </div>
      <div
        className={`text-lg font-bold leading-none mb-1 ${colorClass} ${
          mono ? "font-mono text-sm" : ""
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-palm-text-3 text-[10px]">{sub}</div>}
    </div>
  );
}

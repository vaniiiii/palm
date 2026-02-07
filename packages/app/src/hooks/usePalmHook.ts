import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import type { Address } from "viem";
import abi from "../abi/PalmValidationHook.json";

export function useEnabledProvider(hookAddress: Address | undefined, providerId: number) {
  return useReadContract({
    address: hookAddress,
    abi,
    functionName: "enabledProviders",
    args: [providerId],
    query: { enabled: !!hookAddress },
  });
}

export function useAllowedPubkeyHash(hookAddress: Address | undefined, hash: bigint) {
  return useReadContract({
    address: hookAddress,
    abi,
    functionName: "allowedPubkeyHashes",
    args: [hash],
    query: { enabled: !!hookAddress && hash > 0n },
  });
}

export function useOwner(hookAddress: Address | undefined) {
  return useReadContract({
    address: hookAddress,
    abi,
    functionName: "OWNER",
    query: { enabled: !!hookAddress },
  });
}

export function useMaxPurchaseLimit(hookAddress: Address | undefined) {
  return useReadContract({
    address: hookAddress,
    abi,
    functionName: "MAX_PURCHASE_LIMIT",
    query: { enabled: !!hookAddress },
  });
}

export function useEnableProvider(hookAddress: Address | undefined) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const enable = (providerId: number) => {
    if (!hookAddress) return;
    writeContract({ address: hookAddress, abi, functionName: "enableProvider", args: [providerId] });
  };

  return { enable, isPending, isConfirming, isSuccess, error };
}

export function useDisableProvider(hookAddress: Address | undefined) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const disable = (providerId: number) => {
    if (!hookAddress) return;
    writeContract({ address: hookAddress, abi, functionName: "disableProvider", args: [providerId] });
  };

  return { disable, isPending, isConfirming, isSuccess, error };
}

export function useAddPubkeyHash(hookAddress: Address | undefined) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const add = (pubkeyHash: bigint) => {
    if (!hookAddress) return;
    writeContract({ address: hookAddress, abi, functionName: "addPubkeyHash", args: [pubkeyHash] });
  };

  return { add, isPending, isConfirming, isSuccess, error };
}

export function useRemovePubkeyHash(hookAddress: Address | undefined) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const remove = (pubkeyHash: bigint) => {
    if (!hookAddress) return;
    writeContract({ address: hookAddress, abi, functionName: "removePubkeyHash", args: [pubkeyHash] });
  };

  return { remove, isPending, isConfirming, isSuccess, error };
}

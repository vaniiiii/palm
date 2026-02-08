import { createConfig, EVM } from "@lifi/sdk";
import type { WalletClient } from "viem";

let currentWalletClient: WalletClient | null = null;

createConfig({
  integrator: "palm-protocol",
  providers: [
    EVM({
      getWalletClient: async () => currentWalletClient as any,
    }),
  ],
});

export function setLiFiWalletClient(client: WalletClient | null) {
  currentWalletClient = client;
}

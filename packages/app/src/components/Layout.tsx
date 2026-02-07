import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { ReactNode } from "react";

export default function Layout({
  children,
  onLogoClick,
}: {
  children: ReactNode;
  onLogoClick: () => void;
}) {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="h-[72px] border-b border-palm-border flex items-center justify-between px-8">
        <button
          onClick={onLogoClick}
          className="hover:opacity-80 transition-opacity"
        >
          <span className="text-palm-cyan text-xl font-bold tracking-tight">
            PALM
          </span>
        </button>

        <ConnectButton showBalance={false} />
      </header>

      {/* Content */}
      <main className="flex-1 w-full max-w-[1200px] mx-auto px-8 pt-8 pb-[120px]">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-palm-border px-8 py-4 flex items-center justify-between bg-black">
        <span className="text-palm-text-3 text-xs">
          Palm Protocol
        </span>
        <span className="text-palm-text-3 text-xs">
          Built at HackMoney
        </span>
      </footer>
    </div>
  );
}

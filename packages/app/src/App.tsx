import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { type Address } from "viem";
import Layout from "./components/Layout";
import LandingPage from "./pages/LandingPage";
import AuctionsPage from "./pages/AuctionsPage";
import AuctionDetailPage from "./pages/AuctionDetailPage";
import LaunchAuctionPage from "./pages/LaunchAuctionPage";
import { AuctionDashboard } from "./components/auction";
import { ToastProvider } from "./components/Toast";

type View = "landing" | "auctions" | "auction-detail" | "auction-kyc" | "launch";

export default function App() {
  const { isConnected } = useAccount();
  const [view, setView] = useState<View>("landing");
  const [selectedAuction, setSelectedAuction] = useState<string | null>(null);
  const [selectedHook, setSelectedHook] = useState<string | null>(null);
  const [hookData, setHookData] = useState<string | undefined>(undefined);

  // Auto-navigate to auctions when wallet connects from landing
  const [wasConnected, setWasConnected] = useState(isConnected);
  useEffect(() => {
    if (isConnected && !wasConnected && view === "landing") {
      setView("auctions");
    }
    setWasConnected(isConnected);
  }, [isConnected, wasConnected, view]);

  const handleSelectAuction = (address: string) => {
    setSelectedAuction(address);
    setView("auction-detail");
  };

  const handleBack = () => {
    setSelectedAuction(null);
    setHookData(undefined);
    setView("auctions");
  };

  const handleEnterApp = () => {
    setView("auctions");
  };

  const handleLaunchClick = () => {
    setView("launch");
  };

  const handleKYCClick = (hookAddress: string) => {
    setSelectedHook(hookAddress);
    setView("auction-kyc");
  };

  const handleKYCBack = () => {
    setView("auction-detail");
  };

  // Callback when KYC proof is generated - store hookData and return to dashboard
  const handleKYCComplete = (generatedHookData: string) => {
    setHookData(generatedHookData);
    setView("auction-detail");
  };

  // Generate a simple name from the auction address
  const auctionName = selectedAuction
    ? `Auction ${selectedAuction.slice(0, 8)}...`
    : "Auction";

  return (
    <ToastProvider>
      {view === "landing" ? (
        <LandingPage onEnterApp={handleEnterApp} />
      ) : (
        <Layout onLogoClick={() => setView("landing")}>
          {view === "auction-detail" && selectedAuction ? (
            <AuctionDashboard
              auctionAddress={selectedAuction as Address}
              auctionName={auctionName}
              hookData={hookData}
              onKYCClick={handleKYCClick}
              onBack={handleBack}
            />
          ) : view === "auction-kyc" && selectedHook ? (
            <AuctionDetailPage
              hookAddress={selectedHook as Address}
              auctionName={auctionName}
              onBack={handleKYCBack}
              onKYCComplete={handleKYCComplete}
            />
          ) : view === "launch" ? (
            <LaunchAuctionPage
              onBack={() => setView("auctions")}
              onSuccess={() => setView("auctions")}
            />
          ) : (
            <AuctionsPage
              onSelectAuction={handleSelectAuction}
              onLaunchAuction={handleLaunchClick}
            />
          )}
        </Layout>
      )}
    </ToastProvider>
  );
}

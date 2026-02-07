import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function LandingPage({ onEnterApp }: { onEnterApp: () => void }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Minimal header */}
      <header className="h-[72px] border-b border-palm-border flex items-center justify-between px-8">
        <span className="text-palm-cyan text-xl font-bold tracking-tight">
          PALM
        </span>
        <ConnectButton showBalance={false} />
      </header>

      {/* Marquee ticker */}
      <div className="border-b border-palm-border overflow-hidden py-3 bg-black">
        <div className="marquee-track">
          {Array.from({ length: 20 }).map((_, i) => (
            <span
              key={i}
              className="flex items-center gap-4 mr-4 text-xs font-medium text-palm-text-3 uppercase tracking-widest whitespace-nowrap"
            >
              ZK EMAIL KYC
              <span className="text-palm-cyan opacity-60">&diams;</span>
              PRIVATE IDENTITY
              <span className="text-palm-cyan opacity-60">&diams;</span>
              UNISWAP CCA
              <span className="text-palm-cyan opacity-60">&diams;</span>
              ZERO KNOWLEDGE
              <span className="text-palm-cyan opacity-60">&diams;</span>
            </span>
          ))}
        </div>
      </div>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-8 py-20 relative">
        {/* Grid background */}
        <div className="absolute inset-0 grid-lines opacity-40 pointer-events-none" />

        <div className="relative z-10 max-w-[900px] w-full">
          {/* Big headline */}
          <h1 className="text-[clamp(36px,7vw,80px)] font-bold leading-[0.95] tracking-tight uppercase mb-6">
            Private KYC
            <br />
            <span className="text-palm-cyan">for onchain</span>
            <br />
            auctions
          </h1>

          <p className="text-palm-text-2 text-base max-w-[520px] leading-relaxed mb-10">
            Prove your identity to Uniswap CCA auctions using zero-knowledge proofs
            of KYC confirmation emails. No personal data ever touches the chain.
          </p>

          {/* CTA */}
          <div className="mb-16">
            <button
              onClick={onEnterApp}
              className="bracket-btn inline-flex items-center gap-1 px-6 py-3 border border-palm-cyan text-palm-cyan text-sm font-bold uppercase tracking-wider transition-colors"
            >
              <span className="br-l">[</span>
              <span>Explore Auctions</span>
              <span className="br-r">]</span>
            </button>
          </div>

          {/* Glow line */}
          <div className="hr-glow w-full mb-16" />

          {/* How it works */}
          <div className="mb-12">
            <h2 className="text-sm font-bold uppercase tracking-widest text-palm-text-3 mb-6">
              How It Works
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-palm-border">
              <StepTile
                num="01"
                title="Get KYC&apos;d"
                body="Complete identity verification with a supported provider (Echo, Legion, or Sumsub). You receive a confirmation email."
              />
              <StepTile
                num="02"
                title="Generate ZK Proof"
                body="Upload the .eml file. A zero-knowledge circuit verifies the DKIM signature and extracts a nullifier &mdash; without revealing your email."
              />
              <StepTile
                num="03"
                title="Bid Privately"
                body="Submit the proof as hookData to the CCA auction contract. The hook verifies it on-chain. No identity is ever exposed."
              />
            </div>
          </div>

          {/* Feature tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-palm-border mb-16">
            <FeatureTile label="Providers" value="3" sub="Echo, Legion, Sumsub" />
            <FeatureTile label="On-chain data" value="0" sub="bytes of PII" />
            <FeatureTile label="Proof system" value="Groth16" sub="~2s verify" />
            <FeatureTile label="Sybil protection" value="Nullifier" sub="per email" />
          </div>

          {/* Architecture strip */}
          <div className="clip-corner-both bg-black p-8 mb-16">
            <div className="flex items-start justify-between gap-8 flex-wrap">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-palm-text-3 mb-3">
                  Architecture
                </h3>
                <p className="text-palm-text-2 text-sm leading-relaxed max-w-[400px]">
                  Palm implements{" "}
                  <span className="text-palm-cyan font-mono text-xs">IValidationHook</span>{" "}
                  from Uniswap&apos;s Continuous Clearing Auction. Each bid carries a
                  Groth16 proof in hookData. The circuit composes{" "}
                  <span className="text-palm-cyan font-mono text-xs">EmailVerifier</span>{" "}
                  with provider-specific regex matching, DKIM verification, and
                  Poseidon-based nullifier generation.
                </p>
              </div>
              <div className="flex flex-col gap-2 text-xs font-mono text-palm-text-3">
                <span>
                  <span className="text-palm-cyan">&#9632;</span> EmailVerifier (zk-email)
                </span>
                <span>
                  <span className="text-palm-green">&#9632;</span> KYC Regex Circuit
                </span>
                <span>
                  <span className="text-palm-pink">&#9632;</span> Poseidon Nullifier
                </span>
                <span>
                  <span className="text-palm-text-2">&#9632;</span> Groth16 Verifier (on-chain)
                </span>
              </div>
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="text-center">
            <button
              onClick={onEnterApp}
              className="bracket-btn inline-flex items-center gap-1 px-8 py-4 border border-palm-cyan text-palm-cyan text-sm font-bold uppercase tracking-wider transition-colors"
            >
              <span className="br-l">[</span>
              <span>Browse Auctions</span>
              <span className="br-r">]</span>
            </button>
          </div>
        </div>
      </section>

      {/* Footer marquee + footer */}
      <div className="border-t border-palm-border overflow-hidden py-2 bg-black">
        <div className="marquee-track" style={{ animationDuration: "20s" }}>
          {Array.from({ length: 30 }).map((_, i) => (
            <span
              key={i}
              className="mr-8 text-[10px] text-palm-text-3 uppercase tracking-widest whitespace-nowrap opacity-50"
            >
              PALM &mdash; ZK EMAIL KYC FOR UNISWAP CCA &mdash; HACKMONEY 2025
            </span>
          ))}
        </div>
      </div>

      <footer className="border-t border-palm-border px-8 py-5 flex items-center justify-between bg-black">
        <span className="text-palm-text-3 text-xs uppercase tracking-wider">
          Palm Protocol
        </span>
        <span className="text-palm-text-3 text-xs">
          Built at HackMoney
        </span>
      </footer>
    </div>
  );
}

function StepTile({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="stat-tile bg-palm-bg-secondary p-6">
      <span className="text-palm-cyan font-mono text-xs opacity-60 block mb-3">{num}</span>
      <h4 className="text-palm-text font-semibold text-sm uppercase tracking-wide mb-2">{title}</h4>
      <p
        className="text-palm-text-3 text-xs leading-relaxed"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </div>
  );
}

function FeatureTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="stat-tile bg-palm-bg-secondary p-5">
      <div className="text-palm-text-3 text-[10px] uppercase tracking-widest mb-2">{label}</div>
      <div className="text-palm-text text-2xl font-bold leading-none mb-1">{value}</div>
      <div className="text-palm-text-3 text-[10px]">{sub}</div>
    </div>
  );
}

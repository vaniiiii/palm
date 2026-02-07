/**
 * Palm Proving Server
 *
 * Bun HTTP server that generates ZK proofs server-side.
 * zkeys are 2.9–3.4 GB so browser proving is not feasible.
 *
 * Usage: bun run server/prove.ts
 * Endpoint: POST /api/prove
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const snarkjs = require("snarkjs");

const PORT = parseInt(process.env.PORT || "3001", 10);
const CIRCUITS_DIR = path.resolve(__dirname, "../../circuits");
const BUILD_DIR = path.join(CIRCUITS_DIR, "build");

// Dynamically import the input generators
async function loadGenerators() {
  const mod = await import(path.join(CIRCUITS_DIR, "helpers"));
  return {
    echo: { circuitName: "palm-echo", generate: mod.generatePalmEchoInputs },
    legion: { circuitName: "palm-legion", generate: mod.generatePalmLegionInputs },
  } as Record<string, { circuitName: string; generate: (email: Buffer, addr: string) => Promise<any> }>;
}

function findRapidsnark(): string | null {
  if (process.env.RAPIDSNARK_PATH) return process.env.RAPIDSNARK_PATH;

  try {
    const which = execSync("which rapidsnark 2>/dev/null || which prover 2>/dev/null", {
      encoding: "utf8",
    }).trim();
    if (which) return which;
  } catch {}

  const candidates = [
    path.resolve(CIRCUITS_DIR, "../../../rapidsnark/package_noasm/bin/prover"),
    path.resolve(CIRCUITS_DIR, "../../../rapidsnark/package/bin/prover"),
    path.resolve(CIRCUITS_DIR, "../../../rapidsnark/build_prover/src/prover"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function encodeHookData(provider: number, proof: any, publicSignals: string[]): `0x${string}` {
  // Groth16 proof has pi_a[2], pi_b[2][2], pi_c[2] → flatten to uint256[8]
  // IMPORTANT: pi_b inner arrays must be reversed for Solidity verifier
  // snarkjs outputs [x1, x2] but Solidity expects [x2, x1] for each Fq2 element
  const a = proof.pi_a.slice(0, 2);
  const b0 = [...proof.pi_b[0].slice(0, 2)].reverse();
  const b1 = [...proof.pi_b[1].slice(0, 2)].reverse();
  const c = proof.pi_c.slice(0, 2);
  const flatProof = [...a, ...b0, ...b1, ...c].map(BigInt);

  const signals = publicSignals.slice(0, 3).map(BigInt);

  // abi.encode(uint8, uint256[8], uint256[3])
  const { encodeAbiParameters, parseAbiParameters } = require("viem");
  const encoded = encodeAbiParameters(
    parseAbiParameters("uint8, uint256[8], uint256[3]"),
    [provider, flatProof, signals],
  );
  return encoded;
}

let generators: Awaited<ReturnType<typeof loadGenerators>> | null = null;

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // CORS headers
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === "/api/prove" && req.method === "POST") {
      try {
        if (!generators) generators = await loadGenerators();

        const body = await req.json();
        const { provider, emailEml, ethereumAddress } = body;

        if (!provider || !emailEml || !ethereumAddress) {
          return new Response(
            JSON.stringify({ error: "Missing required fields: provider, emailEml, ethereumAddress" }),
            { status: 400, headers },
          );
        }

        const cfg = generators[provider];
        if (!cfg) {
          return new Response(
            JSON.stringify({ error: `Unknown provider: ${provider}. Available: echo, legion` }),
            { status: 400, headers },
          );
        }

        console.log(`[prove] provider=${provider} address=${ethereumAddress}`);

        // 1. Generate circuit inputs
        console.log("[prove] Generating inputs...");
        const rawEmail = Buffer.from(emailEml);
        const circuitInputs = await cfg.generate(rawEmail, ethereumAddress);

        // 2. Calculate witness
        console.log("[prove] Calculating witness...");
        const wasmPath = path.join(BUILD_DIR, `${cfg.circuitName}_js/${cfg.circuitName}.wasm`);
        if (!fs.existsSync(wasmPath)) {
          return new Response(
            JSON.stringify({ error: `WASM not found: ${wasmPath}. Build circuits first.` }),
            { status: 500, headers },
          );
        }

        const tmpDir = path.join(BUILD_DIR, "tmp");
        fs.mkdirSync(tmpDir, { recursive: true });
        const wtnsPath = path.join(tmpDir, `${provider}-${Date.now()}.wtns`);
        await snarkjs.wtns.calculate(circuitInputs, wasmPath, wtnsPath);

        // 3. Generate proof
        console.log("[prove] Generating proof...");
        const zkeyPath = path.join(BUILD_DIR, `${cfg.circuitName}.zkey`);
        if (!fs.existsSync(zkeyPath)) {
          return new Response(
            JSON.stringify({ error: `zkey not found: ${zkeyPath}. Run setup first.` }),
            { status: 500, headers },
          );
        }

        let proof: any;
        let publicSignals: any;

        const rapidsnarkBin = findRapidsnark();
        if (rapidsnarkBin) {
          console.log(`[prove] Using rapidsnark: ${rapidsnarkBin}`);
          const proofPath = path.join(tmpDir, `proof-${Date.now()}.json`);
          const publicPath = path.join(tmpDir, `public-${Date.now()}.json`);
          execSync(`"${rapidsnarkBin}" "${zkeyPath}" "${wtnsPath}" "${proofPath}" "${publicPath}"`, {
            stdio: "inherit",
          });
          proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
          publicSignals = JSON.parse(fs.readFileSync(publicPath, "utf8"));
          fs.unlinkSync(proofPath);
          fs.unlinkSync(publicPath);
        } else {
          console.log("[prove] Falling back to snarkjs (slow)...");
          ({ proof, publicSignals } = await snarkjs.groth16.prove(zkeyPath, wtnsPath));
        }

        // Cleanup witness
        try { fs.unlinkSync(wtnsPath); } catch {}

        // 4. Encode hookData
        const providerInt = provider === "echo" ? 0 : 1;
        const hookData = encodeHookData(providerInt, proof, publicSignals);

        console.log("[prove] Done.");
        return new Response(
          JSON.stringify({ proof, publicSignals, hookData }),
          { status: 200, headers },
        );
      } catch (e: any) {
        console.error("[prove] Error:", e);
        return new Response(
          JSON.stringify({ error: e.message || "Internal error" }),
          { status: 500, headers },
        );
      }
    }

    // Health check
    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
  },
});

console.log(`Palm proving server running on http://localhost:${PORT}`);

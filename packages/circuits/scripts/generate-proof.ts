import { program } from "commander";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  generatePalmEchoInputs,
  generatePalmLegionInputs,
} from "../helpers";

const snarkjs = require("snarkjs");

function findRapidsnark(): string | null {
  if (process.env.RAPIDSNARK_PATH) return process.env.RAPIDSNARK_PATH;

  try {
    const which = execSync("which rapidsnark 2>/dev/null || which prover 2>/dev/null", { encoding: "utf8" }).trim();
    if (which) return which;
  } catch {}

  const candidates = [
    path.resolve(__dirname, "../../../../rapidsnark/package_noasm/bin/prover"),
    path.resolve(__dirname, "../../../../rapidsnark/package/bin/prover"),
    path.resolve(__dirname, "../../../../rapidsnark/build_prover/src/prover"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

program
  .argument("<provider>", "echo | legion")
  .requiredOption("--email-file <path>", "Path to .eml file")
  .requiredOption("--ethereum-address <address>", "Ethereum address (0x-prefixed)")
  .option("--silent", "Suppress logs");

program.parse();

const provider = program.args[0];
const opts = program.opts();

const BUILD_DIR = path.join(__dirname, "../build");
const OUTPUT_DIR = path.join(__dirname, "../proofs");

function log(...msg: any) {
  if (!opts.silent) console.log(...msg);
}

const PROVIDERS: Record<string, { circuitName: string; generateInputs: typeof generatePalmEchoInputs }> = {
  echo:   { circuitName: "palm-echo",   generateInputs: generatePalmEchoInputs },
  legion: { circuitName: "palm-legion", generateInputs: generatePalmLegionInputs },
};

async function generate() {
  const cfg = PROVIDERS[provider];
  if (!cfg) {
    console.error(`Unknown provider: ${provider}. Available: ${Object.keys(PROVIDERS).join(", ")}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const emailPath = path.resolve(opts.emailFile);
  if (!fs.existsSync(emailPath)) throw new Error(`Email file not found: ${emailPath}`);

  log(`Provider:  ${provider}`);
  log(`Email:     ${emailPath}`);
  log(`Address:   ${opts.ethereumAddress}\n`);

  log("Generating circuit inputs ...");
  const rawEmail = Buffer.from(fs.readFileSync(emailPath, "utf8"));
  const circuitInputs = await cfg.generateInputs(rawEmail, opts.ethereumAddress);
  const inputPath = path.join(OUTPUT_DIR, `${provider}-input.json`);
  fs.writeFileSync(inputPath, JSON.stringify(circuitInputs, null, 2));
  log(`✓ Inputs written to ${inputPath}`);

  log("Calculating witness ...");
  const wasmPath = path.join(BUILD_DIR, `${cfg.circuitName}_js/${cfg.circuitName}.wasm`);
  if (!fs.existsSync(wasmPath)) throw new Error(`WASM not found: ${wasmPath}. Run \`bun run build\` first.`);
  const wtnsPath = path.join(OUTPUT_DIR, `${provider}-witness.wtns`);
  await snarkjs.wtns.calculate(circuitInputs, wasmPath, wtnsPath);
  log("✓ Witness calculated");

  log("Generating proof ...");
  const zkeyPath = path.join(BUILD_DIR, `${cfg.circuitName}.zkey`);
  if (!fs.existsSync(zkeyPath)) throw new Error(`zKey not found: ${zkeyPath}. Run \`bun run setup\` first.`);

  const proofPath = path.join(OUTPUT_DIR, `${provider}-proof.json`);
  const publicPath = path.join(OUTPUT_DIR, `${provider}-public.json`);
  let proof: any;
  let publicSignals: any;

  const rapidsnarkBin = findRapidsnark();
  const start = Date.now();

  if (rapidsnarkBin) {
    log(`Using rapidsnark: ${rapidsnarkBin}`);
    execSync(`"${rapidsnarkBin}" "${zkeyPath}" "${wtnsPath}" "${proofPath}" "${publicPath}"`, { stdio: "inherit" });
    proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
    publicSignals = JSON.parse(fs.readFileSync(publicPath, "utf8"));
  } else {
    log("rapidsnark not found, falling back to snarkjs (slow) ...");
    const logger = { log, error: log, warn: log, debug: log };
    ({ proof, publicSignals } = await snarkjs.groth16.prove(zkeyPath, wtnsPath, logger));
    fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));
    fs.writeFileSync(publicPath, JSON.stringify(publicSignals, null, 2));
  }

  log(`✓ Proof generated in ${((Date.now() - start) / 1000).toFixed(1)}s`);

  log("Verifying proof ...");
  const vkeyPath = path.join(BUILD_DIR, `artifacts/${cfg.circuitName}.vkey.json`);
  if (!fs.existsSync(vkeyPath)) throw new Error(`Verification key not found: ${vkeyPath}`);
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!verified) throw new Error("Proof verification failed!");
  log("✓ Proof verified locally");

  log("\n--- Solidity calldata ---");
  log(await snarkjs.groth16.exportSolidityCallData(proof, publicSignals));

  log("\n--- Public signals ---");
  log("  [0] pubkeyHash:     ", publicSignals[0]);
  log("  [1] emailNullifier: ", publicSignals[1]);
  log("  [2] address:        ", publicSignals[2]);

  log("\n✓ Done!");
  process.exit(0);
}

generate().catch((err) => {
  console.error("Error generating proof:", err);
  process.exit(1);
});

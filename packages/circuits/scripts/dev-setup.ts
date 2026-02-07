// @ts-ignore
import { zKey } from "snarkjs";
import https from "https";
import fs from "fs";
import path from "path";

let { ZKEY_ENTROPY, ZKEY_BEACON, SILENT } = process.env;
if (ZKEY_ENTROPY == null) {
  log("No entropy provided, using `dev`");
  ZKEY_ENTROPY = "dev";
}
if (ZKEY_BEACON == null) {
  ZKEY_BEACON = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
  log("No ZKEY_BEACON provided, using default");
}

const BUILD_DIR = path.join(__dirname, "../build");
const ARTIFACTS_DIR = path.join(BUILD_DIR, "artifacts");
const CONTRACTS_VERIFIERS_DIR = path.join(__dirname, "../../contracts/src/verifiers");

const PHASE1_URL = "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_23.ptau";
const PHASE1_PATH = path.join(BUILD_DIR, "powersOfTau28_hez_final_23.ptau");

const SOLIDITY_TEMPLATE = path.join(
  require.resolve("snarkjs"),
  "../../templates/verifier_groth16.sol.ejs"
);

interface CircuitConfig {
  name: string;
  contractName: string;
}

const CIRCUITS: CircuitConfig[] = [
  { name: "palm-echo", contractName: "PalmEchoVerifier" },
  { name: "palm-legion", contractName: "PalmLegionVerifier" },
];

function log(...msg: any) {
  if (!SILENT) console.log(...msg);
}

async function downloadPhase1() {
  if (fs.existsSync(PHASE1_PATH)) {
    log("✓ Phase 1 already exists:", PHASE1_PATH);
    return;
  }

  log("✘ Phase 1 not found at", PHASE1_PATH);
  log("⬇ Downloading Phase 1 (~9 GB) ...");

  fs.mkdirSync(BUILD_DIR, { recursive: true });
  const tmpPath = PHASE1_PATH + ".download";
  const file = fs.createWriteStream(tmpPath);

  return new Promise<void>((resolve, reject) => {
    https
      .get(PHASE1_URL, (response) => {
        const total = parseInt(response.headers["content-length"] || "0", 10);
        let downloaded = 0;
        let lastPct = -1;

        response.on("data", (chunk: Buffer) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = Math.floor((downloaded / total) * 100);
            if (pct !== lastPct && pct % 10 === 0) {
              log(`  ${pct}%`);
              lastPct = pct;
            }
          }
        });

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          fs.renameSync(tmpPath, PHASE1_PATH);
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(tmpPath, () => {});
        reject(err);
      });
  });
}

async function generateKeysForCircuit(circuit: CircuitConfig) {
  const { name, contractName } = circuit;
  log(`\n${"=".repeat(60)}`);
  log(`Processing circuit: ${name}`);
  log("=".repeat(60));

  const r1csPath = path.join(BUILD_DIR, `${name}.r1cs`);
  if (!fs.existsSync(r1csPath)) {
    throw new Error(`${r1csPath} does not exist. Run \`bun run build\` first.`);
  }

  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  fs.mkdirSync(CONTRACTS_VERIFIERS_DIR, { recursive: true });

  fs.copyFileSync(r1csPath, path.join(ARTIFACTS_DIR, `${name}.r1cs`));
  fs.copyFileSync(
    path.join(BUILD_DIR, `${name}_js/${name}.wasm`),
    path.join(ARTIFACTS_DIR, `${name}.wasm`)
  );
  log(`✓ Build artifacts copied to ${ARTIFACTS_DIR}`);

  const zKeyPath = path.join(BUILD_DIR, `${name}.zkey`);
  const step1 = zKeyPath + ".step1";
  const step2 = zKeyPath + ".step2";

  log("Generating zKey (newZKey) ...");
  await zKey.newZKey(r1csPath, PHASE1_PATH, step1, console);
  log("✓ Partial zKey generated");

  log("Contributing ...");
  await zKey.contribute(step1, step2, "Contributor 1", ZKEY_ENTROPY, console);
  log("✓ First contribution completed");

  log("Applying beacon ...");
  await zKey.beacon(step2, zKeyPath, "Final Beacon", ZKEY_BEACON, 10, console);
  log("✓ Beacon applied");

  const vKeyPath = path.join(ARTIFACTS_DIR, `${name}.vkey.json`);
  const vKey = await zKey.exportVerificationKey(zKeyPath, console);
  fs.writeFileSync(vKeyPath, JSON.stringify(vKey, null, 2));
  log(`✓ Verification key exported → ${vKeyPath}`);

  const solidityPath = path.join(CONTRACTS_VERIFIERS_DIR, `${contractName}.sol`);
  const templates = { groth16: fs.readFileSync(SOLIDITY_TEMPLATE, "utf8") };
  let code: string = await zKey.exportSolidityVerifier(zKeyPath, templates, console);
  code = code.replace(/contract Groth16Verifier/g, `contract ${contractName}`);
  fs.writeFileSync(solidityPath, code);
  log(`✓ Solidity verifier exported → ${solidityPath}`);

  // Cleanup intermediate zkey ceremony files
  for (const suffix of ["", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"]) {
    for (const s of [step1 + suffix, step2 + suffix]) {
      if (fs.existsSync(s)) fs.unlinkSync(s);
    }
  }
  log("✓ Intermediate files cleaned up");
}

async function main() {
  const arg = process.argv[2];
  let targets: CircuitConfig[];

  if (arg) {
    const match = CIRCUITS.find((c) => c.name === `palm-${arg}` || c.name === arg);
    if (!match) {
      console.error(`Unknown circuit: ${arg}. Available: ${CIRCUITS.map((c) => c.name).join(", ")}`);
      process.exit(1);
    }
    targets = [match];
  } else {
    targets = CIRCUITS;
  }

  await downloadPhase1();
  log("✓ Phase 1:", PHASE1_PATH);

  for (const circuit of targets) {
    await generateKeysForCircuit(circuit);
  }

  log("\n✓ All done!");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });

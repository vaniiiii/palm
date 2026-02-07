/**
 * Test witness generation with real .eml files.
 * If witness computation succeeds, all circuit constraints are satisfied.
 *
 * Usage:
 *   bun run scripts/test-witness.ts echo
 *   bun run scripts/test-witness.ts legion
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import {
  generatePalmEchoInputs,
  generatePalmLegionInputs,
} from "../helpers/generate-inputs";

const provider = process.argv[2] || "echo";
const BUILD_DIR = path.join(__dirname, "..", "build");
const TEST_DIR = path.join(BUILD_DIR, "test");
const TEST_ADDRESS = "0x1234567890123456789012345678901234567890";

const config: Record<
  string,
  {
    eml: string;
    wasm: string;
    generateInputs: typeof generatePalmEchoInputs;
  }
> = {
  echo: {
    eml: path.join(__dirname, "..", "tests", "emls", "echo-test.eml"),
    wasm: path.join(BUILD_DIR, "palm-echo_js", "palm-echo.wasm"),
    generateInputs: generatePalmEchoInputs,
  },
  legion: {
    eml: path.join(__dirname, "..", "tests", "emls", "legion-test.eml"),
    wasm: path.join(BUILD_DIR, "palm-legion_js", "palm-legion.wasm"),
    generateInputs: generatePalmLegionInputs,
  },
};

async function main() {
  const cfg = config[provider];
  if (!cfg) {
    console.error(`Unknown provider: ${provider}. Use: echo, legion`);
    process.exit(1);
  }

  console.log(`Testing ${provider} circuit with real .eml...\n`);

  console.log("Reading .eml file...");
  const email = readFileSync(cfg.eml);

  console.log("Generating circuit inputs...");
  const inputs = await cfg.generateInputs(email, TEST_ADDRESS);

  console.log("Input stats:");
  console.log("  emailHeader length:", inputs.emailHeader.length);
  console.log("  emailBody length:", inputs.emailBody?.length);
  console.log("  toEmailIndex:", inputs.toEmailIndex);

  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(
    path.join(TEST_DIR, `${provider}-input.json`),
    JSON.stringify(inputs, null, 2)
  );
  console.log(`\nInputs saved to build/test/${provider}-input.json`);

  console.log("\nComputing witness...");
  const wtnsPath = path.join(TEST_DIR, `${provider}-witness.wtns`);
  const snarkjs = await import("snarkjs");
  await (snarkjs as any).wtns.calculate(inputs, cfg.wasm, wtnsPath);

  console.log(`\n✅ ${provider} witness computed! All constraints satisfied.`);
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message || err);
  process.exit(1);
});

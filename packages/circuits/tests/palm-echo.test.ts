import { buildPoseidon } from "circomlibjs";
import { verifyDKIMSignature } from "@zk-email/helpers/dist/dkim";
import { generatePalmEchoInputs } from "../helpers";
import { bigIntToChunkedBytes } from "@zk-email/helpers/dist/binary-format";

const path = require("path");
const fs = require("fs");
const wasm_tester = require("circom_tester").wasm;

describe("PalmEchoVerifier", function () {
  jest.setTimeout(10 * 60 * 1000);

  let rawEmail: Buffer;
  let circuit: any;
  const ethAddress = "0x1234567890123456789012345678901234567890";

  beforeAll(async () => {
    rawEmail = fs.readFileSync(
      path.join(__dirname, "./emls/echo-test.eml"),
      "utf8"
    );

    circuit = await wasm_tester(
      path.join(__dirname, "../circuits/palm-echo.circom"),
      {
        recompile: true,
        output: path.join(__dirname, "../build/palm-echo"),
        include: [
          path.join(__dirname, "../node_modules"),
          path.join(__dirname, "../../../node_modules"),
        ],
      }
    );
  });

  it("should verify echo KYC email", async function () {
    const inputs = await generatePalmEchoInputs(rawEmail, ethAddress);
    const witness = await circuit.calculateWitness(inputs);
    await circuit.checkConstraints(witness);

    // Verify pubkeyHash matches independent computation
    const dkimResult = await verifyDKIMSignature(rawEmail, "echo.xyz");
    const poseidon = await buildPoseidon();
    const pubkeyChunked = bigIntToChunkedBytes(dkimResult.publicKey, 242, 9);
    const expectedPubkeyHash = poseidon.F.toObject(poseidon(pubkeyChunked));
    expect(witness[1]).toEqual(expectedPubkeyHash);

    // emailNullifier should be non-zero
    expect(witness[2]).not.toEqual(BigInt(0));

    // address public input
    expect(witness[3]).toEqual(BigInt(ethAddress));
  });

  it("should fail if toEmailIndex is invalid", async function () {
    const inputs = await generatePalmEchoInputs(rawEmail, ethAddress);
    inputs.toEmailIndex = (Number(inputs.toEmailIndex) + 1).toString();

    expect.assertions(1);
    try {
      const witness = await circuit.calculateWitness(inputs);
      await circuit.checkConstraints(witness);
    } catch (error) {
      expect((error as Error).message).toMatch("Assert Failed");
    }
  });

  it("should fail if toEmailIndex is out of bounds", async function () {
    const inputs = await generatePalmEchoInputs(rawEmail, ethAddress);
    inputs.toEmailIndex = (Number(inputs.emailHeaderLength) + 1).toString();

    expect.assertions(1);
    try {
      const witness = await circuit.calculateWitness(inputs);
      await circuit.checkConstraints(witness);
    } catch (error) {
      expect((error as Error).message).toMatch("Assert Failed");
    }
  });
});

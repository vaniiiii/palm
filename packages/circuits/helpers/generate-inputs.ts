import { bytesToBigInt, fromHex } from "@zk-email/helpers/dist/binary-format";
import { generateEmailVerifierInputs } from "@zk-email/helpers/dist/input-generators";

export const ECHO_PRESELECTOR = "successfully verified your identity";
export const LEGION_PRESELECTOR = "ID verification has been successful";

export type PalmCircuitInputs = {
  emailHeader: string[];
  emailHeaderLength: string;
  pubkey: string[];
  signature: string[];
  emailBody?: string[];
  emailBodyLength?: string;
  precomputedSHA?: string[];
  bodyHashIndex?: string;
  toEmailIndex: string;
  address: string;
};

function extractToEmailIndex(emailHeader: string[]): string {
  const headerBytes = emailHeader.map((c) => Number(c));
  const headerStr = Buffer.from(headerBytes).toString("ascii");

  const toHeaderMatch = headerStr.match(/\r?\n[Tt][Oo]:\s*([^\r\n]+)/);
  if (!toHeaderMatch) {
    throw new Error("Could not find To: header in email");
  }

  const toEmail = toHeaderMatch[1].trim();
  const toEmailIndex = headerStr.indexOf(toEmail);
  if (toEmailIndex === -1) {
    throw new Error(`Could not find email "${toEmail}" in header`);
  }

  return toEmailIndex.toString();
}

export async function generatePalmEchoInputs(
  email: string | Buffer,
  ethereumAddress: string
): Promise<PalmCircuitInputs> {
  const emailVerifierInputs = await generateEmailVerifierInputs(email, {
    maxHeadersLength: 1024,
    maxBodyLength: 4096,
    shaPrecomputeSelector: ECHO_PRESELECTOR,
  });

  return {
    ...emailVerifierInputs,
    toEmailIndex: extractToEmailIndex(emailVerifierInputs.emailHeader),
    address: bytesToBigInt(fromHex(ethereumAddress)).toString(),
  };
}

export async function generatePalmLegionInputs(
  email: string | Buffer,
  ethereumAddress: string
): Promise<PalmCircuitInputs> {
  const emailVerifierInputs = await generateEmailVerifierInputs(
    email,
    {
      maxHeadersLength: 1408,
      maxBodyLength: 4096,
      shaPrecomputeSelector: LEGION_PRESELECTOR,
    },
    {
      // Legion emails are DKIM-signed by Mailgun subdomain (cioeu115824.legion.cc),
      // not the From: domain (legion.cc). Must specify explicitly.
      domain: "cioeu115824.legion.cc",
    }
  );

  return {
    ...emailVerifierInputs,
    toEmailIndex: extractToEmailIndex(emailVerifierInputs.emailHeader),
    address: bytesToBigInt(fromHex(ethereumAddress)).toString(),
  };
}

/**
 * EAS (Ethereum Attestation Service) — Base Sepolia Relayer Utility
 *
 * Creates on-chain attestations for verified road damage reports using
 * a server-side relayer wallet (gasless for end users).
 *
 * Schema: "string imageHash,int256 latitude,int256 longitude,uint8 severityScore,string status"
 */

import { ethers } from "ethers";
import { EAS, SchemaEncoder, NO_EXPIRATION } from "@ethereum-attestation-service/eas-sdk";

/* ─── Constants ─────────────────────────────────────────────────────── */

const EAS_CONTRACT_ADDRESS = "0x4200000000000000000000000000000000000021";

/**
 * CivicPlus EAS Schema UID — registered on Base Sepolia.
 * Schema: "string imageHash,int256 latitude,int256 longitude,uint8 severityScore,string status"
 *
 * Register the schema on-chain via SchemaRegistry and set EAS_SCHEMA_UID
 * in your `.env.local` file. Run `npx tsx scripts/register-schema.ts`
 * to register and auto-populate the variable.
 */
function getSchemaUID(): string {
  const uid = process.env.EAS_SCHEMA_UID;
  if (
    !uid ||
    uid === "0x0000000000000000000000000000000000000000000000000000000000000000"
  ) {
    throw new Error(
      "Missing or invalid EAS_SCHEMA_UID environment variable. " +
        "Register the schema first: npx tsx scripts/register-schema.ts"
    );
  }
  return uid;
}

/* ─── Provider & Signer (lazy singleton) ────────────────────────────── */

let _provider: ethers.JsonRpcProvider | null = null;
let _signer: ethers.Wallet | null = null;
let _eas: EAS | null = null;

function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) {
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "https://sepolia.base.org";
    _provider = new ethers.JsonRpcProvider(rpcUrl);
  }
  return _provider;
}

function getSigner(): ethers.Wallet {
  if (!_signer) {
    const privateKey = process.env.PRIVATE_KEY_RELAYER;
    if (!privateKey) {
      throw new Error(
        "Missing PRIVATE_KEY_RELAYER environment variable. " +
          "The relayer wallet is required for on-chain attestations."
      );
    }
    _signer = new ethers.Wallet(privateKey, getProvider());
  }
  return _signer;
}

function getEAS(): EAS {
  if (!_eas) {
    _eas = new EAS(EAS_CONTRACT_ADDRESS);
    _eas.connect(getSigner());
  }
  return _eas;
}

/* ─── Schema Encoder ────────────────────────────────────────────────── */

const schemaEncoder = new SchemaEncoder(
  "string imageHash,int256 latitude,int256 longitude,uint8 severityScore,string status"
);

/* ─── Public API ────────────────────────────────────────────────────── */

export interface AttestationParams {
  imageHash: string;
  lat: number;
  lng: number;
  severityScore: number;
  status: string;
}

export interface AttestationResult {
  txHash: string;
  uid: string;
}

/**
 * Creates an on-chain EAS attestation for a road damage report.
 *
 * Coordinates are multiplied by 1e6 and cast to integers so they
 * can be stored on-chain as int256 values.
 *
 * @returns Transaction hash and attestation UID.
 */
export async function createRoadDamageAttestation(
  params: AttestationParams
): Promise<AttestationResult> {
  const eas = getEAS();
  const signer = getSigner();

  /* ── Verify relayer has sufficient gas balance ── */
  const balance = await getProvider().getBalance(signer.address);
  if (balance === BigInt(0)) {
    throw new Error(
      `Relayer wallet (${signer.address}) has zero ETH balance on Base Sepolia. ` +
        "Fund it via a faucet before submitting attestations."
    );
  }

  /* ── Encode schema data ── */
  const latInt = BigInt(Math.round(params.lat * 1e6));
  const lngInt = BigInt(Math.round(params.lng * 1e6));
  const severity = Math.min(255, Math.max(0, Math.round(params.severityScore)));

  const encodedData = schemaEncoder.encodeData([
    { name: "imageHash", value: params.imageHash, type: "string" },
    { name: "latitude", value: latInt, type: "int256" },
    { name: "longitude", value: lngInt, type: "int256" },
    { name: "severityScore", value: severity, type: "uint8" },
    { name: "status", value: params.status, type: "string" },
  ]);

  /* ── Submit attestation on-chain ── */
  console.log("[EAS] Submitting attestation on Base Sepolia...");
  console.log(`[EAS] Relayer: ${signer.address}`);

  const tx = await eas.attest({
    schema: getSchemaUID(),
    data: {
      recipient: ethers.ZeroAddress,
      expirationTime: NO_EXPIRATION,
      revocable: true,
      refUID: ethers.ZeroHash,
      data: encodedData,
      value: BigInt(0),
    },
  });

  /* ── Wait for receipt and extract UID ── */
  console.log("[EAS] Transaction submitted, waiting for confirmation...");

  let uid: string;
  try {
    // The EAS SDK `tx` object has a `wait()` that resolves the attestation UID
    uid = await tx.wait();
    console.log(`[EAS] ✓ Attestation UID: ${uid}`);
  } catch (waitError) {
    // Fallback: on testnet RPC delays, `wait()` may timeout.
    // In that case, use the transaction hash as a provisional ID.
    console.warn("[EAS] ⚠ wait() failed, using fallback ID from tx hash");
    console.warn(waitError);

    // Try to get txHash from the transaction object
    const txHash =
      typeof tx === "object" && tx !== null && "hash" in tx
        ? (tx as { hash: string }).hash
        : "";

    if (txHash) {
      // Attempt one more receipt fetch with extended timeout
      try {
        const receipt = await getProvider().waitForTransaction(txHash, 1, 30_000);
        uid = receipt?.hash ?? `pending-${txHash.slice(0, 16)}`;
      } catch {
        uid = `pending-${txHash.slice(0, 16)}`;
      }
    } else {
      uid = `pending-${Date.now().toString(16)}`;
    }
  }

  /* ── Extract transaction hash (from receipt, never fallback to uid) ── */
  const txObj =
    typeof tx === "object" && tx !== null
      ? (tx as { receipt?: { hash?: string }; hash?: string })
      : null;
  const rawTxHash =
    txObj?.receipt?.hash ?? txObj?.hash ?? (typeof tx === "string" ? tx : "");
  const txHash = /^0x[0-9a-fA-F]{64}$/.test(rawTxHash) ? rawTxHash : "";

  console.log(`[EAS] ✓ txHash: ${txHash}`);
  console.log(`[EAS] ✓ uid: ${uid}`);

  return { txHash, uid };
}

/**
 * Returns the relayer wallet address (useful for debugging / UI display).
 */
export async function getRelayerAddress(): Promise<string> {
  return getSigner().address;
}

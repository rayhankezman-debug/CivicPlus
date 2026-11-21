/**
 * POST /api/attest
 *
 * EAS Web3 Attestation Relayer — Base Sepolia
 *
 * Receives a verified road damage report from the client, uploads the
 * photo to Supabase Storage, publishes an on-chain EAS attestation,
 * and persists a record in the `reports` table.
 */

import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createRoadDamageAttestation } from "@/lib/eas";

/* ─── Supabase (server-side: prefer service role, fallback to anon) ─── */

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "[Attest] SUPABASE_SERVICE_ROLE_KEY is missing — falling back to anon key. " +
      "Storage uploads / inserts may be blocked by RLS."
  );
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

/** Public Supabase Storage bucket for report photos. */
const STORAGE_BUCKET = "reports";

/** Error raised when the Storage upload fails (keeps Supabase's original message). */
class StorageUploadError extends Error {
  constructor(public details: unknown, message: string) {
    super(message);
    this.name = "StorageUploadError";
  }
}

/**
 * Decode a base64 / data-URL image into a Buffer and upload it to the
 * `reports` bucket using the server-side (service role) client.
 * Returns the public URL.
 */
async function uploadImageToStorage(imageBase64: string): Promise<string> {
  const mimeMatch = imageBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  const contentType = mimeMatch?.[1] ?? "image/jpeg";
  const ext = contentType.split("/")[1].replace("jpeg", "jpg").replace(/\+.*$/, "");

  const raw = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
  const buffer = Buffer.from(raw, "base64");

  const filePath = `damage/report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, buffer, { contentType, cacheControl: "3600", upsert: false });

  if (uploadError) {
    console.error("[Storage Upload Error]", uploadError);
    throw new StorageUploadError(uploadError, uploadError.message);
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
  if (!data?.publicUrl) {
    throw new StorageUploadError(null, "Failed to retrieve public URL for uploaded image.");
  }

  return data.publicUrl;
}

/* ─── Request shape ─────────────────────────────────────────────────── */

interface AttestRequestBody {
  imageBase64: string;
  latitude: number;
  longitude: number;
  severityScore: number;
}

/* ─── Validation helpers ────────────────────────────────────────────── */

function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function isValidSeverity(score: number): boolean {
  return (
    typeof score === "number" &&
    !Number.isNaN(score) &&
    score >= 1 &&
    score <= 100
  );
}

/* ═════════════════════════════════════════════════════════════════════ */

export async function POST(request: Request): Promise<Response> {
  /* ── 1. Parse & validate payload ── */
  let body: AttestRequestBody;

  try {
    body = (await request.json()) as AttestRequestBody;
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const { imageBase64, latitude, longitude, severityScore } = body;

  if (!imageBase64 || typeof imageBase64 !== "string" || imageBase64.length < 100) {
    return Response.json(
      { success: false, error: "Missing or invalid 'imageBase64' field." },
      { status: 400 }
    );
  }

  if (!isValidCoordinate(latitude, longitude)) {
    return Response.json(
      {
        success: false,
        error:
          "Invalid GPS coordinates. Latitude must be -90..90, longitude -180..180.",
      },
      { status: 400 }
    );
  }

  if (!isValidSeverity(severityScore)) {
    return Response.json(
      {
        success: false,
        error: "Severity score must be an integer between 1 and 100.",
      },
      { status: 400 }
    );
  }

  try {
    /* ── 2. Compute SHA-256 hash of the image ── */
    const rawBase64 = imageBase64.includes(",")
      ? imageBase64.split(",")[1]
      : imageBase64;

    const imageHash = createHash("sha256").update(rawBase64).digest("hex");
    console.log(`[Attest] Image SHA-256: ${imageHash.slice(0, 16)}…`);

    /* ── 3. Upload image to Supabase Storage (server-side, service role) ── */
    console.log(`[Attest] Uploading image to Supabase Storage bucket '${STORAGE_BUCKET}'…`);
    const imageUrl = await uploadImageToStorage(imageBase64);
    console.log(`[Attest] ✓ Image URL: ${imageUrl}`);

    /* ── 4. Create on-chain EAS attestation ── */
    console.log("[Attest] Creating on-chain EAS attestation…");
    const { txHash, uid } = await createRoadDamageAttestation({
      imageHash,
      lat: latitude,
      lng: longitude,
      severityScore,
      status: "PENDING_INSPECTION",
    });
    console.log(`[Attest] ✓ UID: ${uid}`);
    console.log(`[Attest] ✓ TX: ${txHash}`);

    /* ── 5. Persist record in Supabase `reports` table ── */
    console.log("[Attest] Saving report to database…");
    const baseRecord = {
      attestation_uid: uid,
      latitude,
      longitude,
      image_url: imageUrl,
      severity_score: Math.round(severityScore),
      status: "PENDING_INSPECTION",
    };

    // Only persist & link a real tx hash (never an attestation UID)
    const validTxHash =
      /^0x[0-9a-fA-F]{64}$/.test(txHash) &&
      txHash.toLowerCase() !== uid.toLowerCase()
        ? txHash
        : null;

    // Try saving tx_hash too (enables BaseScan links). If the
    // optional column hasn't been migrated yet, retry without it.
    const record: typeof baseRecord & { tx_hash?: string } = validTxHash
      ? { ...baseRecord, tx_hash: validTxHash }
      : { ...baseRecord };

    let { error: dbError } = await supabase
      .from("reports")
      .insert(record);

    if (dbError && /tx_hash/i.test(dbError.message)) {
      console.warn(
        "[Attest] 'tx_hash' column missing — run supabase/migrations/20261107_add_tx_hash.sql. Retrying without it."
      );
      ({ error: dbError } = await supabase.from("reports").insert(baseRecord));
    }

    if (dbError) {
      console.error("[Attest] Database insert failed:", dbError);
      // Non-fatal: attestation is already on-chain, report the error but
      // still return success so the user sees their attestation.
    }

    /* ── 6. Build explorer URLs ── */
    const easScanUrl = `https://base-sepolia.easscan.org/attestation/view/${uid}`;
    const baseScanUrl = validTxHash
      ? `https://sepolia.basescan.org/tx/${validTxHash}`
      : "https://sepolia.basescan.org/address/0x4200000000000000000000000000000000000021";

    /* ── 7. Return success response ── */
    return Response.json(
      {
        success: true,
        uid,
        txHash,
        easScanUrl,
        baseScanUrl,
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Attest] ✗ Error:", message);

    // Storage failures: surface Supabase's original error for debugging
    if (err instanceof StorageUploadError) {
      return Response.json(
        {
          success: false,
          error: `Gagal mengunggah gambar ke storage: ${message}`,
          storageError: err.details ?? message,
        },
        { status: 502 }
      );
    }

    // Detect common failure modes and return user-friendly messages
    if (message.includes("zero ETH balance") || message.includes("insufficient funds")) {
      return Response.json(
        {
          success: false,
          error:
            "Relayer wallet tidak memiliki cukup ETH di Base Sepolia. " +
            "Silakan isi saldo melalui faucet terlebih dahulu.",
        },
        { status: 503 }
      );
    }

    if (message.includes("EAS_SCHEMA_UID")) {
      return Response.json(
        {
          success: false,
          error:
            "EAS_SCHEMA_UID belum dikonfigurasi. " +
            "Jalankan: npx tsx scripts/register-schema.ts",
        },
        { status: 500 }
      );
    }

    if (message.includes("PRIVATE_KEY_RELAYER")) {
      return Response.json(
        {
          success: false,
          error:
            "Konfigurasi relayer belum lengkap. Hubungi administrator.",
        },
        { status: 500 }
      );
    }

    return Response.json(
      {
        success: false,
        error: `Gagal menerbitkan atestasi: ${message}`,
      },
      { status: 500 }
    );
  }
}

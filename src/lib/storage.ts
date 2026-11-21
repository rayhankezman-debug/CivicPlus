/**
 * Supabase Storage Helper — Road Report Image Upload
 *
 * Uploads JPEG images (from base64) to the `road-reports` bucket and
 * returns the publicly accessible URL.
 */

import { supabase } from "./supabase";

/**
 * Uploads a base64-encoded JPEG image to Supabase Storage.
 *
 * @param base64Data - Full base64 data-URL or raw base64 string.
 * @returns The public URL of the uploaded image.
 */
export async function uploadReportImage(base64Data: string): Promise<string> {
  /* ── Strip data-URL prefix if present ── */
  const raw = base64Data.includes(",")
    ? base64Data.split(",")[1]
    : base64Data;

  /* ── Decode base64 to Buffer ── */
  const buffer = Buffer.from(raw, "base64");

  /* ── Generate unique filename ── */
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const fileName = `report_${timestamp}_${randomSuffix}.jpg`;
  const filePath = `reports/${fileName}`;

  /* ── Upload to Supabase Storage ── */
  const { error: uploadError } = await supabase.storage
    .from("road-reports")
    .upload(filePath, buffer, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error("[Storage] Upload failed:", uploadError);
    throw new Error(
      `Failed to upload image to Supabase Storage: ${uploadError.message}`
    );
  }

  /* ── Get public URL ── */
  const { data } = supabase.storage
    .from("road-reports")
    .getPublicUrl(filePath);

  if (!data?.publicUrl) {
    throw new Error(
      "Failed to retrieve public URL for uploaded image. " +
        "Ensure the 'road-reports' bucket has public access enabled."
    );
  }

  console.log(`[Storage] ✓ Uploaded: ${data.publicUrl}`);
  return data.publicUrl;
}

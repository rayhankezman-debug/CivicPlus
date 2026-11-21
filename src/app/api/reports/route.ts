/**
 * GET /api/reports
 *
 * Returns all road-damage reports from the Supabase `reports` table,
 * ordered by newest first.  Used by the public map component.
 */

import { createClient } from "@supabase/supabase-js";

/* ─── Supabase (server-side: prefer service role, fallback to anon) ─── */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(): Promise<Response> {
  // `*` so optional columns (e.g. tx_hash, added via migration) are included
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Reports API] Supabase query failed:", error);
    return Response.json(
      { reports: [], error: error.message },
      { status: 500 }
    );
  }

  // Attach the public "after" photo URL (uploaded by /api/resolve) for
  // resolved reports — enables before/after auditing by the public.
  const reports = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id,
    latitude: r.latitude,
    longitude: r.longitude,
    image_url: r.image_url,
    severity_score: r.severity_score,
    status: r.status,
    attestation_uid: r.attestation_uid,
    created_at: r.created_at,
    /** Timestamp when the report was resolved; null for unresolved or legacy rows. */
    resolved_at: r.resolved_at ?? null,
    // Only expose well-formed tx hashes (0x + 64 hex) that aren't the attestation UID
    tx_hash:
      typeof r.tx_hash === "string" &&
      /^0x[0-9a-fA-F]{64}$/.test(r.tx_hash.trim()) &&
      (typeof r.attestation_uid !== "string" ||
        r.tx_hash.trim().toLowerCase() !== r.attestation_uid.trim().toLowerCase())
        ? r.tx_hash.trim()
        : null,
    repair_image_url:
      r.status === "RESOLVED"
        ? supabase.storage.from("reports").getPublicUrl(`repairs/${r.id}.jpg`).data.publicUrl
        : null,
  }));

  return Response.json({ reports }, { status: 200 });
}

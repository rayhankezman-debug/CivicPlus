"use client";

/**
 * PublicMap — interactive Leaflet map showing all road-damage reports.
 *
 * • Red pins → PENDING_INSPECTION (shows severity score)
 * • Green pins → RESOLVED (shows ✓ checkmark)
 *
 * Each popup displays the damage photo, status badge, severity and
 * a link to the on-chain attestation on EAS Scan. Content is role-aware:
 *  • Kontraktor (PIN-verified) → "Selesaikan Perbaikan" button + modal.
 *  • Warga → lock badge (resolution restricted to verified contractors).
 *  • All roles → Before/After comparison on RESOLVED reports + EAS Scan & BaseScan links.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import {
  RefreshCw,
  AlertTriangle,
  MapPin,
  Loader2,
  Camera,
  Upload,
  X,
  CheckCircle2,
  XCircle,
  Wrench,
  ShieldCheck,
  Sparkles,
  ImageIcon,
  Navigation,
} from "lucide-react";
import { compressImage } from "@/lib/compressor";
import { useRole } from "@/components/role/RoleContext";

/* ─── Types ───────────────────────────────────────────────────────────── */

interface Report {
  id: string;
  latitude: number;
  longitude: number;
  image_url: string;
  severity_score: number;
  status: string;
  attestation_uid: string;
  created_at: string;
  /** Base Sepolia tx hash of the EAS attestation (optional column). */
  tx_hash?: string | null;
  /** Public "after" photo URL (only for RESOLVED reports). */
  repair_image_url?: string | null;
  /** Timestamp when the report was marked RESOLVED; null for legacy / unresolved rows. */
  resolved_at?: string | null;
}

interface ResolveResult {
  success: boolean;
  isResolved: boolean;
  spatialMatchConfidence: number;
  workQualityScore: number;
  reason: string;
  error?: string;
}

/* ─── Marker icon factories (L.divIcon — no broken images) ────────── */

function createPendingIcon(severity: number): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -46],
    html: `
      <div style="
        position: relative;
        width: 36px; height: 44px;
        display: flex; align-items: flex-start; justify-content: center;
      ">
        <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 44C18 44 36 26 36 18C36 8.059 27.941 0 18 0C8.059 0 0 8.059 0 18C0 26 18 44 18 44Z" fill="#ef4444"/>
          <circle cx="18" cy="17" r="12" fill="#dc2626"/>
        </svg>
        <span style="
          position: absolute;
          top: 6px; left: 0; right: 0;
          text-align: center;
          color: white;
          font-size: 11px;
          font-weight: 700;
          line-height: 22px;
          text-shadow: 0 1px 2px rgba(0,0,0,0.4);
          pointer-events: none;
        ">${severity}</span>
      </div>
    `,
  });
}

function createResolvedIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -46],
    html: `
      <div style="
        position: relative;
        width: 36px; height: 44px;
        display: flex; align-items: flex-start; justify-content: center;
      ">
        <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 44C18 44 36 26 36 18C36 8.059 27.941 0 18 0C8.059 0 0 8.059 0 18C0 26 18 44 18 44Z" fill="#22c55e"/>
          <circle cx="18" cy="17" r="12" fill="#16a34a"/>
        </svg>
        <span style="
          position: absolute;
          top: 6px; left: 0; right: 0;
          text-align: center;
          color: white;
          font-size: 14px;
          font-weight: 700;
          line-height: 22px;
          text-shadow: 0 1px 2px rgba(0,0,0,0.4);
          pointer-events: none;
        ">✓</span>
      </div>
    `,
  });
}

/* ─── Overlapping marker helpers ──────────────────────────────────────── */

/**
 * Reports whose raw coordinates are within this distance (degrees) are
 * considered "at the same spot". ~5 m ≈ 0.000045°.
 */
const OVERLAP_THRESHOLD_DEG = 0.00005;

/** Report enriched with display coordinates and cluster metadata. */
interface SpreadReport extends Report {
  /** Latitude to display the marker at (may be offset). */
  displayLat: number;
  /** Longitude to display the marker at (may be offset). */
  displayLng: number;
  /** How many reports share (roughly) the same coordinates. */
  nearbyCount: number;
}

/**
 * Groups reports that sit at (nearly) the same coordinates and applies a
 * small deterministic radial offset so the resulting markers fan out and
 * remain individually clickable.
 *
 * The offset is tiny (~0.0001° ≈ 11 m at the equator) and purely visual —
 * the popup and all data still reference the original coordinates.
 */
function spreadOverlapping(reports: Report[]): SpreadReport[] {
  // Group by rounded coordinate key
  const buckets = new Map<string, Report[]>();
  for (const r of reports) {
    const key = `${Math.round(r.latitude / OVERLAP_THRESHOLD_DEG)}:${Math.round(r.longitude / OVERLAP_THRESHOLD_DEG)}`;
    const arr = buckets.get(key);
    if (arr) arr.push(r);
    else buckets.set(key, [r]);
  }

  const result: SpreadReport[] = [];

  for (const group of buckets.values()) {
    const count = group.length;
    if (count === 1) {
      result.push({ ...group[0], displayLat: group[0].latitude, displayLng: group[0].longitude, nearbyCount: 1 });
      continue;
    }

    // Fan out in a circle — radius grows slightly with more items
    const radiusDeg = 0.00012 + count * 0.000015; // ~13-25 m visual spread
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2; // start from top
      result.push({
        ...group[i],
        displayLat: group[i].latitude + radiusDeg * Math.sin(angle),
        displayLng: group[i].longitude + radiusDeg * Math.cos(angle),
        nearbyCount: count,
      });
    }
  }

  return result;
}

/* ─── Transparency / audit helpers ────────────────────────────────────── */

/** Image with graceful "not available" fallback. */
function AuditImage({ src, alt, emptyText }: { src?: string | null; alt: string; emptyText: string }) {
  const [failed, setFailed] = useState(false);
  const boxStyle: React.CSSProperties = {
    width: "100%",
    height: 110,
    borderRadius: 8,
    overflow: "hidden",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  if (!src || failed) {
    return (
      <div style={{ ...boxStyle, fontSize: 10, color: "#71717a", textAlign: "center", padding: 8 }}>
        {emptyText}
      </div>
    );
  }

  return (
    <div style={boxStyle}>
      {/* eslint-disable-next-line @next/next/no-img-element -- remote Supabase URL inside Leaflet popup */}
      <img
        src={src}
        alt={alt}
        onError={() => setFailed(true)}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    </div>
  );
}

/** Side-by-side Before / After comparison shown on RESOLVED reports. */
function BeforeAfterPanel({ report }: { report: Report }) {
  const label = (text: string, color: string, bg: string): React.ReactNode => (
    <span
      style={{
        display: "inline-block",
        marginBottom: 4,
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color,
        background: bg,
      }}
    >
      {text}
    </span>
  );

  const resolvedAt = report.resolved_at
    ? new Date(report.resolved_at).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div style={{ padding: "12px 14px 0" }}>
      <div style={{ fontSize: 10, color: "#38bdf8", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
        👁 Audit Transparansi
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          {label("Sebelum", "#f87171", "rgba(239,68,68,0.15)")}
          <AuditImage src={report.image_url} alt="Sebelum perbaikan" emptyText="Foto tidak tersedia" />
        </div>
        <div>
          {label("Sesudah", "#4ade80", "rgba(34,197,94,0.15)")}
          <AuditImage
            src={report.status === "RESOLVED" ? report.repair_image_url : null}
            alt="Setelah perbaikan"
            emptyText={report.status === "RESOLVED" ? "Foto sesudah perbaikan tidak diarsipkan" : "Belum diperbaiki"}
          />
        </div>
      </div>
      <div style={{ fontSize: 10, color: "#71717a", marginTop: 6, lineHeight: 1.7 }}>
        <div>Severity awal: <strong style={{ color: "#e4e4e7" }}>{report.severity_score}</strong></div>
        {resolvedAt && (
          <div>✅ Selesai diperbaiki: <strong style={{ color: "#4ade80" }}>{resolvedAt}</strong></div>
        )}
        {!resolvedAt && report.status === "RESOLVED" && (
          <div style={{ color: "#52525b" }}>✅ Waktu penyelesaian belum tercatat</div>
        )}
      </div>
    </div>
  );
}

const linkStyle = (color: string, bg: string, border: string): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "6px 12px",
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 600,
  background: bg,
  color,
  border: `1px solid ${border}`,
  textDecoration: "none",
  width: "100%",
  marginBottom: 8,
});

/** A real EVM tx hash: `0x` + 64 hex chars. Anything else (null, "", legacy
 *  placeholders, attestation UIDs stored by mistake, …) is treated as missing. */
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function getValidTxHash(
  txHash: string | null | undefined,
  attestationUid?: string | null
): string | null {
  const trimmed = typeof txHash === "string" ? txHash.trim() : "";
  if (!TX_HASH_RE.test(trimmed)) return null;
  if (
    attestationUid &&
    trimmed.toLowerCase() === attestationUid.trim().toLowerCase()
  ) {
    return null;
  }
  return trimmed;
}

/** EAS Scan link for everyone; BaseScan tx link shown when txHash exists. */
function ExplorerLinks({ report }: { report: Report }) {
  if (!report.attestation_uid) return null;

  // Only link to /tx/ when the hash is present, well-formed, and not an
  // attestation UID stored by mistake.
  const txHash = getValidTxHash(report.tx_hash, report.attestation_uid);

  return (
    <div>
      <a
        href={`https://base-sepolia.easscan.org/attestation/view/${report.attestation_uid}`}
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle(
          "#34d399",
          "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(20,184,166,0.15))",
          "rgba(16,185,129,0.25)"
        )}
      >
        🔗 Lihat Attestation di EAS Scan
      </a>

      {txHash && (
        <a
          href={`https://sepolia.basescan.org/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Lihat transaksi on-chain di BaseScan"
          style={linkStyle(
            "#60a5fa",
            "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(99,102,241,0.15))",
            "rgba(59,130,246,0.25)"
          )}
        >
          ⛓ Lihat Transaksi di BaseScan
        </a>
      )}
    </div>
  );
}

/* ─── FitBounds helper ────────────────────────────────────────────────── */

function FitBounds({ reports }: { reports: Report[] }) {
  const map = useMap();

  useEffect(() => {
    if (reports.length === 0) return;
    const bounds = L.latLngBounds(
      reports.map((r) => [r.latitude, r.longitude] as [number, number])
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [reports, map]);

  return null;
}

/* ═════════════════════════ CONTRACTOR MODAL ══════════════════════════ */

function ContractorModal({
  report,
  contractorToken,
  onClose,
  onResolved,
  onUnauthorized,
}: {
  report: Report;
  contractorToken: string;
  onClose: () => void;
  onResolved: (reportId: string) => void;
  onUnauthorized: () => void;
}) {
  const [repairImage, setRepairImage] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  /* ── GPS location state ── */
  type GpsStatus = "pending" | "acquiring" | "ok" | "denied" | "unavailable";
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("pending");
  const [gpsCoords, setGpsCoords] = useState<GeolocationCoordinates | null>(null);

  /* Acquire GPS on modal mount */
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGpsStatus("unavailable");
      return;
    }
    setGpsStatus("acquiring");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords(pos.coords);
        setGpsStatus("ok");
      },
      () => {
        setGpsStatus("denied");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 }
    );
  }, []);

  /* ── Cleanup camera on unmount ── */
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  /* ── Handle file upload ── */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    setError(null);
    try {
      const compressed = await compressImage(file);
      setRepairImage(compressed);
    } catch {
      setError("Gagal memproses gambar. Coba lagi.");
    } finally {
      setIsCompressing(false);
    }
  };

  /* ── Camera capture (smart fallback) ── */
  const startCamera = async () => {
    setError(null);

    let stream: MediaStream | null = null;

    // Strategy 1: try getUserMedia with rear camera preference
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
      });
    } catch {
      // Strategy 2: try any available camera
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      } catch {
        // Strategy 3: silently fall back to native camera input
        cameraInputRef.current?.click();
        return;
      }
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play();
    }
    setCameraActive(true);
  };

  const capturePhoto = async () => {
    if (!videoRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);

    // Stop camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);

    setIsCompressing(true);
    try {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const compressed = await compressImage(dataUrl);
      setRepairImage(compressed);
    } catch {
      setError("Gagal memproses foto.");
    } finally {
      setIsCompressing(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  /* ── Verify with AI ── */
  const handleVerify = async () => {
    if (!repairImage) return;

    setIsVerifying(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${contractorToken}`,
        },
        body: JSON.stringify({
          reportId: report.id,
          originalImageUrl: report.image_url,
          repairImageBase64: repairImage,
          // GPS proximity fields
          report_lat: report.latitude,
          report_lng: report.longitude,
          ...(gpsCoords
            ? {
                resolver_lat: gpsCoords.latitude,
                resolver_lng: gpsCoords.longitude,
                resolver_accuracy: gpsCoords.accuracy,
              }
            : {}),
        }),
      });

      const json = (await res.json()) as ResolveResult;

      if (res.status === 401) {
        setError(json.error || "Sesi kontraktor tidak valid. Silakan login ulang.");
        onUnauthorized();
        return;
      }

      if (!res.ok) {
        setError(json.error || `HTTP ${res.status}`);
        return;
      }

      setResult(json);

      if (json.isResolved) {
        onResolved(report.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghubungi server.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => { stopCamera(); onClose(); }}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-white/[0.08] bg-zinc-900/95 backdrop-blur-2xl shadow-2xl shadow-black/60">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-5 pb-4 border-b border-white/[0.06] bg-zinc-900/95 backdrop-blur-xl rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/25 to-orange-500/15 border border-amber-500/25 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                Portal Resolusi Kontraktor
              </h3>
              <p className="text-xs text-zinc-500">
                Verifikasi AI Sebelum / Sesudah
              </p>
            </div>
          </div>
          <button
            onClick={() => { stopCamera(); onClose(); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* ── GPS Location Status ── */}
          <div className={`flex items-start gap-2.5 rounded-xl p-3 text-xs ${
            gpsStatus === "ok"
              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
              : gpsStatus === "acquiring"
              ? "bg-sky-500/10 border border-sky-500/20 text-sky-400"
              : "bg-amber-500/10 border border-amber-500/20 text-amber-400"
          }`}>
            {gpsStatus === "acquiring" ? (
              <Loader2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 animate-spin" />
            ) : gpsStatus === "ok" ? (
              <Navigation className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            )}
            <div className="leading-relaxed">
              {gpsStatus === "pending" && "Mendeteksi lokasi GPS perangkat…"}
              {gpsStatus === "acquiring" && "Mengambil koordinat GPS perangkat Anda…"}
              {gpsStatus === "ok" && gpsCoords && (
                <>
                  📍 Lokasi terdeteksi: {gpsCoords.latitude.toFixed(5)}, {gpsCoords.longitude.toFixed(5)}
                  {" "}(±{Math.round(gpsCoords.accuracy)} m) —{" "}
                  <span className="font-semibold">validasi jarak akan dilakukan server</span>
                </>
              )}
              {gpsStatus === "denied" && (
                <>
                  <span className="font-semibold">Izin GPS ditolak.</span> Verifikasi akan dilanjutkan tanpa validasi lokasi otomatis.
                  Pastikan Anda benar-benar berada di titik perbaikan jalan yang dilaporkan.
                </>
              )}
              {gpsStatus === "unavailable" && (
                <>
                  <span className="font-semibold">GPS tidak tersedia.</span> Verifikasi akan dilanjutkan tanpa validasi lokasi otomatis.
                  Pastikan Anda benar-benar berada di titik perbaikan jalan yang dilaporkan.
                </>
              )}
            </div>
          </div>

          {/* ── Before image (original damage) ── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/25">
                Sebelum
              </span>
              <span className="text-xs text-zinc-500">
                Foto kerusakan awal
              </span>
            </div>
            <div className="rounded-2xl overflow-hidden border border-white/[0.06]">
              <img
                src={report.image_url}
                alt="Kerusakan awal"
                className="w-full h-44 object-cover"
              />
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-500">
              <span>📍 {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}</span>
              <span>·</span>
              <span>Severity: {report.severity_score}</span>
            </div>
          </div>

          {/* ── After image (repair photo) ── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                Sesudah
              </span>
              <span className="text-xs text-zinc-500">
                Foto hasil perbaikan
              </span>
            </div>

            {repairImage ? (
              <div className="relative rounded-2xl overflow-hidden border border-white/[0.06]">
                <img
                  src={repairImage}
                  alt="Hasil perbaikan"
                  className="w-full h-44 object-cover"
                />
                <button
                  onClick={() => {
                    setRepairImage(null);
                    setResult(null);
                  }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : cameraActive ? (
              <div className="relative rounded-2xl overflow-hidden border border-white/[0.06]">
                <video
                  ref={videoRef}
                  className="w-full h-44 object-cover"
                  autoPlay
                  playsInline
                  muted
                />
                <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-3">
                  <button
                    onClick={capturePhoto}
                    className="w-14 h-14 rounded-full bg-white border-4 border-white/30 shadow-lg hover:scale-105 transition-transform"
                  />
                  <button
                    onClick={stopCamera}
                    className="w-10 h-10 rounded-full bg-red-500/80 flex items-center justify-center text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.02] p-8">
                {isCompressing ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                    <span className="text-xs text-zinc-400">Mengompres gambar…</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <ImageIcon className="w-10 h-10 text-zinc-600" />
                    <p className="text-xs text-zinc-500 text-center">
                      Unggah atau ambil foto lokasi <strong>setelah perbaikan</strong>
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={startCamera}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                      >
                        <Camera className="w-4 h-4" />
                        Kamera
                      </button>
                      <button
                        onClick={() => { setError(null); fileInputRef.current?.click(); }}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium bg-white/[0.04] text-zinc-300 border border-white/[0.08] hover:bg-white/[0.08] transition-colors"
                      >
                        <Upload className="w-4 h-4" />
                        Unggah File
                      </button>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    {/* Hidden capture input — mobile fallback if getUserMedia is denied */}
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Error display ── */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ── Verify button ── */}
          {repairImage && !result && (
            <button
              onClick={handleVerify}
              disabled={isVerifying}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all duration-300 bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AI sedang menganalisis…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Verifikasi Perbaikan dengan AI
                </>
              )}
            </button>
          )}

          {/* ── Result display ── */}
          {result && (
            <div
              className={`rounded-2xl border p-5 space-y-4 ${
                result.isResolved
                  ? "bg-emerald-500/5 border-emerald-500/20"
                  : "bg-red-500/5 border-red-500/20"
              }`}
            >
              {/* Header */}
              <div className="flex items-center gap-3">
                {result.isResolved ? (
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6 text-emerald-400" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-red-500/20 flex items-center justify-center">
                    <XCircle className="w-6 h-6 text-red-400" />
                  </div>
                )}
                <div>
                  <h4
                    className={`text-sm font-bold ${
                      result.isResolved ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {result.isResolved
                      ? "✅ Perbaikan Terverifikasi!"
                      : "❌ Perbaikan Belum Valid"}
                  </h4>
                  <p className="text-xs text-zinc-500">
                    {result.isResolved
                      ? "Status laporan diperbarui menjadi RESOLVED"
                      : "Silakan cek kembali lokasi dan kualitas perbaikan"}
                  </p>
                </div>
              </div>

              {/* Scores */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                    Kecocokan Spasial
                  </div>
                  <div
                    className={`text-xl font-bold ${
                      result.spatialMatchConfidence >= 0.7
                        ? "text-emerald-400"
                        : result.spatialMatchConfidence >= 0.5
                        ? "text-amber-400"
                        : "text-red-400"
                    }`}
                  >
                    {Math.round(result.spatialMatchConfidence * 100)}%
                  </div>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                    Kualitas Perbaikan
                  </div>
                  <div
                    className={`text-xl font-bold ${
                      result.workQualityScore >= 70
                        ? "text-emerald-400"
                        : result.workQualityScore >= 50
                        ? "text-amber-400"
                        : "text-red-400"
                    }`}
                  >
                    {result.workQualityScore}/100
                  </div>
                </div>
              </div>

              {/* Reason */}
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-3">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  Analisis AI
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {result.reason}
                </p>
              </div>

              {/* Close on success */}
              {result.isResolved && (
                <button
                  onClick={onClose}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Tutup & Kembali ke Peta
                </button>
              )}

              {/* Retry on failure */}
              {!result.isResolved && (
                <button
                  onClick={() => {
                    setRepairImage(null);
                    setResult(null);
                    setError(null);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  Ambil Ulang Foto Perbaikan
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════ MAIN COMPONENT ════════════════════════════ */

export default function PublicMap() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalReport, setModalReport] = useState<Report | null>(null);
  const { role, contractorToken, logoutContractor } = useRole();
  const isContractor = role === "contractor" && !!contractorToken;

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setReports(json.reports ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    fetchReports();
  }, [fetchReports]);

  /* ── Handle resolution: update local state immediately ── */
  const handleResolved = useCallback((reportId: string) => {
    setReports((prev) =>
      prev.map((r) =>
        r.id === reportId ? { ...r, status: "RESOLVED" } : r
      )
    );
    // Re-sync in the background to pick up the archived "after" photo URL
    void fetchReports();
  }, [fetchReports]);

  /* ── Default center: Indonesia (roughly) ── */
  const defaultCenter: [number, number] = [-6.2, 106.816];

  /* ── Spread overlapping markers for clickability ── */
  const spreadReports = useMemo(() => spreadOverlapping(reports), [reports]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-emerald-400" />
          <span className="text-xs text-zinc-400">
            {loading
              ? "Memuat laporan…"
              : `${reports.length} laporan ditemukan`}
          </span>
        </div>
        <button
          onClick={fetchReports}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Map container */}
      <div className="relative rounded-2xl overflow-hidden border border-white/[0.07] shadow-2xl shadow-black/50" style={{ height: 480 }}>
        {loading && reports.length === 0 && (
          <div className="absolute inset-0 z-[999] flex items-center justify-center bg-zinc-900/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
              <span className="text-xs text-zinc-400">Memuat peta…</span>
            </div>
          </div>
        )}

        <MapContainer
          center={defaultCenter}
          zoom={12}
          scrollWheelZoom={true}
          className="h-full w-full"
          style={{ height: "100%", width: "100%", background: "#09090b" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            className="map-tiles"
          />

          {spreadReports.map((report) => (
            <Marker
              key={report.id}
              position={[report.displayLat, report.displayLng]}
              icon={
                report.status === "RESOLVED"
                  ? createResolvedIcon()
                  : createPendingIcon(report.severity_score)
              }
            >
              <Popup
                maxWidth={300}
                minWidth={260}
                className="civic-popup"
              >
                <div
                  style={{
                    fontFamily: "Inter, system-ui, sans-serif",
                    background: "#18181b",
                    color: "#e4e4e7",
                    borderRadius: "12px",
                    overflow: "hidden",
                    minWidth: 250,
                  }}
                >
                  {/* Nearby reports indicator */}
                  {report.nearbyCount > 1 && (
                    <div
                      style={{
                        padding: "6px 14px",
                        fontSize: 11,
                        fontWeight: 600,
                        background: "rgba(99,102,241,0.12)",
                        color: "#818cf8",
                        borderBottom: "1px solid rgba(99,102,241,0.15)",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      📌 {report.nearbyCount} laporan di area ini
                    </div>
                  )}
                  {/* Before / After shown for RESOLVED reports (all roles) */}
                  {report.status === "RESOLVED" && (
                    <BeforeAfterPanel report={report} />
                  )}

                  {/* Damage image — shown when no Before/After panel */}
                  {report.status !== "RESOLVED" && report.image_url && (
                    <div style={{ position: "relative", width: "100%", height: 160, overflow: "hidden" }}>
                      <img
                        src={report.image_url}
                        alt="Kerusakan jalan"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                      {/* Severity overlay badge */}
                      <div
                        style={{
                          position: "absolute",
                          top: 8,
                          right: 8,
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          background:
                            report.severity_score >= 70
                              ? "rgba(239,68,68,0.9)"
                              : report.severity_score >= 40
                              ? "rgba(245,158,11,0.9)"
                              : "rgba(34,197,94,0.9)",
                          color: "white",
                          backdropFilter: "blur(4px)",
                        }}
                      >
                        Severity: {report.severity_score}
                      </div>
                    </div>
                  )}

                  {/* Info section */}
                  <div style={{ padding: "12px 14px 14px" }}>
                    {/* Status badge */}
                    <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "3px 10px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 600,
                          background:
                            report.status === "RESOLVED"
                              ? "rgba(34,197,94,0.15)"
                              : "rgba(239,68,68,0.15)",
                          color:
                            report.status === "RESOLVED"
                              ? "#4ade80"
                              : "#f87171",
                          border: `1px solid ${
                            report.status === "RESOLVED"
                              ? "rgba(34,197,94,0.3)"
                              : "rgba(239,68,68,0.3)"
                          }`,
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background:
                              report.status === "RESOLVED"
                                ? "#22c55e"
                                : "#ef4444",
                          }}
                        />
                        {report.status === "RESOLVED"
                          ? "Resolved"
                          : "Menunggu Inspeksi"}
                      </span>
                    </div>

                    {/* Coords + timestamps */}
                    <div
                      style={{
                        fontSize: 11,
                        color: "#71717a",
                        marginBottom: 10,
                        lineHeight: 1.7,
                      }}
                    >
                      <div>
                        📍 {report.latitude.toFixed(5)},{" "}
                        {report.longitude.toFixed(5)}
                      </div>
                      <div>
                        🕐 Dilaporkan:{" "}
                        {new Date(report.created_at).toLocaleDateString(
                          "id-ID",
                          {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )}
                      </div>
                      {report.status === "RESOLVED" && (
                        <div>
                          {report.resolved_at ? (
                            <>
                              ✅ Selesai diperbaiki:{" "}
                              <span style={{ color: "#4ade80" }}>
                                {new Date(report.resolved_at).toLocaleDateString(
                                  "id-ID",
                                  {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }
                                )}
                              </span>
                            </>
                          ) : (
                            <span style={{ color: "#52525b" }}>
                              ✅ Waktu penyelesaian belum tercatat
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* On-chain proof links (EAS Scan + BaseScan when tx hash exists) */}
                    <ExplorerLinks report={report} />

                    {/* Resolution access — contractor only; others see a lock badge */}
                    {report.status !== "RESOLVED" &&
                      (isContractor ? (
                        <button
                          onClick={() => setModalReport(report)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            width: "100%",
                            padding: "7px 12px",
                            borderRadius: 8,
                            fontSize: 11,
                            fontWeight: 600,
                            background:
                              "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(249,115,22,0.15))",
                            color: "#fbbf24",
                            border: "1px solid rgba(245,158,11,0.25)",
                            cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                        >
                          🔧 Klaim & Selesaikan Perbaikan (Kontraktor)
                        </button>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            width: "100%",
                            padding: "7px 10px",
                            borderRadius: 8,
                            fontSize: 10.5,
                            fontWeight: 600,
                            background: "rgba(113,113,122,0.12)",
                            color: "#a1a1aa",
                            border: "1px dashed rgba(161,161,170,0.3)",
                            textAlign: "center",
                            lineHeight: 1.4,
                          }}
                        >
                          🔒 Hanya dapat diselesaikan oleh Kontraktor terverifikasi
                        </div>
                      ))}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {reports.length > 0 && <FitBounds reports={reports} />}
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 justify-center text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
          <span>Menunggu Inspeksi</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
          <span>Resolved</span>
        </div>
      </div>

      {/* ── Contractor Resolution Modal (contractor role only) ── */}
      {modalReport && isContractor && contractorToken && (
        <ContractorModal
          report={modalReport}
          contractorToken={contractorToken}
          onClose={() => setModalReport(null)}
          onResolved={handleResolved}
          onUnauthorized={() => {
            setModalReport(null);
            logoutContractor();
          }}
        />
      )}

      {/* Custom popup styles — override Leaflet defaults for dark theme */}
      <style>{`
        .civic-popup .leaflet-popup-content-wrapper {
          background: transparent !important;
          box-shadow: none !important;
          border-radius: 12px !important;
          padding: 0 !important;
        }
        .civic-popup .leaflet-popup-content {
          margin: 0 !important;
          line-height: normal !important;
        }
        .civic-popup .leaflet-popup-tip {
          background: #18181b !important;
          box-shadow: none !important;
        }
        .leaflet-popup-close-button {
          color: #a1a1aa !important;
          font-size: 18px !important;
          top: 4px !important;
          right: 6px !important;
          z-index: 10 !important;
        }
        .leaflet-popup-close-button:hover {
          color: #e4e4e7 !important;
        }
      `}</style>
    </div>
  );
}

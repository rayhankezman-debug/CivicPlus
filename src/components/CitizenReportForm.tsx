"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Webcam from "react-webcam";
import {
  Camera,
  Upload,
  MapPin,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Scan,
  WifiOff,
  ShieldAlert,
  Gauge,
  Send,
  ExternalLink,
  Link2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { compressImage } from "@/lib/compressor";

/* ═══════════════════════════ Types ════════════════════════════════════ */

interface GpsCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface VerifyResult {
  isValidRoadDamage: boolean;
  severityScore: number;
  confidence: number;
  reason: string;
}

interface AttestResult {
  success: boolean;
  uid: string;
  txHash: string;
  easScanUrl: string;
  baseScanUrl: string;
  error?: string;
  /** Original Supabase Storage error (returned by /api/attest on upload failure). */
  storageError?: unknown;
}

type InputMode = "camera" | "upload";
type GpsStatus = "idle" | "loading" | "success" | "denied" | "error";
type AttestStatus = "idle" | "submitting" | "success" | "error";

/* ═══════════════════════════ Sub-components ═══════════════════════════ */

/* ── GPS Status Indicator ─────────────────────────────────────────── */
function GpsIndicator({
  status,
  coords,
  onRequest,
}: {
  status: GpsStatus;
  coords: GpsCoords | null;
  onRequest: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-white uppercase tracking-wider">
            Lokasi GPS
          </span>
        </div>

        {status === "idle" && (
          <button
            onClick={onRequest}
            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors px-3 py-1 rounded-full border border-emerald-500/30 hover:border-emerald-400/50"
          >
            Aktifkan
          </button>
        )}

        {status === "loading" && (
          <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
        )}

        {status === "success" && coords && (
          <span className="text-[10px] text-emerald-400/70 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            ±{Math.round(coords.accuracy)}m akurasi
          </span>
        )}

        {(status === "denied" || status === "error") && (
          <WifiOff className="w-4 h-4 text-red-400" />
        )}
      </div>

      {status === "idle" && (
        <p className="text-xs text-zinc-500">
          Klik &apos;Aktifkan&apos; untuk mendeteksi posisi lapangan.
        </p>
      )}

      {status === "loading" && (
        <p className="text-xs text-zinc-400 animate-pulse">
          Mendeteksi koordinat GPS...
        </p>
      )}

      {status === "success" && coords && (
        <div className="grid grid-cols-2 gap-2 mt-1">
          <div className="text-xs">
            <span className="text-zinc-500">Lat </span>
            <span className="text-zinc-200 font-mono">
              {coords.latitude.toFixed(6)}
            </span>
          </div>
          <div className="text-xs">
            <span className="text-zinc-500">Long </span>
            <span className="text-zinc-200 font-mono">
              {coords.longitude.toFixed(6)}
            </span>
          </div>
        </div>
      )}

      {status === "denied" && (
        <p className="text-xs text-red-400">
          Akses GPS ditolak. Aktifkan izin lokasi di pengaturan browser.
        </p>
      )}

      {status === "error" && (
        <p className="text-xs text-orange-400">
          Gagal mendapatkan lokasi. Coba lagi atau periksa sinyal GPS.
        </p>
      )}
    </div>
  );
}

/* ── Severity Gauge ───────────────────────────────────────────────── */
function SeverityGauge({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const isLow = pct < 40;
  const isMid = pct >= 40 && pct < 70;
  const isHigh = pct >= 70;

  const color = isHigh
    ? "from-red-500 to-red-600"
    : isMid
    ? "from-orange-400 to-orange-500"
    : "from-yellow-400 to-yellow-500";

  const label = isHigh ? "Parah" : isMid ? "Sedang" : "Ringan";
  const textColor = isHigh
    ? "text-red-400"
    : isMid
    ? "text-orange-400"
    : "text-yellow-400";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Gauge className="w-4 h-4 text-zinc-400" />
          <span className="text-xs text-zinc-400">Severity Score</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${textColor}`}>{pct}</span>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
              isHigh
                ? "text-red-400 border-red-500/30 bg-red-500/10"
                : isMid
                ? "text-orange-400 border-orange-500/30 bg-orange-500/10"
                : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
            }`}
          >
            {label}
          </span>
        </div>
      </div>
      <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ─────────────────── Loading spinner overlay ─────────────────────── */
function AnalyzingOverlay() {
  return (
    <div className="absolute inset-0 rounded-2xl bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center z-10 gap-4">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-2 border-emerald-500/30 flex items-center justify-center">
          <Scan className="w-7 h-7 text-emerald-400 animate-pulse" />
        </div>
        <span className="absolute inset-0 rounded-full border-t-2 border-emerald-400 animate-spin" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-white">Menganalisis gambar...</p>
        <p className="text-xs text-zinc-400 mt-1">AI sedang mengevaluasi kerusakan jalan</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════ MAIN COMPONENT ═══════════════════════════ */

export default function CitizenReportForm() {
  /* ── State ── */
  const [inputMode, setInputMode] = useState<InputMode>("camera");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const [gpsCoords, setGpsCoords] = useState<GpsCoords | null>(null);

  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  /* ── Phase 3: Attestation state ── */
  const [attestStatus, setAttestStatus] = useState<AttestStatus>("idle");
  const [attestResult, setAttestResult] = useState<AttestResult | null>(null);
  const [attestError, setAttestError] = useState<string | null>(null);

  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Auto-request GPS on mount ── */
  useEffect(() => {
    requestGps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── GPS ── */
  function requestGps() {
    if (!navigator.geolocation) {
      setGpsStatus("error");
      return;
    }
    setGpsStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setGpsStatus("success");
      },
      (err) => {
        setGpsStatus(err.code === 1 ? "denied" : "error");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  /* ── Camera capture ── */
  const handleCapture = useCallback(() => {
    if (!webcamRef.current) return;
    const screenshot = webcamRef.current.getScreenshot();
    if (screenshot) {
      compressImage(screenshot)
        .then((compressed) => {
          setCapturedImage(compressed);
          setVerifyResult(null);
          setVerifyError(null);
          resetAttestState();
        })
        .catch(console.error);
    }
  }, []);

  const handleRetake = () => {
    setCapturedImage(null);
    setVerifyResult(null);
    setVerifyError(null);
    resetAttestState();
  };

  /* ── File upload ── */
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const compressed = await compressImage(file);
        setCapturedImage(compressed);
        setVerifyResult(null);
        setVerifyError(null);
        resetAttestState();
      } catch {
        setVerifyError("Gagal memproses gambar. Coba file lain.");
      }
      // Reset file input so the same file can be re-selected
      e.target.value = "";
    },
    []
  );

  /* ── AI Verification ── */
  const handleVerify = async () => {
    if (!capturedImage) return;
    setIsVerifying(true);
    setVerifyResult(null);
    setVerifyError(null);
    resetAttestState();

    try {
      const res = await fetch("/api/verify-damage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: capturedImage }),
      });

      const data = (await res.json()) as VerifyResult & { error?: string };

      if (data.error) {
        setVerifyError(data.error);
      } else {
        setVerifyResult(data);
      }
    } catch {
      setVerifyError(
        "Koneksi ke server gagal. Periksa jaringan dan coba lagi."
      );
    } finally {
      setIsVerifying(false);
    }
  };

  /* ── Phase 3: Attestation helpers ── */
  function resetAttestState() {
    setAttestStatus("idle");
    setAttestResult(null);
    setAttestError(null);
  }

  function resetAll() {
    setCapturedImage(null);
    setVerifyResult(null);
    setVerifyError(null);
    resetAttestState();
    setIsCameraReady(false);
  }

  const handleAttest = async () => {
    if (!capturedImage || !verifyResult?.isValidRoadDamage || !gpsCoords) return;

    setAttestStatus("submitting");
    setAttestError(null);
    setAttestResult(null);

    try {
      // Image is sent as base64 to the backend, which uploads it to Supabase
      // Storage with the service-role key (no direct browser → Storage upload).
      const res = await fetch("/api/attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: capturedImage,
          latitude: gpsCoords.latitude,
          longitude: gpsCoords.longitude,
          severityScore: verifyResult.severityScore,
        }),
      });

      const data = (await res.json()) as AttestResult;

      if (!data.success) {
        if (data.storageError !== undefined) {
          const uploadError = data.storageError;
          console.error("[Storage Upload Error]", uploadError);
        } else {
          console.error("[Attest Error]", res.status, data.error);
        }
        setAttestStatus("error");
        setAttestError(data.error ?? "Gagal menerbitkan atestasi on-chain.");
        return;
      }

      setAttestResult(data);
      setAttestStatus("success");
    } catch {
      setAttestStatus("error");
      setAttestError(
        "Koneksi ke server gagal saat mengirim ke blockchain. Coba lagi."
      );
    }
  };

  /* ── Derived ── */
  const canVerify = !!capturedImage && !isVerifying;
  const canAttest =
    verifyResult?.isValidRoadDamage === true &&
    gpsCoords !== null &&
    attestStatus !== "submitting" &&
    attestStatus !== "success";

  /* ═══════════════════════════ Render ═════════════════════════════════ */
  return (
    <div className="w-full space-y-5">
      {/* ── GPS Section ── */}
      <GpsIndicator
        status={gpsStatus}
        coords={gpsCoords}
        onRequest={requestGps}
      />

      {/* ── Input Mode Tabs ── */}
      <div className="flex rounded-xl border border-white/[0.07] bg-white/[0.03] p-1 gap-1">
        {(["camera", "upload"] as InputMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => {
              setInputMode(mode);
              handleRetake();
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-300 ${
              inputMode === mode
                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            {mode === "camera" ? (
              <Camera className="w-3.5 h-3.5" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            {mode === "camera" ? "Kamera Langsung" : "Unggah Foto"}
          </button>
        ))}
      </div>

      {/* ── Camera / Upload Area ── */}
      <div className="relative rounded-2xl overflow-hidden border border-white/[0.07] bg-black/40 aspect-video flex items-center justify-center">
        {isVerifying && <AnalyzingOverlay />}

        {/* ── Camera Mode ── */}
        {inputMode === "camera" && (
          <>
            {!capturedImage ? (
              <>
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  screenshotQuality={0.95}
                  videoConstraints={{ facingMode: { ideal: "environment" } }}
                  onUserMedia={() => setIsCameraReady(true)}
                  onUserMediaError={() => setIsCameraReady(false)}
                  className="w-full h-full object-cover"
                />
                {/* Viewfinder overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-emerald-400/60 rounded-tl-sm" />
                  <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-emerald-400/60 rounded-tr-sm" />
                  <div className="absolute bottom-14 left-3 w-6 h-6 border-b-2 border-l-2 border-emerald-400/60 rounded-bl-sm" />
                  <div className="absolute bottom-14 right-3 w-6 h-6 border-b-2 border-r-2 border-emerald-400/60 rounded-br-sm" />
                </div>
                {/* Capture button */}
                <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                  <button
                    onClick={handleCapture}
                    disabled={!isCameraReady}
                    className="w-14 h-14 rounded-full bg-white/90 hover:bg-white border-4 border-emerald-400 flex items-center justify-center shadow-2xl shadow-emerald-500/30 transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Camera className="w-6 h-6 text-emerald-700" />
                  </button>
                </div>
              </>
            ) : (
              /* Preview captured photo */
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={capturedImage}
                  alt="Foto kerusakan jalan yang diambil"
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={handleRetake}
                  className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-xs text-white hover:bg-black/80 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Ulangi
                </button>
              </>
            )}
          </>
        )}

        {/* ── Upload Mode ── */}
        {inputMode === "upload" && (
          <>
            {!capturedImage ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-3 text-center p-8 w-full h-full hover:bg-white/[0.02] transition-colors group"
              >
              <div className="w-14 h-14 rounded-2xl border-2 border-dashed border-zinc-600 group-hover:border-emerald-500/60 flex items-center justify-center transition-colors">
                <Upload className="w-6 h-6 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
              </div>
              <div>
                <p className="text-sm text-zinc-300 font-medium group-hover:text-white transition-colors">
                  Pilih foto kerusakan jalan
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  JPG, PNG, WEBP — maksimal 10 MB
                </p>
              </div>
              </button>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={capturedImage}
                  alt="Foto kerusakan jalan yang diunggah"
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={handleRetake}
                  className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-xs text-white hover:bg-black/80 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Ganti Foto
                </button>
              </>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </>
        )}
      </div>

      {/* ── Verify Button ── */}
      <button
        onClick={handleVerify}
        disabled={!canVerify}
        className="w-full py-3.5 px-6 rounded-xl font-semibold text-sm flex items-center justify-center gap-2.5 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:scale-[1.01] active:scale-[0.99]"
      >
        {isVerifying ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Menganalisis dengan AI...
          </>
        ) : (
          <>
            <Scan className="w-4 h-4" />
            Verifikasi Kerusakan dengan AI
          </>
        )}
      </button>

      {/* ── AI Result Card ── */}
      {verifyResult && (
        <div
          className={`rounded-2xl border p-5 space-y-4 transition-all duration-500 ${
            verifyResult.isValidRoadDamage
              ? "border-emerald-500/30 bg-emerald-500/[0.06]"
              : "border-red-500/30 bg-red-500/[0.06]"
          }`}
        >
          {/* Header */}
          <div className="flex items-start gap-3">
            {verifyResult.isValidRoadDamage ? (
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
            ) : (
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-red-400" />
              </div>
            )}
            <div>
              <p
                className={`text-sm font-bold ${
                  verifyResult.isValidRoadDamage
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {verifyResult.isValidRoadDamage
                  ? "Kerusakan Jalan Terverifikasi"
                  : "Foto Ditolak oleh AI"}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Confidence:{" "}
                <span className="text-zinc-300 font-mono">
                  {(verifyResult.confidence * 100).toFixed(1)}%
                </span>
              </p>
            </div>
          </div>

          {/* Severity gauge — only shown for valid reports */}
          {verifyResult.isValidRoadDamage && verifyResult.severityScore > 0 && (
            <SeverityGauge score={verifyResult.severityScore} />
          )}

          {/* Reason */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
            <p className="text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">
              Evaluasi AI
            </p>
            <p className="text-xs text-zinc-300 leading-relaxed">
              {verifyResult.reason}
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════ Phase 3: On-Chain Attestation Section ═════════════ */}

      {/* ── GPS warning when valid but no GPS ── */}
      {verifyResult?.isValidRoadDamage && !gpsCoords && attestStatus !== "success" && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4 flex items-start gap-3">
          <MapPin className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-400 mb-1">
              Koordinat GPS Diperlukan
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Aktifkan GPS terlebih dahulu untuk mengirim laporan ke blockchain.
            </p>
          </div>
        </div>
      )}

      {/* ── Submit to Blockchain Button ── */}
      {verifyResult?.isValidRoadDamage && attestStatus !== "success" && (
        <button
          id="btn-submit-onchain"
          onClick={handleAttest}
          disabled={!canAttest}
          className="w-full py-3.5 px-6 rounded-xl font-semibold text-sm flex items-center justify-center gap-2.5 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 hover:scale-[1.01] active:scale-[0.99]"
        >
          {attestStatus === "submitting" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Menerbitkan Atestasi On-Chain di Base Sepolia... (Gasless)</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Kirim Laporan Resmi (On-Chain)</span>
            </>
          )}
        </button>
      )}

      {/* ── Attestation Success Card ── */}
      {attestStatus === "success" && attestResult && (
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.08] to-teal-500/[0.04] p-5 space-y-4 transition-all duration-500 animate-in">
          {/* Success Badge */}
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                  ✓ Tercatat Abadi di Base Sepolia Testnet
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Laporan kerusakan jalan telah diatestasi secara permanen di blockchain.
              </p>
            </div>
          </div>

          {/* Attestation UID */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                Attestation UID
              </span>
            </div>
            <p className="text-xs text-zinc-200 font-mono break-all leading-relaxed">
              {attestResult.uid}
            </p>
          </div>

          {/* TX Hash */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                Transaction Hash
              </span>
            </div>
            <p className="text-xs text-zinc-200 font-mono break-all leading-relaxed">
              {attestResult.txHash}
            </p>
          </div>

          {/* Explorer Links */}
          <div className="grid grid-cols-2 gap-3">
            <a
              href={attestResult.easScanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs font-semibold text-blue-400 hover:bg-white/[0.08] hover:border-blue-500/30 transition-all duration-200 group"
            >
              <ExternalLink className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
              View on EAS Scan
            </a>
            <a
              href={attestResult.baseScanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs font-semibold text-violet-400 hover:bg-white/[0.08] hover:border-violet-500/30 transition-all duration-200 group"
            >
              <ExternalLink className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
              View on BaseScan
            </a>
          </div>

          {/* New Report Button */}
          <button
            onClick={resetAll}
            className="w-full py-3 px-6 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-300 bg-white/[0.06] border border-white/[0.1] text-zinc-300 hover:bg-white/[0.1] hover:text-white hover:scale-[1.01] active:scale-[0.99]"
          >
            <RefreshCw className="w-4 h-4" />
            Buat Laporan Baru
          </button>
        </div>
      )}

      {/* ── Attestation Error ── */}
      {attestStatus === "error" && attestError && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-red-400 mb-1">
              Gagal Mengirim ke Blockchain
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {attestError}
            </p>
          </div>
        </div>
      )}

      {/* ── API Error ── */}
      {verifyError && (
        <div className="rounded-2xl border border-orange-500/30 bg-orange-500/[0.06] p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-orange-400 mb-1">
              Terjadi Kesalahan
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {verifyError}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

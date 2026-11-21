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
    <div className="rounded-2xl border border-[#DCE5DF] bg-[#F8FAF9] p-4 sm:p-5 transition-all">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#083701]" />
          <span className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
            Lokasi GPS
          </span>
        </div>

        {status === "idle" && (
          <button
            onClick={onRequest}
            className="text-xs text-[#083701] hover:text-[#0b4802] bg-[#ECFAEB] transition-colors px-3.5 py-1 rounded-full border border-[#DCE5DF] font-semibold"
          >
            Aktifkan
          </button>
        )}

        {status === "loading" && (
          <Loader2 className="w-4 h-4 text-[#083701] animate-spin" />
        )}

        {status === "success" && coords && (
          <span className="text-[11px] font-semibold text-[#083701] bg-[#ECFAEB] px-2.5 py-0.5 rounded-full border border-[#DCE5DF]">
            ±{Math.round(coords.accuracy)}m akurasi
          </span>
        )}

        {(status === "denied" || status === "error") && (
          <WifiOff className="w-4 h-4 text-red-500" />
        )}
      </div>

      {status === "idle" && (
        <p className="text-xs text-zinc-500 font-light">
          Klik &apos;Aktifkan&apos; untuk mendeteksi posisi lapangan secara otomatis.
        </p>
      )}

      {status === "loading" && (
        <p className="text-xs text-zinc-600 animate-pulse font-light">
          Mendeteksi koordinat GPS satelit...
        </p>
      )}

      {status === "success" && coords && (
        <div className="grid grid-cols-2 gap-3 mt-2.5 pt-2.5 border-t border-zinc-200/70">
          <div className="text-xs">
            <span className="text-zinc-500 font-medium">LATITUDE: </span>
            <span className="text-zinc-900 font-mono font-semibold tabular-nums">
              {coords.latitude.toFixed(6)}
            </span>
          </div>
          <div className="text-xs">
            <span className="text-zinc-500 font-medium">LONGITUDE: </span>
            <span className="text-zinc-900 font-mono font-semibold tabular-nums">
              {coords.longitude.toFixed(6)}
            </span>
          </div>
        </div>
      )}

      {status === "denied" && (
        <p className="text-xs text-red-600 mt-1">
          Akses GPS ditolak. Silakan aktifkan izin lokasi di pengaturan browser.
        </p>
      )}

      {status === "error" && (
        <p className="text-xs text-amber-700 mt-1">
          Gagal mendapatkan lokasi. Pastikan sinyal GPS aktif dan coba lagi.
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
    ? "from-red-500 to-rose-600"
    : isMid
    ? "from-amber-400 to-orange-500"
    : "from-emerald-500 to-[#083701]";

  const label = isHigh ? "Parah" : isMid ? "Sedang" : "Ringan";
  const textColor = isHigh
    ? "text-red-600"
    : isMid
    ? "text-amber-700"
    : "text-emerald-700";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Gauge className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">
            Severity Score
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-base font-bold font-mono tabular-nums ${textColor}`}>
            {pct}/100
          </span>
          <span
            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
              isHigh
                ? "text-red-700 border-red-200 bg-red-50"
                : isMid
                ? "text-amber-800 border-amber-200 bg-amber-50"
                : "text-emerald-800 border-emerald-200 bg-emerald-50"
            }`}
          >
            {label}
          </span>
        </div>
      </div>
      <div className="h-2.5 rounded-full bg-zinc-100 overflow-hidden p-0.5 border border-zinc-200">
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
    <div className="absolute inset-0 rounded-2xl bg-zinc-900/80 backdrop-blur-xs flex flex-col items-center justify-center z-10 gap-3">
      <div className="relative">
        <div className="w-14 h-14 rounded-full border-2 border-[#98FE67]/40 flex items-center justify-center">
          <Scan className="w-6 h-6 text-[#98FE67] animate-pulse" />
        </div>
        <span className="absolute inset-0 rounded-full border-t-2 border-[#98FE67] animate-spin" />
      </div>
      <div className="text-center">
        <p className="font-serif text-sm font-bold text-white">Menganalisis citra...</p>
        <p className="text-xs text-zinc-300 font-light mt-0.5">AI sedang mengevaluasi kerusakan jalan</p>
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

  /* ── Attestation state ── */
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

  /* ── Attestation helpers ── */
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
      <div className="flex rounded-full border border-zinc-200/80 bg-zinc-100 p-1 gap-1">
        {(["camera", "upload"] as InputMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => {
              setInputMode(mode);
              handleRetake();
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-300 min-h-[38px] ${
              inputMode === mode
                ? "bg-[#083701] text-white shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {mode === "camera" ? (
              <Camera className="w-3.5 h-3.5" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>{mode === "camera" ? "Kamera Langsung" : "Unggah Foto"}</span>
          </button>
        ))}
      </div>

      {/* ── Camera / Upload Viewport Area ── */}
      <div className="relative rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-950 aspect-video flex items-center justify-center shadow-inner">
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
                {/* Viewfinder corner brackets */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-[#98FE67] rounded-tl-sm" />
                  <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-[#98FE67] rounded-tr-sm" />
                  <div className="absolute bottom-16 left-4 w-6 h-6 border-b-2 border-l-2 border-[#98FE67] rounded-bl-sm" />
                  <div className="absolute bottom-16 right-4 w-6 h-6 border-b-2 border-r-2 border-[#98FE67] rounded-br-sm" />
                </div>
                {/* Capture shutter button */}
                <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                  <button
                    onClick={handleCapture}
                    disabled={!isCameraReady}
                    className="w-13 h-13 rounded-full bg-white hover:bg-zinc-100 border-4 border-[#98FE67] flex items-center justify-center shadow-xl transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Ambil foto"
                  >
                    <Camera className="w-5 h-5 text-[#083701]" />
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
                  className="absolute top-3 right-3 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-xs border border-white/20 text-xs font-semibold text-white hover:bg-black transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
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
                className="flex flex-col items-center gap-3 text-center p-8 w-full h-full hover:bg-white/[0.03] transition-colors group justify-center"
              >
                <div className="w-12 h-12 rounded-2xl border-2 border-dashed border-zinc-500 group-hover:border-[#083701] flex items-center justify-center transition-colors bg-white/5">
                  <Upload className="w-5 h-5 text-zinc-400 group-hover:text-[#083701] transition-colors" />
                </div>
                <div>
                  <p className="text-sm text-zinc-200 font-semibold group-hover:text-white transition-colors">
                    Pilih foto kerusakan jalan
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5 font-light">
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
                  className="absolute top-3 right-3 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-xs border border-white/20 text-xs font-semibold text-white hover:bg-black transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
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

      {/* ── Verify Button (High Contrast Action) ── */}
      <button
        onClick={handleVerify}
        disabled={!canVerify}
        className="w-full py-4 px-6 rounded-2xl font-bold text-xs sm:text-sm tracking-wide flex items-center justify-center gap-2.5 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed bg-[#98FE67] hover:bg-[#85f352] text-[#083701] shadow-md shadow-[#98FE67]/25 hover:scale-[1.01] active:scale-[0.99] uppercase min-h-[48px]"
      >
        {isVerifying ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-[#083701]" />
            <span>Menganalisis dengan AI...</span>
          </>
        ) : (
          <>
            <Scan className="w-4 h-4 text-[#083701]" />
            <span>Verifikasi Kerusakan dengan AI</span>
          </>
        )}
      </button>

      {/* ── AI Result Card ── */}
      {verifyResult && (
        <div
          className={`rounded-2xl border p-5 sm:p-6 space-y-4 transition-all duration-500 shadow-sm ${
            verifyResult.isValidRoadDamage
              ? "border-[#DCE5DF] bg-[#ECFAEB]/60"
              : "border-red-200 bg-red-50/60"
          }`}
        >
          {/* Header */}
          <div className="flex items-start gap-3">
            {verifyResult.isValidRoadDamage ? (
              <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#083701] text-[#98FE67] flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            ) : (
              <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5" />
              </div>
            )}
            <div>
              <p
                className={`font-serif text-base font-bold ${
                  verifyResult.isValidRoadDamage
                    ? "text-[#083701]"
                    : "text-red-700"
                }`}
              >
                {verifyResult.isValidRoadDamage
                  ? "Kerusakan Jalan Terverifikasi"
                  : "Foto Ditolak oleh AI"}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5 font-light">
                Confidence:{" "}
                <span className="text-zinc-800 font-mono font-semibold tabular-nums">
                  {(verifyResult.confidence * 100).toFixed(1)}%
                </span>
              </p>
            </div>
          </div>

          {/* Severity gauge */}
          {verifyResult.isValidRoadDamage && verifyResult.severityScore > 0 && (
            <SeverityGauge score={verifyResult.severityScore} />
          )}

          {/* Reason */}
          <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-2xs">
            <p className="text-[10px] font-bold text-zinc-400 mb-1 uppercase tracking-wider">
              Evaluasi AI Gemini
            </p>
            <p className="text-xs text-zinc-700 leading-relaxed font-normal">
              {verifyResult.reason}
            </p>
          </div>
        </div>
      )}

      {/* ── GPS warning ── */}
      {verifyResult?.isValidRoadDamage && !gpsCoords && attestStatus !== "success" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <MapPin className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-800 mb-1">
              Koordinat GPS Diperlukan
            </p>
            <p className="text-xs text-amber-900 leading-relaxed font-light">
              Aktifkan izin lokasi GPS terlebih dahulu untuk mengirimkan laporan resmi ke blockchain.
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
          className="w-full py-4 px-6 rounded-2xl font-bold text-xs sm:text-sm tracking-wide flex items-center justify-center gap-2.5 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed bg-[#083701] hover:bg-[#0c4e03] text-white shadow-md shadow-[#083701]/20 hover:scale-[1.01] active:scale-[0.99] uppercase min-h-[48px]"
        >
          {attestStatus === "submitting" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-[#98FE67]" />
              <span>Menerbitkan Atestasi On-Chain di Base Sepolia... (Gasless)</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4 text-[#98FE67]" />
              <span>Kirim Laporan Resmi (On-Chain)</span>
            </>
          )}
        </button>
      )}

      {/* ── Attestation Success Card ── */}
      {attestStatus === "success" && attestResult && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 sm:p-6 space-y-3.5 transition-all duration-500 animate-in shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#083701] text-[#98FE67] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-[#083701] bg-[#ECFAEB] border border-emerald-200 px-3 py-0.5 rounded-full uppercase tracking-wider">
                ✓ Tercatat Abadi di Base Sepolia
              </span>
              <p className="text-xs text-zinc-600 mt-1 font-light">
                Bukti kerusakan jalan telah diatestasi secara permanen melalui protokol EAS.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-white p-3 space-y-1 shadow-2xs">
            <div className="flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                Attestation UID
              </span>
            </div>
            <p className="text-xs text-zinc-900 font-mono break-all leading-relaxed tabular-nums">
              {attestResult.uid}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-white p-3 space-y-1 shadow-2xs">
            <div className="flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                Transaction Hash
              </span>
            </div>
            <p className="text-xs text-zinc-900 font-mono break-all leading-relaxed tabular-nums">
              {attestResult.txHash}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <a
              href={attestResult.easScanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white border border-emerald-200 text-xs font-semibold text-[#083701] hover:bg-emerald-50 transition-colors shadow-2xs group"
            >
              <ExternalLink className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
              <span>Lihat di EAS Scan</span>
            </a>
            <a
              href={attestResult.baseScanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white border border-emerald-200 text-xs font-semibold text-sky-700 hover:bg-sky-50 transition-colors shadow-2xs group"
            >
              <ExternalLink className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
              <span>Lihat di BaseScan</span>
            </a>
          </div>

          <button
            onClick={resetAll}
            className="w-full py-3 px-5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Buat Laporan Baru</span>
          </button>
        </div>
      )}

      {/* ── Attestation Error ── */}
      {attestStatus === "error" && attestError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-red-700 mb-1">
              Gagal Mengirim ke Blockchain
            </p>
            <p className="text-xs text-red-800 leading-relaxed font-light">
              {attestError}
            </p>
          </div>
        </div>
      )}

      {/* ── API Error ── */}
      {verifyError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-800 mb-1">
              Terjadi Kesalahan
            </p>
            <p className="text-xs text-amber-900 leading-relaxed font-light">
              {verifyError}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

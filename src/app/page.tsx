"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Shield,
  Brain,
  MapPin,
  Link2,
  Zap,
  Database,
  Globe,
  FileSearch,
  Map,
  AlertCircle,
  HardHat,
  ArrowRight,
} from "lucide-react";
import CitizenReportForm from "@/components/CitizenReportForm";
import RoleSwitcher from "@/components/role/RoleSwitcher";
import { useRole, type Role } from "@/components/role/RoleContext";

/* ── Dynamic import for Leaflet map (SSR-safe) ── */
const PublicMap = dynamic(() => import("@/components/PublicMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[480px] rounded-2xl border border-zinc-200 bg-zinc-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#083701]/30 border-t-[#083701] rounded-full animate-spin" />
        <span className="text-xs text-zinc-500 font-medium">Memuat peta interaktif…</span>
      </div>
    </div>
  ),
});

/* ───────────────────────── Tab type ──────────────────────────────────── */
type ActiveTab = "report" | "map";

/* ─────────────────── Architecture Card ───────────────────────────────── */
function ArchCard({
  icon: Icon,
  title,
  description,
  index,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  index: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 120 + index * 80);
    return () => clearTimeout(timer);
  }, [index]);

  return (
    <div
      className={`group rounded-2xl border border-[#DCE5DF] bg-white p-6 shadow-sm hover:shadow-md hover:border-[#083701]/40 transition-all duration-300 hover:-translate-y-1 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      <div className="w-12 h-12 rounded-xl bg-[#ECFAEB] border border-[#DCE5DF] flex items-center justify-center text-[#083701] mb-4 group-hover:scale-105 transition-transform">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="font-serif text-base font-bold text-zinc-900 mb-1.5 tracking-wide">
        {title}
      </h3>
      <p className="text-xs leading-relaxed text-zinc-600 font-normal">
        {description}
      </p>
    </div>
  );
}

/* ─────────────────── Status Badge ────────────────────────────────────── */
function StatusBadge() {
  return (
    <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white border border-[#DCE5DF] shadow-xs">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#083701] opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#083701]" />
      </span>
      <span className="text-xs font-semibold text-[#083701] tracking-wider uppercase">
        Base Sepolia — On-Chain Audit Protocol Live
      </span>
    </div>
  );
}

/* ─────────────────── Role Context Banner ─────────────────────────────── */
const ROLE_BANNERS: Record<
  Exclude<Role, "citizen">,
  { icon: React.ElementType; title: string; text: string; className: string }
> = {
  contractor: {
    icon: HardHat,
    title: "Mode Kontraktor / Dinas (Terverifikasi)",
    text: "Pilih pin merah di peta untuk menyelesaikan perbaikan dan menjalankan AI Spatial Matcher dengan verifikasi jarak GPS.",
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
};

function RoleBanner({ role }: { role: Role }) {
  if (role === "citizen") return null;
  const { icon: Icon, title, text, className } = ROLE_BANNERS[role];
  return (
    <div className={`mt-4 flex items-start gap-3 rounded-2xl border p-4 shadow-xs ${className}`}>
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-xs font-bold tracking-wide">{title}</p>
        <p className="text-[11px] text-zinc-700 leading-relaxed mt-0.5 font-normal">{text}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════ MAIN PAGE ════════════════════════════════ */
export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("report");
  const { role } = useRole();

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount flag for entrance animations
  useEffect(() => setMounted(true), []);

  /* Only citizens can submit reports; all other roles are redirected to the map. */
  const [prevRole, setPrevRole] = useState<Role>(role);
  if (role !== prevRole) {
    setPrevRole(role);
    if (role !== "citizen") setActiveTab("map");
  }
  const canReport = role === "citizen";
  const currentTab: ActiveTab = canReport ? activeTab : "map";

  const handleHeroAction = (tab: ActiveTab) => {
    setActiveTab(tab);
    const el = document.getElementById("action-panel");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const architectureItems = [
    {
      icon: Brain,
      title: "AI Damage Analysis",
      description:
        "Gemini Vision AI mengevaluasi citra kerusakan jalan, menghitung severity score (1-100), dan menerbitkan laporan inspeksi terstruktur secara instan.",
    },
    {
      icon: Link2,
      title: "On-Chain Attestation",
      description:
        "Setiap laporan tervalidasi diatestasi secara permanen melalui EAS (Ethereum Attestation Service) di Base Sepolia untuk akuntabilitas tanpa manipulasi.",
    },
    {
      icon: MapPin,
      title: "Geospatial Mapping",
      description:
        "Peta interaktif Leaflet dengan algoritma penanganan pin bertumpuk memberikan visualisasi sebaran kondisi jalan secara presisi.",
    },
    {
      icon: Database,
      title: "Supabase Backend",
      description:
        "Lapisan data berbasis PostgreSQL dengan Row Level Security, penyimpanan foto terisolasi, dan REST API cepat untuk seluruh operasi pelaporan.",
    },
    {
      icon: Globe,
      title: "Decentralized Protocol",
      description:
        "Sistem audit publik berbasis partisipasi warga di mana siapa pun dapat melaporkan, memverifikasi, dan menelusuri status jalan tanpa perantara.",
    },
    {
      icon: Zap,
      title: "Next.js + TypeScript",
      description:
        "Arsitektur App Router dengan Turbopack dan API edge yang dioptimasi untuk kinerja kilat, keamanan tipe data, dan tampilan responsif.",
    },
  ];

  const techStack = [
    "Next.js",
    "TypeScript",
    "Tailwind CSS",
    "Supabase",
    "Gemini AI",
    "EAS",
    "Ethers.js",
    "Leaflet",
    "Base Sepolia",
  ];

  return (
    <>
      <RoleSwitcher />
      <main className="relative flex-1 flex flex-col bg-[#F8FAF9] text-zinc-900">
        <div className="relative z-10 flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 py-8 sm:py-10 max-w-6xl mx-auto w-full">

          {/* ═══════════════ Hero Banner Utama (Hijau Gelap Pekat) ═══════════════ */}
          <section
            className={`w-full rounded-3xl sm:rounded-[36px] bg-gradient-to-br from-[#083701] via-[#052602] to-[#0A0C12] text-white p-7 sm:p-12 lg:p-14 shadow-2xl relative overflow-hidden border border-[#0d5004]/30 transition-all duration-1000 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
          >
            {/* Ambient subtle glow overlay */}
            <div className="absolute top-0 right-1/4 w-[400px] h-[300px] bg-[#98FE67]/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="relative z-10 max-w-3xl">
              {/* Badge kecil uppercase di atas judul */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#98FE67]/15 border border-[#98FE67]/30 text-[#98FE67] text-[11px] font-bold tracking-[0.18em] uppercase mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-[#98FE67]" />
                <span>Protokol Audit Kerusakan Jalan Terdesentralisasi</span>
              </div>

              {/* Judul utama besar ber-hierarki */}
              <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight">
                Audit Kerusakan Jalan.{" "}
                <span className="font-serif italic font-normal text-[#98FE67] block mt-1 sm:mt-2">
                  Transparan &amp; Abadi.
                </span>
              </h1>

              {/* Deskripsi singkat 2–3 baris */}
              <p className="text-zinc-300 text-sm sm:text-base font-light max-w-2xl leading-relaxed mt-4 mb-8">
                Protokol civic-tech terdesentralisasi yang menggabungkan analisis
                AI Vision dengan atestasi blockchain untuk audit kerusakan jalan
                publik yang transparan dan anti-manipulasi.
              </p>

              {/* Dua tombol aksi sejajar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  onClick={() => handleHeroAction("report")}
                  className="bg-[#98FE67] hover:bg-[#85f352] text-[#083701] font-bold px-6 py-3.5 rounded-full shadow-lg shadow-[#98FE67]/25 flex items-center justify-center gap-2 text-xs sm:text-sm tracking-wider uppercase transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span>Laporkan Kerusakan</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleHeroAction("map")}
                  className="bg-white/10 hover:bg-white/15 text-white border border-white/20 font-semibold px-6 py-3.5 rounded-full flex items-center justify-center gap-2 text-xs sm:text-sm tracking-wider uppercase transition-all backdrop-blur-xs hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span>Jelajahi Peta Publik</span>
                </button>
              </div>
            </div>
          </section>

          {/* ═══════════════ Pill Tengah: Base Sepolia Live ═══════════════ */}
          <div className="mt-8 mb-6 text-center">
            <StatusBadge />
          </div>

          {/* ═══════════════ Tab Switcher Utama & Action Panel ═══════════════ */}
          <div id="action-panel" className="w-full max-w-md mx-auto mb-8 scroll-mt-24">
            <div className="flex flex-col sm:flex-row items-center rounded-2xl sm:rounded-full bg-zinc-100 p-1.5 border border-zinc-200/80 shadow-inner gap-1.5 w-full">
              {canReport && (
                <button
                  id="tab-report"
                  onClick={() => setActiveTab("report")}
                  className={`w-full sm:flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-xl sm:rounded-full text-xs sm:text-sm font-bold tracking-wide transition-all duration-300 min-h-[42px] ${
                    currentTab === "report"
                      ? "bg-[#083701] text-white shadow-md shadow-[#083701]/20"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  <AlertCircle className="w-4 h-4" />
                  <span>Laporkan Kerusakan</span>
                </button>
              )}
              <button
                id="tab-map"
                onClick={() => setActiveTab("map")}
                className={`w-full sm:flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-xl sm:rounded-full text-xs sm:text-sm font-bold tracking-wide transition-all duration-300 min-h-[42px] ${
                  currentTab === "map"
                    ? "bg-[#083701] text-white shadow-md shadow-[#083701]/20"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <Map className="w-4 h-4" />
                <span>Peta Sebaran Publik</span>
              </button>
            </div>

            <RoleBanner role={role} />
          </div>

          {/* ═══════════════ Tab Content (Form & Peta) ═══════════════ */}
          <div className="w-full max-w-2xl mx-auto mb-16">
            {currentTab === "report" && (
              <div className="rounded-3xl border border-[#DCE5DF] bg-white p-6 sm:p-8 shadow-xl shadow-zinc-900/5 animate-in fade-in duration-300">
                {/* Header Kartu */}
                <div className="mb-6 pb-5 border-b border-zinc-100">
                  <h2 className="font-serif text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
                    Laporkan Kerusakan Jalan
                  </h2>
                  <p className="text-xs sm:text-sm text-zinc-500 mt-1 font-light">
                    Ambil foto fisik · Deteksi GPS otomatis · Verifikasi AI instan
                  </p>
                </div>

                <CitizenReportForm />
              </div>
            )}

            {currentTab === "map" && (
              <div className="rounded-3xl border border-[#DCE5DF] bg-white p-6 sm:p-8 shadow-xl shadow-zinc-900/5 animate-in fade-in duration-300">
                {/* Header Kartu */}
                <div className="mb-6 pb-5 border-b border-zinc-100">
                  <h2 className="font-serif text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
                    Peta Sebaran Kerusakan Jalan
                  </h2>
                  <p className="text-xs sm:text-sm text-zinc-500 mt-1 font-light">
                    Visualisasi geospatial real-time seluruh laporan publik
                  </p>
                </div>

                <PublicMap />
              </div>
            )}
          </div>

          {/* ═══════════════ Bagian Arsitektur Sistem CivicPlus ═══════════════ */}
          <div className="w-full max-w-5xl mx-auto mt-12 sm:mt-16">
            <div className="text-center mb-10">
              <div className="text-xs font-bold text-[#083701] tracking-[0.2em] uppercase mb-2">
                Protokol &amp; Arsitektur
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 mb-3">
                Arsitektur Sistem CivicPlus
              </h2>
              <p className="text-zinc-600 text-sm max-w-xl mx-auto font-light leading-relaxed">
                Enam pilar terdesentralisasi yang saling terhubung untuk menjamin transparansi, verifikasi otomatis, dan keabadian data audit.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {architectureItems.map((item, i) => (
                <ArchCard key={item.title} {...item} index={i} />
              ))}
            </div>

            {/* Deretan Badge Teknologi */}
            <div className="mt-14 mb-8 sm:mb-12 text-center">
              <div className="text-xs font-bold text-zinc-400 tracking-[0.2em] uppercase mb-4">
                Didukung Teknologi Modern
              </div>
              <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
                {techStack.map((tech) => (
                  <span
                    key={tech}
                    className="px-4 py-1.5 text-xs font-medium rounded-full bg-white border border-[#DCE5DF] text-zinc-700 tracking-wide shadow-2xs"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          </div>

        </div>
      </main>
    </>
  );
}

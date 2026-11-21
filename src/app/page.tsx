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
} from "lucide-react";
import CitizenReportForm from "@/components/CitizenReportForm";
import RoleSwitcher from "@/components/role/RoleSwitcher";
import { useRole, type Role } from "@/components/role/RoleContext";

/* ── Dynamic import for Leaflet map (SSR-safe) ── */
const PublicMap = dynamic(() => import("@/components/PublicMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[480px] rounded-2xl border border-white/[0.07] bg-white/[0.02]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
        <span className="text-xs text-zinc-500">Memuat peta interaktif…</span>
      </div>
    </div>
  ),
});

/* ───────────────────────── Tab type ──────────────────────────────────── */
type ActiveTab = "report" | "map";

/* ───────────────────────── Animated Pulse Ring ───────────────────────── */
function PulseRing({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="absolute inset-0 rounded-full border border-emerald-500/30 animate-ping"
      style={{ animationDelay: `${delay}ms`, animationDuration: "3s" }}
    />
  );
}

/* ───────────────────────── Floating Particle ─────────────────────────── */
function FloatingParticle({ index }: { index: number }) {
  const size = 2 + (index % 3);
  const left = (index * 17.3) % 100;
  const duration = 15 + (index % 10) * 2;
  const delay = (index * 1.7) % 8;

  return (
    <span
      className="absolute rounded-full bg-emerald-400/20 pointer-events-none"
      style={{
        width: size,
        height: size,
        left: `${left}%`,
        bottom: "-10px",
        animation: `floatUp ${duration}s ${delay}s linear infinite`,
      }}
    />
  );
}

/* ─────────────────── Architecture Card ───────────────────────────────── */
function ArchCard({
  icon: Icon,
  title,
  description,
  gradient,
  index,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  gradient: string;
  index: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 200 + index * 120);
    return () => clearTimeout(timer);
  }, [index]);

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-6 transition-all duration-500 hover:border-emerald-500/30 hover:bg-white/[0.06] hover:shadow-lg hover:shadow-emerald-500/5 hover:-translate-y-1 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      }`}
    >
      <div
        className={`absolute -inset-px rounded-2xl bg-gradient-to-r ${gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10 blur-xl`}
      />

      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:from-emerald-500/30 group-hover:to-teal-500/20 transition-colors duration-500">
          <Icon className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white mb-1 tracking-wide">
            {title}
          </h3>
          <p className="text-xs leading-relaxed text-zinc-400 group-hover:text-zinc-300 transition-colors">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── Status Badge ────────────────────────────────────── */
function StatusBadge() {
  return (
    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-sm">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <span className="text-xs font-medium text-emerald-400 tracking-wider uppercase">
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
    text: "Pilih pin merah di peta untuk menyelesaikan perbaikan dan menjalankan AI Spatial Matcher.",
    className: "border-amber-500/20 bg-amber-500/[0.06] text-amber-300",
  },
};

function RoleBanner({ role }: { role: Role }) {
  if (role === "citizen") return null;
  const { icon: Icon, title, text, className } = ROLE_BANNERS[role];
  return (
    <div className={`mt-4 flex items-start gap-3 rounded-2xl border p-3.5 ${className}`}>
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-xs font-semibold">{title}</p>
        <p className="text-[11px] text-zinc-400 leading-relaxed mt-0.5">{text}</p>
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

  const architectureItems = [
    {
      icon: Brain,
      title: "AI Damage Analysis",
      description:
        "Gemini Vision AI evaluates road damage imagery, assigns severity scores, and generates structured inspection reports in real-time.",
      gradient: "from-violet-600/20 via-transparent to-transparent",
    },
    {
      icon: Link2,
      title: "On-Chain Attestation",
      description:
        "Every verified report is permanently attested via EAS (Ethereum Attestation Service) on Base Sepolia for tamper-proof accountability.",
      gradient: "from-blue-600/20 via-transparent to-transparent",
    },
    {
      icon: MapPin,
      title: "Geospatial Mapping",
      description:
        "Interactive Leaflet maps with real-time clustering provide a city-wide view of road conditions and damage hotspots.",
      gradient: "from-amber-600/20 via-transparent to-transparent",
    },
    {
      icon: Database,
      title: "Supabase Backend",
      description:
        "PostgreSQL-backed data layer with Row Level Security, real-time subscriptions, and instant REST API for all report operations.",
      gradient: "from-emerald-600/20 via-transparent to-transparent",
    },
    {
      icon: Globe,
      title: "Decentralized Protocol",
      description:
        "Citizen-driven audit system where anyone can submit, verify, and track road damage reports without centralized gatekeeping.",
      gradient: "from-cyan-600/20 via-transparent to-transparent",
    },
    {
      icon: Zap,
      title: "Next.js + TypeScript",
      description:
        "Server-side rendering, App Router architecture, and edge-optimized API routes for blazing-fast performance and type safety.",
      gradient: "from-rose-600/20 via-transparent to-transparent",
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
    <main className="relative flex-1 flex flex-col overflow-hidden bg-[#09090b]">
      {/* ── Background Effects ── */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 70%)" }}
        />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(20,184,166,0.05) 0%, transparent 70%)" }}
        />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        {Array.from({ length: 20 }).map((_, i) => (
          <FloatingParticle key={i} index={i} />
        ))}
      </div>

      {/* ── Content ── */}
      <div className="relative z-10 flex-1 flex flex-col items-center px-4 sm:px-6 py-16 sm:py-20">

        {/* ─ Hero ─ */}
        <div
          className={`text-center max-w-3xl mx-auto transition-all duration-1000 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="relative inline-flex items-center justify-center mb-8">
            <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-2xl shadow-emerald-500/25">
              <Shield className="w-10 h-10 text-white" />
              <PulseRing delay={0} />
              <PulseRing delay={1000} />
              <PulseRing delay={2000} />
            </div>
          </div>

          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-4">
            <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              Civic
            </span>
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Plus
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-zinc-400 mb-3 font-light tracking-wide">
            AI-Powered Road Damage Audit Protocol
          </p>

          <p className="text-sm text-zinc-500 max-w-xl mx-auto mb-8 leading-relaxed">
            Protokol civic-tech terdesentralisasi yang menggabungkan analisis
            AI Vision dengan atestasi blockchain untuk audit kerusakan jalan
            publik yang transparan dan anti-manipulasi.
          </p>

          <StatusBadge />
        </div>

        {/* ─── Tab Switcher ─── */}
        <div
          className={`w-full max-w-xl mx-auto mt-14 transition-all duration-700 delay-200 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <div className="flex items-center rounded-2xl bg-white/[0.03] border border-white/[0.06] p-1.5 backdrop-blur-xl">
            {canReport && (
            <button
              id="tab-report"
              onClick={() => setActiveTab("report")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all duration-300 ${
                currentTab === "report"
                  ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/15 text-emerald-400 border border-emerald-500/25 shadow-lg shadow-emerald-500/10"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
            >
              <AlertCircle className="w-4 h-4" />
              <span>Laporkan Kerusakan</span>
            </button>
            )}
            <button
              id="tab-map"
              onClick={() => setActiveTab("map")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all duration-300 ${
                currentTab === "map"
                  ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/15 text-emerald-400 border border-emerald-500/25 shadow-lg shadow-emerald-500/10"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
            >
              <Map className="w-4 h-4" />
              <span>Peta Sebaran Publik</span>
            </button>
          </div>

          <RoleBanner role={role} />
        </div>

        {/* ─── Tab Content ─── */}
        <div
          className={`w-full max-w-xl mx-auto mt-6 transition-all duration-700 delay-300 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          {currentTab === "report" && (
            <div className="animate-in fade-in duration-500">
              {/* Card header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/25 to-teal-500/15 border border-emerald-500/25 flex items-center justify-center">
                  <FileSearch className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white tracking-wide">
                    Laporkan Kerusakan Jalan
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Ambil foto · Deteksi GPS · Verifikasi AI
                  </p>
                </div>
              </div>

              {/* Glass card */}
              <div className="rounded-3xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-2xl p-5 shadow-2xl shadow-black/50">
                <CitizenReportForm />
              </div>
            </div>
          )}

          {currentTab === "map" && (
            <div className="animate-in fade-in duration-500">
              {/* Card header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/25 to-teal-500/15 border border-emerald-500/25 flex items-center justify-center">
                  <Map className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white tracking-wide">
                    Peta Sebaran Kerusakan Jalan
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Visualisasi real-time semua laporan publik
                  </p>
                </div>
              </div>

              {/* Glass card */}
              <div className="rounded-3xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-2xl p-5 shadow-2xl shadow-black/50">
                <PublicMap />
              </div>
            </div>
          )}
        </div>

        {/* ─ Architecture Grid ─ */}
        <div className="w-full max-w-5xl mx-auto mt-24">
          <div
            className={`text-center mb-10 transition-all duration-700 delay-500 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <h2 className="text-sm font-semibold text-emerald-400/80 tracking-[0.2em] uppercase mb-2">
              System Architecture
            </h2>
            <p className="text-zinc-500 text-sm">
              Six interconnected modules powering the CivicPlus protocol
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {architectureItems.map((item, i) => (
              <ArchCard key={item.title} {...item} index={i} />
            ))}
          </div>
        </div>

        {/* ─ Tech Stack Pills ─ */}
        <div
          className={`mt-16 mb-8 flex flex-wrap justify-center gap-2 max-w-2xl transition-all duration-700 delay-700 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          {techStack.map((tech) => (
            <span
              key={tech}
              className="px-3 py-1 text-[11px] font-medium rounded-full bg-white/[0.04] border border-white/[0.06] text-zinc-400 tracking-wider hover:border-emerald-500/30 hover:text-emerald-400 transition-colors duration-300 cursor-default"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>

      {/* ── Float-up animation keyframe ── */}
      <style jsx>{`
        @keyframes floatUp {
          0% {
            transform: translateY(0) scale(1);
            opacity: 0;
          }
          10% {
            opacity: 0.6;
          }
          90% {
            opacity: 0.1;
          }
          100% {
            transform: translateY(-100vh) scale(0.5);
            opacity: 0;
          }
        }
      `}</style>
    </main>
    </>
  );
}

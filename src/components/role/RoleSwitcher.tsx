"use client";

/**
 * RoleSwitcher — sticky navbar with a segmented role selector and the
 * unified PIN authentication dialog (for the Contractor role).
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Shield,
  Users,
  HardHat,
  Lock,
  Loader2,
  X,
  LogOut,
  KeyRound,
} from "lucide-react";
import { ROLE_LABELS, useRole, type Role, type ProtectedRole } from "./RoleContext";

const ROLE_ITEMS: { role: Role; icon: typeof Users; short: string }[] = [
  { role: "citizen", icon: Users, short: "Warga" },
  { role: "contractor", icon: HardHat, short: "Kontraktor" },
];

/** Roles that show a lock icon when not active. */
const PROTECTED_ROLES = new Set<Role>(["contractor"]);

const ROLE_STYLES: Record<Role, string> = {
  citizen:
    "bg-gradient-to-r from-emerald-500/20 to-teal-500/15 text-emerald-300 border-emerald-500/30 shadow-emerald-500/10",
  contractor:
    "bg-gradient-to-r from-amber-500/20 to-orange-500/15 text-amber-300 border-amber-500/30 shadow-amber-500/10",
};

/* ── PIN Dialog configuration per protected role ─────────────────────── */

const PIN_DIALOG_CONFIG: Record<
  ProtectedRole,
  {
    title: string;
    subtitle: string;
    borderColor: string;
    iconBgFrom: string;
    iconBgTo: string;
    iconBorder: string;
    iconColor: string;
    btnGradient: string;
    btnShadow: string;
    focusBorder: string;
    focusRing: string;
    submitIcon: typeof HardHat;
    submitLabel: string;
  }
> = {
  contractor: {
    title: "Otentikasi Kontraktor / Dinas",
    subtitle:
      "Masukkan PIN otentikasi untuk membuka Portal Resolusi & AI Spatial Matcher.",
    borderColor: "border-amber-500/20",
    iconBgFrom: "from-amber-500/25",
    iconBgTo: "to-orange-500/15",
    iconBorder: "border-amber-500/30",
    iconColor: "text-amber-400",
    btnGradient: "from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500",
    btnShadow: "shadow-amber-500/20",
    focusBorder: "focus:border-amber-500/50",
    focusRing: "focus:ring-amber-500/20",
    submitIcon: HardHat,
    submitLabel: "Masuk sebagai Kontraktor",
  },
};

/* ─────────────────────────── PIN Dialog ─────────────────────────────── */

function RolePinDialog() {
  const { isPinPromptOpen, pinPromptRole, closePinPrompt, submitPin } =
    useRole();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isPinPromptOpen) return;
    setPin("");
    setError(null);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closePinPrompt();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [isPinPromptOpen, closePinPrompt]);

  if (!isPinPromptOpen) return null;

  const cfg = PIN_DIALOG_CONFIG[pinPromptRole];
  const SubmitIcon = cfg.submitIcon;

  const handleClose = () => {
    setPin("");
    setError(null);
    closePinPrompt();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pin.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await submitPin(pin.trim());
    setSubmitting(false);
    if (res.ok) {
      setPin("");
    } else {
      setError(res.error ?? "PIN tidak valid.");
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-dialog-title"
        className={`relative w-full max-w-sm rounded-3xl border ${cfg.borderColor} bg-zinc-900/95 backdrop-blur-2xl p-6 shadow-2xl shadow-black/60`}
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Tutup"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center mb-5">
          <div
            className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${cfg.iconBgFrom} ${cfg.iconBgTo} border ${cfg.iconBorder} flex items-center justify-center mb-3`}
          >
            <Lock className={`w-6 h-6 ${cfg.iconColor}`} />
          </div>
          <h3 id="pin-dialog-title" className="text-sm font-bold text-white tracking-wide">
            {cfg.title}
          </h3>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            {cfg.subtitle}
          </p>
        </div>

        <label htmlFor="role-pin" className="sr-only">
          PIN {ROLE_LABELS[pinPromptRole]}
        </label>
        <div className="relative">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            id="role-pin"
            ref={inputRef}
            type="password"
            autoComplete="one-time-code"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setError(null);
            }}
            placeholder="••••••••"
            className={`w-full pl-10 pr-3 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white tracking-[0.3em] placeholder:tracking-[0.3em] placeholder:text-zinc-600 focus:outline-none ${cfg.focusBorder} focus:ring-2 ${cfg.focusRing} transition`}
          />
        </div>

        {error && (
          <p className="mt-2 text-xs text-red-400" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!pin.trim() || submitting}
          className={`mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r ${cfg.btnGradient} text-white shadow-lg ${cfg.btnShadow} disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Memverifikasi…
            </>
          ) : (
            <>
              <SubmitIcon className="w-4 h-4" /> {cfg.submitLabel}
            </>
          )}
        </button>
      </form>
    </div>
  );
}

/* ─────────────────────────── Navbar ─────────────────────────────────── */

export default function RoleSwitcher() {
  const { role, requestRole, logoutRole } = useRole();

  return (
    <>
      <header className="sticky top-0 z-[1000] w-full border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 h-14">
          {/* Brand */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="hidden sm:inline text-sm font-bold tracking-tight">
              <span className="text-white">Civic</span>
              <span className="text-emerald-400">Plus</span>
            </span>
          </div>

          {/* Segmented role selector */}
          <div className="flex items-center gap-2">
            <span className="hidden md:inline text-[10px] uppercase tracking-[0.15em] text-zinc-500">
              Peran
            </span>
            <div
              role="radiogroup"
              aria-label="Pilih peran"
              className="flex items-center rounded-xl bg-white/[0.03] border border-white/[0.06] p-1"
            >
              {ROLE_ITEMS.map(({ role: r, icon: Icon, short }) => {
                const active = role === r;
                return (
                  <button
                    key={r}
                    id={`role-${r}`}
                    role="radio"
                    aria-checked={active}
                    title={ROLE_LABELS[r]}
                    onClick={() => requestRole(r)}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-300 ${
                      active
                        ? `${ROLE_STYLES[r]} shadow-lg`
                        : "text-zinc-500 hover:text-zinc-300 border-transparent"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{short}</span>
                    {PROTECTED_ROLES.has(r) && !active && <Lock className="w-3 h-3 opacity-60" />}
                  </button>
                );
              })}
            </div>

            {role !== "citizen" && (
              <button
                onClick={logoutRole}
                title={`Keluar dari mode ${ROLE_LABELS[role]}`}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 border border-white/[0.06] transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      <RolePinDialog />
    </>
  );
}

"use client";

/**
 * RoleSwitcher — Clean light navbar with CivicPlus branding,
 * role selector (PERAN: Warga / Kontraktor), and contractor PIN modal.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import {
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

/* ── PIN Dialog configuration per protected role ─────────────────────── */

const PIN_DIALOG_CONFIG: Record<
  ProtectedRole,
  {
    title: string;
    subtitle: string;
    submitIcon: typeof HardHat;
    submitLabel: string;
  }
> = {
  contractor: {
    title: "Otentikasi Kontraktor / Dinas",
    subtitle:
      "Masukkan PIN otentikasi resmi untuk membuka Portal Resolusi & AI Spatial Matcher.",
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
    const t = setTimeout(() => inputRef.current?.focus(), 60);
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
      <div
        className="absolute inset-0 bg-zinc-900/60 backdrop-blur-xs transition-opacity"
        onClick={handleClose}
      />
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-dialog-title"
        className="relative w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-6 sm:p-7 shadow-2xl shadow-zinc-900/20"
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          aria-label="Tutup"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-[#ECFAEB] border border-[#DCE5DF] flex items-center justify-center mb-3.5 shadow-xs">
            <Lock className="w-6 h-6 text-[#083701]" />
          </div>
          <h3
            id="pin-dialog-title"
            className="font-serif text-lg font-bold text-zinc-900 tracking-wide"
          >
            {cfg.title}
          </h3>
          <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed max-w-[260px]">
            {cfg.subtitle}
          </p>
        </div>

        <label htmlFor="role-pin" className="sr-only">
          PIN {ROLE_LABELS[pinPromptRole]}
        </label>
        <div className="relative">
          <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
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
            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-zinc-50 border border-zinc-200 text-sm text-zinc-900 tracking-[0.3em] placeholder:tracking-[0.3em] placeholder:text-zinc-400 focus:outline-none focus:border-[#083701] focus:ring-2 focus:ring-[#083701]/10 transition-all font-mono"
          />
        </div>

        {error && (
          <p className="mt-2.5 text-xs text-red-600 text-center font-medium" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!pin.trim() || submitting}
          className="mt-5 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-xs sm:text-sm font-bold tracking-wide bg-[#083701] hover:bg-[#0c4e03] text-white shadow-md shadow-[#083701]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Memverifikasi…</span>
            </>
          ) : (
            <>
              <SubmitIcon className="w-4 h-4" />
              <span>{cfg.submitLabel}</span>
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
      <header className="sticky top-0 z-[1000] w-full border-b border-[#E2E8F0] bg-white/95 backdrop-blur-md transition-all shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 h-16">
          {/* Brand */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative w-8 h-8 flex items-center justify-center flex-shrink-0">
              <Image
                src="/logo.png"
                alt="CivicPlus Logo"
                width={32}
                height={32}
                className="w-full h-full object-contain"
                priority
              />
            </div>
            <div>
              <div className="flex items-baseline leading-none font-serif text-lg font-bold tracking-tight">
                <span className="text-zinc-900">Civic</span>
                <span className="text-[#083701]">Plus</span>
              </div>
            </div>
          </div>

          {/* Segmented role selector */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Peran:
            </span>
            <div
              role="radiogroup"
              aria-label="Pilih peran"
              className="flex items-center rounded-full bg-zinc-100 p-1 border border-zinc-200/80 shadow-2xs"
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
                    className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-300 min-h-[32px] ${
                      active
                        ? "bg-[#083701] text-white shadow-xs"
                        : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{short}</span>
                    {PROTECTED_ROLES.has(r) && !active && (
                      <Lock className="w-3 h-3 opacity-60" />
                    )}
                  </button>
                );
              })}
            </div>

            {role !== "citizen" && (
              <button
                onClick={logoutRole}
                title={`Keluar dari mode ${ROLE_LABELS[role]}`}
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 border border-zinc-200 transition-colors"
                aria-label="Logout peran"
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

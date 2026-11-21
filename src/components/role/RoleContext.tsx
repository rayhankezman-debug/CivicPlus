"use client";

/**
 * Role-Based Access Control (client state).
 *
 * Roles:
 *  - citizen     → "Warga" (default): submit reports, view map.
 *  - contractor  → "Kontraktor / Dinas": requires PIN; unlocks resolution.
 *
 * NOTE: UI gating is for UX only. The real enforcement for protected
 * actions happens server-side via Bearer token checks.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Role = "citizen" | "contractor";

/** Roles that require a PIN to activate. */
export type ProtectedRole = "contractor";

export const ROLE_LABELS: Record<Role, string> = {
  citizen: "Warga",
  contractor: "Kontraktor / Dinas",
};

interface RoleSession {
  token: string;
  expiresAt: number;
}

interface RoleContextValue {
  role: Role;
  /** Switch role. Switching to a protected role opens the PIN prompt unless a valid session exists. */
  requestRole: (role: Role) => void;
  /** Valid contractor bearer token (null if not authenticated / expired). */
  contractorToken: string | null;
  /** Clears the active protected-role session and returns to citizen. */
  logoutContractor: () => void;
  logoutRole: () => void;
  /** PIN prompt state */
  isPinPromptOpen: boolean;
  /** Which role the PIN prompt is currently authenticating for. */
  pinPromptRole: ProtectedRole;
  closePinPrompt: () => void;
  submitPin: (pin: string) => Promise<{ ok: boolean; error?: string }>;
}

const STORAGE_KEY_ROLE = "civicpulse.role";
const STORAGE_KEY_CONTRACTOR = "civicpulse.contractorSession";

const RoleContext = createContext<RoleContextValue | null>(null);

function readSession(key: string): RoleSession | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw) as RoleSession;
    return s.token && s.expiresAt > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("citizen");
  const [contractorSession, setContractorSession] =
    useState<RoleSession | null>(null);
  const [isPinPromptOpen, setPinPromptOpen] = useState(false);
  const [pinPromptRole, setPinPromptRole] = useState<ProtectedRole>("contractor");

  /* Restore from sessionStorage after mount (avoids SSR hydration mismatch) */
  useEffect(() => {
    const restoredContractor = readSession(STORAGE_KEY_CONTRACTOR);
    const storedRole = sessionStorage.getItem(STORAGE_KEY_ROLE) as Role | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from sessionStorage
    setContractorSession(restoredContractor);
    if (storedRole === "contractor" && restoredContractor) {
      setRole("contractor");
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY_ROLE, role);
  }, [role]);

  /* Auto-expire contractor session */
  useEffect(() => {
    if (!contractorSession) return;
    const ms = contractorSession.expiresAt - Date.now();
    const timer = setTimeout(() => {
      setContractorSession(null);
      sessionStorage.removeItem(STORAGE_KEY_CONTRACTOR);
      setRole((r) => (r === "contractor" ? "citizen" : r));
    }, Math.max(ms, 0));
    return () => clearTimeout(timer);
  }, [contractorSession]);

  const requestRole = useCallback(
    (next: Role) => {
      if (next === "citizen") {
        setRole("citizen");
        return;
      }

      // Protected roles: check for existing session
      if (next === "contractor") {
        if (contractorSession && contractorSession.expiresAt > Date.now()) {
          setRole("contractor");
        } else {
          setPinPromptRole("contractor");
          setPinPromptOpen(true);
        }
        return;
      }
    },
    [contractorSession]
  );

  const submitPin = useCallback(
    async (pin: string) => {
      try {
        const res = await fetch("/api/auth/role", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: pinPromptRole, pin }),
        });
        const data = (await res.json()) as {
          success: boolean;
          token?: string;
          expiresAt?: number;
          error?: string;
        };
        if (!res.ok || !data.success || !data.token || !data.expiresAt) {
          return { ok: false, error: data.error ?? "PIN tidak valid." };
        }
        const s: RoleSession = {
          token: data.token,
          expiresAt: data.expiresAt,
        };

        sessionStorage.setItem(STORAGE_KEY_CONTRACTOR, JSON.stringify(s));
        setContractorSession(s);
        setRole("contractor");

        setPinPromptOpen(false);
        return { ok: true };
      } catch {
        return { ok: false, error: "Gagal menghubungi server otentikasi." };
      }
    },
    [pinPromptRole]
  );

  const logoutContractor = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY_CONTRACTOR);
    setContractorSession(null);
    setRole("citizen");
  }, []);

  const logoutRole = useCallback(() => {
    if (role === "contractor") {
      sessionStorage.removeItem(STORAGE_KEY_CONTRACTOR);
      setContractorSession(null);
    }
    setRole("citizen");
  }, [role]);

  const value = useMemo<RoleContextValue>(
    () => ({
      role,
      requestRole,
      contractorToken: contractorSession?.token ?? null,
      logoutContractor,
      logoutRole,
      isPinPromptOpen,
      pinPromptRole,
      closePinPrompt: () => setPinPromptOpen(false),
      submitPin,
    }),
    [
      role,
      requestRole,
      contractorSession,
      logoutContractor,
      logoutRole,
      isPinPromptOpen,
      pinPromptRole,
      submitPin,
    ]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within <RoleProvider>.");
  return ctx;
}

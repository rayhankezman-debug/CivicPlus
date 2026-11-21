/**
 * Role-based authentication helpers (SERVER-ONLY).
 *
 * Simple, stateless RBAC for the hackathon build:
 *  - PINs live in server-only env vars (`CONTRACTOR_PIN`),
 *    never exposed to the browser. Each has a local fallback for development.
 *  - After a valid PIN, the server issues a short-lived HMAC-signed bearer
 *    token: `<expiresAtMs>.<hex signature>`.
 *  - Protected endpoints accept either that token or the raw PIN via
 *    `Authorization: Bearer <token|PIN>`.
 */

import { createHmac, timingSafeEqual } from "crypto";

/* ═══════════════════════ Supported protected roles ═══════════════════ */

export type ProtectedRole = "contractor";

/* ═══════════════════════ PIN configuration ════════════════════════════ */

const ROLE_PIN_CONFIG: Record<
  ProtectedRole,
  { envKey: string; fallback: string; label: string }
> = {
  contractor: {
    envKey: "CONTRACTOR_PIN",
    fallback: "PUPR2026",
    label: "Kontraktor / Dinas",
  },
};

/** Token lifetime: 8 hours. */
export const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
/** @deprecated alias — kept so existing imports don't break. */
export const CONTRACTOR_TOKEN_TTL_MS = TOKEN_TTL_MS;

/* ═══════════════════════ Low-level helpers ════════════════════════════ */

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function getSigningKey(role: ProtectedRole): string {
  return (
    process.env.CONTRACTOR_TOKEN_SECRET?.trim() ||
    `civicpulse-${role}:${getRolePin(role)}`
  );
}

function sign(payload: string, role: ProtectedRole): string {
  return createHmac("sha256", getSigningKey(role))
    .update(payload)
    .digest("hex");
}

/* ═══════════════════════ Generic role helpers ═════════════════════════ */

export function getRolePin(role: ProtectedRole): string {
  const cfg = ROLE_PIN_CONFIG[role];
  const pin = (process.env as Record<string, string | undefined>)[cfg.envKey]?.trim();
  if (!pin) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        `[RoleAuth] ${cfg.envKey} is not set — using the local fallback PIN. ` +
          `Set ${cfg.envKey} in your deployment environment.`
      );
    }
    return cfg.fallback;
  }
  return pin;
}

export function verifyRolePin(role: ProtectedRole, pin: unknown): boolean {
  return typeof pin === "string" && safeEqual(pin.trim(), getRolePin(role));
}

export function issueRoleToken(
  role: ProtectedRole
): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${role}.${expiresAt}`;
  return { token: `${expiresAt}.${sign(payload, role)}`, expiresAt };
}

export function verifyRoleToken(role: ProtectedRole, token: string): boolean {
  const [expStr, signature] = token.split(".");
  const expiresAt = Number(expStr);
  if (!expStr || !signature || !Number.isFinite(expiresAt)) return false;
  if (Date.now() > expiresAt) return false;
  return safeEqual(signature, sign(`${role}.${expiresAt}`, role));
}

/**
 * Validate the `Authorization: Bearer <token|PIN>` header for a role.
 * Returns `null` when authorized, or a ready-to-return 401 Response.
 */
export function requireRole(
  role: ProtectedRole,
  request: Request
): Response | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const credential = match?.[1]?.trim() ?? "";

  if (
    credential &&
    (verifyRoleToken(role, credential) || verifyRolePin(role, credential))
  ) {
    return null;
  }

  const cfg = ROLE_PIN_CONFIG[role];
  return Response.json(
    {
      success: false,
      error: `Akses ditolak. Hanya ${cfg.label} terverifikasi yang dapat mengakses fitur ini.`,
      code: `${role.toUpperCase()}_AUTH_REQUIRED`,
    },
    { status: 401, headers: { "WWW-Authenticate": `Bearer realm="${role}"` } }
  );
}

/* ═══════════════════════ Legacy contractor aliases ════════════════════ */

/** @deprecated Use `getRolePin("contractor")` */
export function getContractorPin(): string {
  return getRolePin("contractor");
}

/** @deprecated Use `verifyRolePin("contractor", pin)` */
export function verifyContractorPin(pin: unknown): boolean {
  return verifyRolePin("contractor", pin);
}

/** @deprecated Use `issueRoleToken("contractor")` */
export function issueContractorToken(): { token: string; expiresAt: number } {
  return issueRoleToken("contractor");
}

/** @deprecated Use `verifyRoleToken("contractor", token)` */
export function verifyContractorToken(token: string): boolean {
  return verifyRoleToken("contractor", token);
}

/** @deprecated Use `requireRole("contractor", request)` */
export function requireContractor(request: Request): Response | null {
  return requireRole("contractor", request);
}

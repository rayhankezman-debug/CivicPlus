/**
 * POST /api/auth/role
 *
 * Exchanges a role PIN for a short-lived signed bearer token.
 * Body: { role: "contractor", pin: string }
 * 200 → { success: true, token, expiresAt }
 * 400 → invalid body
 * 401 → wrong PIN
 */

import {
  issueRoleToken,
  verifyRolePin,
  type ProtectedRole,
} from "@/lib/contractor-auth";

const VALID_ROLES = new Set<ProtectedRole>(["contractor"]);

export async function POST(request: Request): Promise<Response> {
  let role: unknown;
  let pin: unknown;
  try {
    ({ role, pin } = (await request.json()) as {
      role?: unknown;
      pin?: unknown;
    });
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (typeof role !== "string" || !VALID_ROLES.has(role as ProtectedRole)) {
    return Response.json(
      { success: false, error: "Parameter 'role' tidak valid." },
      { status: 400 }
    );
  }

  const r = role as ProtectedRole;

  if (!verifyRolePin(r, pin)) {
    // Small delay to slow down brute-force attempts
    await new Promise((resolve) => setTimeout(resolve, 600));
    return Response.json(
      {
        success: false,
        error: "PIN otentikasi kontraktor salah.",
      },
      { status: 401 }
    );
  }

  const { token, expiresAt } = issueRoleToken(r);
  return Response.json({ success: true, token, expiresAt }, { status: 200 });
}

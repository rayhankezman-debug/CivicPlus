/**
 * POST /api/auth/contractor
 *
 * Exchanges the contractor PIN for a short-lived signed bearer token.
 * Body: { pin: string }
 * 200 → { success: true, token, expiresAt }
 * 401 → { success: false, error }
 */

import { issueContractorToken, verifyContractorPin } from "@/lib/contractor-auth";

export async function POST(request: Request): Promise<Response> {
  let pin: unknown;
  try {
    ({ pin } = (await request.json()) as { pin?: unknown });
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!verifyContractorPin(pin)) {
    // Small delay to slow down brute-force attempts
    await new Promise((r) => setTimeout(r, 600));
    return Response.json(
      { success: false, error: "PIN otentikasi kontraktor salah." },
      { status: 401 }
    );
  }

  const { token, expiresAt } = issueContractorToken();
  return Response.json({ success: true, token, expiresAt }, { status: 200 });
}


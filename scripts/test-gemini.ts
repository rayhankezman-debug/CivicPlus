/**
 * Quick Gemini REST integration test.
 *
 * Usage:
 *   npx tsx scripts/test-gemini.ts                 # tests GEMINI_MODEL, then fallbacks
 *   npx tsx scripts/test-gemini.ts gemini-2.5-flash # tests specific model(s) first
 *
 * Reads GEMINI_API_KEY and GEMINI_MODEL from .env.local, calls the
 * Generative Language v1beta generateContent endpoint and prints the
 * HTTP status and response body for each model until one returns 200 OK.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

/* ─── Load .env.local (no dotenv dependency) ───────────────────────── */
function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    console.warn(`⚠ .env.local not found at ${envPath}`);
    return;
  }
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();

const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
const envModel = process.env.GEMINI_MODEL?.trim();

if (!apiKey) {
  console.error("✗ GEMINI_API_KEY is missing in .env.local");
  process.exit(1);
}

console.log(
  `Gemini key: ${apiKey.slice(0, 4)}… (length ${apiKey.length})`
);
console.log(`GEMINI_MODEL from env: ${envModel ?? "(not set)"}`);

/* ─── Candidate models (deduplicated, in order) ────────────────────── */
const candidates = [
  ...process.argv.slice(2),
  envModel,
  "gemini-2.0-flash",
  "gemini-1.5-flash-latest",
  "gemini-flash-latest",
].filter((m, i, arr): m is string => !!m && arr.indexOf(m) === i);

/* ─── Test one model ───────────────────────────────────────────────── */
const TIMEOUT_MS = Number(process.env.GEMINI_TEST_TIMEOUT_MS) || 90_000;

async function testModel(model: string): Promise<boolean> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  console.log(`\n━━━ Testing model: ${model} (timeout ${TIMEOUT_MS / 1000}s) ━━━`);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with exactly: {"ok": true}' }] }],
      }),
    });

    const body = await response.text();
    console.log(`Status: ${response.status} ${response.statusText} (${Date.now() - started} ms)`);
    console.log("Body:", body.length > 1500 ? body.slice(0, 1500) + "…" : body);
    return response.ok;
  } catch (err) {
    console.error(
      `Exception after ${Date.now() - started} ms:`,
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

/* ─── List models that support generateContent ─────────────────────── */
async function listFlashModels(): Promise<void> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`;
  console.log("\n━━━ ListModels (generateContent, flash) ━━━");
  try {
    const response = await fetch(url, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      console.log(`Status: ${response.status}`, (await response.text()).slice(0, 800));
      return;
    }
    const data = (await response.json()) as {
      models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
    };
    const names = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((n) => n.includes("flash"));
    console.log(names.length ? names.join("\n") : "(none)");
  } catch (err) {
    console.error("ListModels exception:", err instanceof Error ? err.message : String(err));
  }
}

/* ─── Main ─────────────────────────────────────────────────────────── */
async function main(): Promise<void> {
  await listFlashModels();
  for (const model of candidates) {
    if (await testModel(model)) {
      console.log(`\n✓ WORKING MODEL: ${model}`);
      return;
    }
  }
  console.error("\n✗ No candidate model returned 200 OK.");
  process.exitCode = 1;
}

void main();


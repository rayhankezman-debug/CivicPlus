/**
 * scripts/register-schema.ts
 *
 * Registers the CivicPlus road-damage attestation schema on the
 * Base Sepolia SchemaRegistry and writes the resulting Schema UID
 * to `.env.local`.
 *
 * Usage:
 *   npx tsx scripts/register-schema.ts
 *
 * Prerequisites:
 *   - PRIVATE_KEY_RELAYER must be set in `.env.local` (or exported).
 *   - The relayer wallet needs a small amount of Base Sepolia ETH.
 */

import { ethers } from "ethers";
import {
  SchemaRegistry,
} from "@ethereum-attestation-service/eas-sdk";
import * as fs from "fs";
import * as path from "path";

/* ─── Configuration ─────────────────────────────────────────────────── */

/** Base Sepolia SchemaRegistry (Bedrock predeploy) */
const SCHEMA_REGISTRY_ADDRESS = "0x4200000000000000000000000000000000000020";

/** RPC endpoint */
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://sepolia.base.org";

/** The schema string that matches the attestation encoder in src/lib/eas.ts */
const SCHEMA_STRING =
  "string imageHash,int256 latitude,int256 longitude,uint8 severityScore,string status";

/** Path to .env.local relative to project root */
const ENV_FILE = path.resolve(__dirname, "..", ".env.local");

/* ─── Helpers ───────────────────────────────────────────────────────── */

function loadPrivateKey(): string {
  // Try loading from .env.local manually (we can't rely on Next.js env loading here)
  if (process.env.PRIVATE_KEY_RELAYER) {
    return process.env.PRIVATE_KEY_RELAYER;
  }

  // Fallback: read .env.local directly
  if (fs.existsSync(ENV_FILE)) {
    const envContent = fs.readFileSync(ENV_FILE, "utf-8");
    const match = envContent.match(/^PRIVATE_KEY_RELAYER=(.+)$/m);
    if (match) {
      return match[1].trim();
    }
    // Also try RELAYER_PRIVATE_KEY
    const match2 = envContent.match(/^RELAYER_PRIVATE_KEY=(.+)$/m);
    if (match2) {
      return match2[1].trim();
    }
  }

  throw new Error(
    "Missing PRIVATE_KEY_RELAYER. Set it in .env.local or export it before running this script."
  );
}

function writeSchemaUidToEnv(uid: string): void {
  const envVarLine = `EAS_SCHEMA_UID=${uid}`;

  if (!fs.existsSync(ENV_FILE)) {
    fs.writeFileSync(ENV_FILE, `# EAS Schema UID (Base Sepolia)\n${envVarLine}\n`);
    console.log(`✓ Created ${ENV_FILE} with EAS_SCHEMA_UID`);
    return;
  }

  let content = fs.readFileSync(ENV_FILE, "utf-8");

  // Replace existing EAS_SCHEMA_UID line if present
  if (/^EAS_SCHEMA_UID=/m.test(content)) {
    content = content.replace(/^EAS_SCHEMA_UID=.*/m, envVarLine);
    fs.writeFileSync(ENV_FILE, content);
    console.log(`✓ Updated EAS_SCHEMA_UID in ${ENV_FILE}`);
  } else {
    // Append after the EAS section comment, or at the end
    const easSectionMarker = "# Ethereum Attestation Service";
    if (content.includes(easSectionMarker)) {
      // Find the end of the EAS section (next blank line or end of file)
      const lines = content.split("\n");
      let insertIndex = lines.length;
      let inEasSection = false;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(easSectionMarker)) {
          inEasSection = true;
          continue;
        }
        if (inEasSection && (lines[i].startsWith("#") || lines[i].trim() === "")) {
          // Check if it's a new section or blank line after EAS vars
          if (lines[i].startsWith("# ") && !lines[i].includes("Ethereum Attestation")) {
            insertIndex = i;
            break;
          }
        }
      }

      lines.splice(insertIndex, 0, envVarLine);
      fs.writeFileSync(ENV_FILE, lines.join("\n"));
    } else {
      content += `\n# EAS Schema UID (Base Sepolia)\n${envVarLine}\n`;
      fs.writeFileSync(ENV_FILE, content);
    }
    console.log(`✓ Appended EAS_SCHEMA_UID to ${ENV_FILE}`);
  }
}

/* ─── Main ──────────────────────────────────────────────────────────── */

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  CivicPlus — EAS Schema Registration (Base Sepolia)");
  console.log("═══════════════════════════════════════════════════════════\n");

  const privateKey = loadPrivateKey();
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(privateKey, provider);

  console.log(`Network RPC  : ${RPC_URL}`);
  console.log(`Relayer Addr : ${signer.address}`);

  // Check balance
  const balance = await provider.getBalance(signer.address);
  console.log(`ETH Balance  : ${ethers.formatEther(balance)} ETH\n`);

  if (balance === BigInt(0)) {
    console.error(
      "✗ Relayer wallet has 0 ETH. Fund it via Base Sepolia faucet first."
    );
    console.error("  → https://www.alchemy.com/faucets/base-sepolia");
    process.exit(1);
  }

  // Initialize SchemaRegistry
  const schemaRegistry = new SchemaRegistry(SCHEMA_REGISTRY_ADDRESS);
  schemaRegistry.connect(signer);

  console.log(`Schema       : "${SCHEMA_STRING}"`);
  console.log(`Registry     : ${SCHEMA_REGISTRY_ADDRESS}`);
  console.log("");
  console.log("Registering schema on-chain...\n");

  try {
    const tx = await schemaRegistry.register({
      schema: SCHEMA_STRING,
      resolverAddress: ethers.ZeroAddress, // No resolver
      revocable: true,
    });

    console.log("Transaction submitted, waiting for confirmation...");
    const schemaUID = await tx.wait();

    console.log("\n╔═══════════════════════════════════════════════════════╗");
    console.log("║  ✓ Schema registered successfully!                   ║");
    console.log("╚═══════════════════════════════════════════════════════╝\n");
    console.log(`Schema UID: ${schemaUID}`);
    console.log(
      `EASScan   : https://base-sepolia.easscan.org/schema/view/${schemaUID}\n`
    );

    // Write to .env.local
    writeSchemaUidToEnv(schemaUID);

    console.log("\n✓ Done! Restart your Next.js dev server to pick up the new env variable.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ Schema registration failed: ${message}`);

    if (message.includes("AlreadyExists")) {
      console.error(
        "\n  The schema is already registered. You need to look up its UID."
      );
      console.error(
        "  Visit https://base-sepolia.easscan.org and search for the schema."
      );
    }

    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});

# CivicPlus — AI-Powered Road Damage Audit Protocol

> **CivicPlus** is a decentralized civic-tech audit protocol combining Google Gemini Vision AI with Web3 on-chain attestations via the Ethereum Attestation Service (EAS) on Base Sepolia. It empowers citizens to report road damage, verifies reports with AI, records immutable cryptographic proofs on-chain, and enables verified contractors to resolve repairs with GPS proximity validation and AI Spatial Matching.

---

## 🌟 Key Features

1. **Citizen Road Damage Reporting**
   - Seamless report submission with camera capture or file upload.
   - Client-side image compression and automatic high-precision GPS coordinate acquisition.
   - Real-time Gemini Flash AI analysis for damage detection and severity scoring (1–100).

2. **On-Chain Attestation on Base Sepolia**
   - Gasless on-chain attestations for citizens powered by a backend relayer wallet via Ethereum Attestation Service (EAS).
   - Permanent cryptographic record with Base Sepolia transaction hash and EAS Attestation UID.

3. **Interactive Geospatial Map (Leaflet)**
   - City-wide visualization of road damage reports (pending inspection vs. resolved).
   - Smart radial spreading algorithm (`spreadOverlapping`) for markers at identical or nearby coordinates so every report remains clickable.
   - Direct explorer links to EAS Scan and BaseScan for complete transparency.

4. **Contractor Resolution Portal**
   - Protected by server-side PIN authentication (`CONTRACTOR_PIN`).
   - **GPS Proximity Validation:** Computes Haversine distance between original damage coordinates and contractor device location (max 200m tolerance) to prevent fraudulent remote resolution.
   - **AI Spatial Matcher:** Evaluates Before vs. After photos with POV-tolerant perspective matching to verify actual road repair quality.
   - Tracks resolution timestamp (`resolved_at`) and archives public repair imagery.

5. **Public Transparency & Auditability**
   - Transparent side-by-side Before/After photo comparison for all citizens on resolved road reports.
   - Verifiable transaction hash links to BaseScan and attestation links to EAS Scan.

---

## 🛠 Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) (App Router, Turbopack, React 19)
- **Language:** TypeScript
- **Styling:** Tailwind CSS, Lucide React icons
- **Database & Storage:** [Supabase](https://supabase.com/) (PostgreSQL + Supabase Storage)
- **AI Vision Engine:** Google Gemini Flash API (`gemini-3.5-flash`)
- **Blockchain / Attestation:**
  - Network: Base Sepolia Testnet
  - Protocol: Ethereum Attestation Service (EAS)
  - SDK: `@ethereum-attestation-service/eas-sdk`, Ethers.js v6
- **Maps:** Leaflet & React-Leaflet with OpenStreetMap tiles

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ installed
- A Supabase project with storage bucket `reports`
- A Google Gemini API Key
- A Base Sepolia relayer wallet with testnet ETH

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/civicplus.git
   cd civicplus
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env.local` file in the root directory:
   ```env
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

   # Google Gemini AI
   GEMINI_API_KEY=your-gemini-api-key
   GEMINI_MODEL=gemini-3.5-flash

   # Base Sepolia & EAS
   NEXT_PUBLIC_EAS_CONTRACT_ADDRESS=0x4200000000000000000000000000000000000021
   NEXT_PUBLIC_RPC_URL=https://sepolia.base.org
   EAS_SCHEMA_UID=0x2092f8d06766eb03c64b72446a755c5a9650d254c390a6074d35db43b00d4277
   PRIVATE_KEY_RELAYER=0xyour-relayer-private-key

   # RBAC PIN (Server-side only)
   CONTRACTOR_PIN=PUPR2026
   ```

4. **Database Setup:**
   Run the SQL scripts in `supabase/schema.sql` and `supabase/migrations/` in your Supabase SQL Editor.

5. **Run Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

6. **Production Build:**
   ```bash
   npm run build
   npm run start
   ```

---

## 🔒 Security & Privacy

- All private keys and service role keys are stored exclusively server-side and never exposed to the client.
- Contractor PIN verification is executed strictly on server routes (`/api/auth/role`), issuing time-limited HMAC bearer tokens (8-hour TTL).
- GPS location validation for repair resolution prevents spoofed or distant resolution claims.

---

## 📄 License

This project is open-source under the MIT License.

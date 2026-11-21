import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { RoleProvider } from "@/components/role/RoleContext";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CivicPlus — AI-Powered Road Damage Audit Protocol",
  description:
    "Decentralized public road damage inspection powered by AI analysis and Web3 on-chain attestations on Base Sepolia.",
  keywords: [
    "civic-tech",
    "road damage",
    "AI audit",
    "blockchain",
    "attestation",
    "EAS",
    "Base Sepolia",
    "CivicPlus",
  ],
  openGraph: {
    title: "CivicPlus — AI-Powered Road Damage Audit Protocol",
    description:
      "Decentralized public road damage inspection powered by AI analysis and Web3 on-chain attestations on Base Sepolia.",
    siteName: "CivicPlus",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} dark h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <RoleProvider>{children}</RoleProvider>
      </body>
    </html>
  );
}

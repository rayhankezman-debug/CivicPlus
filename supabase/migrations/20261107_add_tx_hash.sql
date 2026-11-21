-- CivicPlus — optional transparency column for public audits.
-- Stores the Base Sepolia transaction hash of each EAS attestation so the
-- public map can link directly to BaseScan.
-- Run once in the Supabase SQL editor.

alter table public.reports
  add column if not exists tx_hash text;


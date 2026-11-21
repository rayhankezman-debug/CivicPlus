-- ============================================
-- CivicPlus Database Schema
-- Supabase PostgreSQL DDL
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Reports table: stores road damage audit reports
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attestation_uid TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    image_url TEXT NOT NULL,
    severity_score INTEGER,
    status TEXT DEFAULT 'PENDING_INSPECTION',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================
-- Row Level Security (RLS) — MVP / Hackathon
-- Public read, insert, and update access
-- ============================================

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Allow public SELECT
CREATE POLICY "Allow public read access"
    ON reports
    FOR SELECT
    USING (true);

-- Allow public INSERT
CREATE POLICY "Allow public insert access"
    ON reports
    FOR INSERT
    WITH CHECK (true);

-- Allow public UPDATE
CREATE POLICY "Allow public update access"
    ON reports
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

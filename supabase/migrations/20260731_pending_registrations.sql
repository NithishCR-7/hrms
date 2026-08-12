-- Migration: Create pending_registrations table for owner-approval flow

CREATE TABLE IF NOT EXISTS public.pending_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL,
    company_email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(50),
    industry VARCHAR(255),
    admin_name VARCHAR(255) NOT NULL,
    admin_password TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS — only service role can access this table
ALTER TABLE public.pending_registrations ENABLE ROW LEVEL SECURITY;

-- No public policies — only service_role key can read/write
-- This ensures the temporary password data is not accessible via the anon key

-- Index for fast email lookups
CREATE INDEX IF NOT EXISTS idx_pending_reg_email ON public.pending_registrations(company_email);
CREATE INDEX IF NOT EXISTS idx_pending_reg_status ON public.pending_registrations(status);

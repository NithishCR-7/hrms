-- Migration: Add 'status' column to 'companies' table

-- 1. Add status column with CHECK constraint ('active' or 'pending') and default 'pending'
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending' 
CHECK (status IN ('active', 'pending'));

-- 2. Create index on status column for fast filtering (e.g. searching for active companies)
CREATE INDEX IF NOT EXISTS idx_companies_status ON public.companies(status);

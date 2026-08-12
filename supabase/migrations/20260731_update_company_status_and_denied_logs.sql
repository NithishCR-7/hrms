-- Migration: Add support for 'rejected' status and create denied_registration_logs table

-- 1. Drop existing CHECK constraint on companies table status if present and add updated constraint
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.constraint_column_usage 
        WHERE table_name = 'companies' AND constraint_name = 'companies_status_check'
    ) THEN
        ALTER TABLE public.companies DROP CONSTRAINT companies_status_check;
    END IF;
END $$;

ALTER TABLE public.companies 
DROP CONSTRAINT IF EXISTS companies_status_check;

ALTER TABLE public.companies 
ADD CONSTRAINT companies_status_check 
CHECK (status IN ('active', 'pending', 'rejected'));

-- 2. Create table for tracking denied company registration requests
CREATE TABLE IF NOT EXISTS public.denied_registration_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL,
    company_email VARCHAR(255) NOT NULL,
    admin_name VARCHAR(255),
    admin_id UUID,
    denied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reason TEXT DEFAULT 'Registration request rejected by system owner'
);

-- Index for fast lookup on denied registration emails
CREATE INDEX IF NOT EXISTS idx_denied_logs_email ON public.denied_registration_logs(company_email);

-- Enable RLS on denied_registration_logs
ALTER TABLE public.denied_registration_logs ENABLE ROW LEVEL SECURITY;

-- Allow select for service role / anon backend checks
CREATE POLICY "Allow server role select on denied logs" 
ON public.denied_registration_logs 
FOR SELECT 
USING (true);

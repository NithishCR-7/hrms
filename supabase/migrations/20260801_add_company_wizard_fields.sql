-- Migration: Add wizard and onboarding profile fields to public.companies
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS legal_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS established_year INTEGER,
ADD COLUMN IF NOT EXISTS country VARCHAR(100),
ADD COLUMN IF NOT EXISTS state VARCHAR(100),
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS is_setup_completed BOOLEAN DEFAULT false;

-- Update existing companies without explicitly completed setup to false
UPDATE public.companies 
SET is_setup_completed = false 
WHERE is_setup_completed IS NULL;

-- Create index on is_setup_completed for quick query filtering
CREATE INDEX IF NOT EXISTS idx_companies_is_setup_completed ON public.companies(is_setup_completed);

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create the 'companies' table
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50) NOT NULL,
    industry VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('active', 'pending')),
    admin_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create indexes on frequently queried columns
CREATE INDEX IF NOT EXISTS idx_companies_email ON public.companies(email);
CREATE INDEX IF NOT EXISTS idx_companies_admin_id ON public.companies(admin_id);
CREATE INDEX IF NOT EXISTS idx_companies_status ON public.companies(status);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Allow logged-in admins to view their own company details
CREATE POLICY "Admins can view their own company" 
ON public.companies 
FOR SELECT 
USING (auth.uid() = admin_id);

-- Allow admins to update their company details
CREATE POLICY "Admins can update their own company" 
ON public.companies 
FOR UPDATE 
USING (auth.uid() = admin_id);

-- Allow authenticated/anon server roles to insert new company during registration
CREATE POLICY "Allow company registration" 
ON public.companies 
FOR INSERT 
WITH CHECK (true);

-- 5. Trigger for auto-updating 'updated_at'
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

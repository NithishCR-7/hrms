-- Migration: Create employees table for employee invitation system
-- Copy and paste this ENTIRE script into Supabase Dashboard → SQL Editor and click "Run"

-- 1. Create function for updating timestamps if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- 2. Create public.employees table
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    department VARCHAR(100),
    designation VARCHAR(100),
    role VARCHAR(30) NOT NULL DEFAULT 'employee'
        CHECK (role IN ('hr_manager', 'hr_executive', 'team_lead', 'manager', 'employee')),
    username VARCHAR(100) UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending_offer'
        CHECK (status IN ('pending_offer', 'active', 'rejected', 'inactive')),
    auth_user_id UUID,
    invited_by UUID,
    must_change_password BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Update status constraint if table already exists
DO $$
BEGIN
    ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_status_check;
    ALTER TABLE public.employees ADD CONSTRAINT employees_status_check 
        CHECK (status IN ('pending_offer', 'active', 'rejected', 'inactive'));
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 3. Unique email per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_company_email
    ON public.employees(company_id, email);

-- 4. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_employees_company_id ON public.employees(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_auth_user_id ON public.employees(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_employees_role ON public.employees(role);
CREATE INDEX IF NOT EXISTS idx_employees_status ON public.employees(status);

-- 5. Enable Row Level Security
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies (Drop first to avoid collision on re-runs)
DROP POLICY IF EXISTS "Admins can view company employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can insert company employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can update company employees" ON public.employees;
DROP POLICY IF EXISTS "Employees can view own record" ON public.employees;

CREATE POLICY "Admins can view company employees"
ON public.employees FOR SELECT
USING (company_id IN (SELECT id FROM public.companies WHERE admin_id = auth.uid()));

CREATE POLICY "Admins can insert company employees"
ON public.employees FOR INSERT
WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE admin_id = auth.uid()));

CREATE POLICY "Admins can update company employees"
ON public.employees FOR UPDATE
USING (company_id IN (SELECT id FROM public.companies WHERE admin_id = auth.uid()));

CREATE POLICY "Employees can view own record"
ON public.employees FOR SELECT
USING (auth_user_id = auth.uid());

-- 7. Trigger for auto-updating 'updated_at'
DROP TRIGGER IF EXISTS update_employees_updated_at ON public.employees;
CREATE TRIGGER update_employees_updated_at
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Enable realtime for employees table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 9. Force PostgREST API schema cache reload immediately
NOTIFY pgrst, 'reload schema';

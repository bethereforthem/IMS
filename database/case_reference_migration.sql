-- ============================================================================
-- Case Reference Auto-Generation Migration
-- Run this in Supabase SQL Editor to fix case creation
-- ============================================================================

-- Sequence for case references (starts at 10 — seeds use 1-9 range implicitly)
CREATE SEQUENCE IF NOT EXISTS public.case_ref_seq START 10;

-- Function: generate case_reference as RWA-{INSTITUTION}-{YEAR}-{NNNNN}
CREATE OR REPLACE FUNCTION public.generate_case_reference()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.case_reference IS NULL OR NEW.case_reference = '' THEN
    NEW.case_reference := 'RWA-' || NEW.lead_institution::TEXT
                          || '-' || TO_CHAR(NOW(), 'YYYY')
                          || '-' || LPAD(NEXTVAL('public.case_ref_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger: fire BEFORE INSERT on cases
DO $$ BEGIN
  CREATE TRIGGER trg_cases_ref
    BEFORE INSERT ON public.cases
    FOR EACH ROW EXECUTE FUNCTION public.generate_case_reference();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- Investigation Reports Table
-- Stores full investigation report data for each case
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.investigation_reports (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id         UUID          NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  report_data     JSONB         NOT NULL DEFAULT '{}',
  status          TEXT          NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')),
  submitted_by    UUID          REFERENCES public.users(id),
  submitted_at    TIMESTAMPTZ,
  created_by      UUID          REFERENCES public.users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (case_id)
);

CREATE INDEX IF NOT EXISTS idx_investigation_reports_case_id
  ON public.investigation_reports(case_id);

CREATE INDEX IF NOT EXISTS idx_investigation_reports_status
  ON public.investigation_reports(status);

-- Auto-update updated_at on report changes
CREATE OR REPLACE FUNCTION public.update_investigation_report_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_investigation_reports_updated_at
    BEFORE UPDATE ON public.investigation_reports
    FOR EACH ROW EXECUTE FUNCTION public.update_investigation_report_timestamp();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS: only officers of the owning institution can read/write reports
ALTER TABLE public.investigation_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "investigation_reports_select"
    ON public.investigation_reports FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.cases c
        WHERE c.id = investigation_reports.case_id
          AND (
            c.lead_institution = (
              SELECT institution FROM public.users WHERE id = auth.uid()
            )
            OR (SELECT institution FROM public.users WHERE id = auth.uid()) = 'NISS'
          )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "investigation_reports_insert"
    ON public.investigation_reports FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.cases c
        WHERE c.id = investigation_reports.case_id
          AND c.lead_institution = (
            SELECT institution FROM public.users WHERE id = auth.uid()
          )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "investigation_reports_update"
    ON public.investigation_reports FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.cases c
        WHERE c.id = investigation_reports.case_id
          AND c.lead_institution = (
            SELECT institution FROM public.users WHERE id = auth.uid()
          )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- Added-by column to case_suspects (if missing)
-- ============================================================================
DO $$ BEGIN
  ALTER TABLE public.case_suspects ADD COLUMN IF NOT EXISTS added_by UUID REFERENCES public.users(id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

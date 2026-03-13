-- ============================================================
-- Migration 041: Indicator Types
-- • Add indicator_types table for per-org customizable note indicators
-- • Seed default "Readings" and "Shower" for existing orgs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.indicator_types (
  id           SERIAL PRIMARY KEY,
  org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#000000',
  sort_order   INT  NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, name)
);

ALTER TABLE public.indicator_types ENABLE ROW LEVEL SECURITY;

-- Org members can read their org's indicator types
CREATE POLICY "org members can read indicator types"
  ON public.indicator_types FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Admins and above can manage indicator types
CREATE POLICY "admins can manage indicator types"
  ON public.indicator_types FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid()
        AND org_role IN ('super_admin', 'admin', 'scheduler')
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid()
        AND org_role IN ('super_admin', 'admin', 'scheduler')
    )
  );

-- Seed default indicator types for existing orgs
INSERT INTO public.indicator_types (org_id, name, color, sort_order)
SELECT o.id, 'Readings', '#EF4444', 0
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.indicator_types it
  WHERE it.org_id = o.id AND it.name = 'Readings'
);

INSERT INTO public.indicator_types (org_id, name, color, sort_order)
SELECT o.id, 'Shower', '#1E293B', 1
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.indicator_types it
  WHERE it.org_id = o.id AND it.name = 'Shower'
);

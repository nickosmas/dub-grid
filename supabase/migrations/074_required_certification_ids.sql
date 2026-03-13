-- Migration 074: Replace required_designations TEXT[] with required_certification_ids BIGINT[]
--
-- The old TEXT[] column stored certification names as strings, which became
-- stale when certifications were renamed. The new BIGINT[] column stores
-- certification IDs, which are stable across renames.
--
-- Also drops the cascade RPC functions from migration 073 (no longer needed)
-- and adds an AFTER DELETE trigger on certifications to auto-remove deleted
-- IDs from shift_codes.required_certification_ids.

-- ── 1. Add new column ──────────────────────────────────────────────────────────

ALTER TABLE public.shift_codes
  ADD COLUMN IF NOT EXISTS required_certification_ids BIGINT[] NOT NULL DEFAULT '{}';

-- ── 2. Migrate data: resolve names → IDs ────────────────────────────────────────
-- For each shift_code row that has non-empty required_designations,
-- look up the certification IDs by matching name + company_id.
-- Stale/unrecognized names are silently dropped.

UPDATE public.shift_codes sc
SET required_certification_ids = (
  SELECT COALESCE(array_agg(c.id ORDER BY c.sort_order), '{}')
  FROM unnest(sc.required_designations) AS desig(name)
  JOIN public.certifications c
    ON c.company_id = sc.company_id AND c.name = desig.name
)
WHERE sc.required_designations != '{}';

-- ── 3. Drop old column ─────────────────────────────────────────────────────────

ALTER TABLE public.shift_codes DROP COLUMN IF EXISTS required_designations;

-- ── 4. Add GIN index for efficient array queries ───────────────────────────────

CREATE INDEX IF NOT EXISTS idx_shift_codes_required_cert_ids
  ON public.shift_codes USING GIN(required_certification_ids);

-- ── 5. Trigger: auto-remove deleted certification IDs ──────────────────────────

CREATE OR REPLACE FUNCTION public.remove_certification_from_shift_codes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.shift_codes
  SET required_certification_ids = array_remove(required_certification_ids, OLD.id)
  WHERE company_id = OLD.company_id
    AND OLD.id = ANY(required_certification_ids);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_certifications_delete_cascade ON public.certifications;

CREATE TRIGGER trg_certifications_delete_cascade
  AFTER DELETE ON public.certifications
  FOR EACH ROW
  EXECUTE FUNCTION public.remove_certification_from_shift_codes();

-- ── 6. Drop migration 073 RPC functions (superseded) ───────────────────────────

DROP FUNCTION IF EXISTS public.array_replace_in_shift_codes(uuid, text, text);
DROP FUNCTION IF EXISTS public.array_remove_from_shift_codes(uuid, text);
DROP FUNCTION IF EXISTS public.clean_stale_designations(uuid, text[]);

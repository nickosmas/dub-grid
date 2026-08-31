-- Role certification requirements - 2026-08-31
--
-- Existing databases need this in-place companion to migration 001. A role
-- lists the certifications that qualify someone for it; an empty list means
-- no certification requirement.

BEGIN;

ALTER TABLE public.organization_roles
  ADD COLUMN IF NOT EXISTS required_certification_ids BIGINT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS use_compact_role_certification_labels BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_organization_roles_required_cert_ids
  ON public.organization_roles USING GIN (required_certification_ids);

CREATE OR REPLACE FUNCTION public.remove_certification_from_assignments()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  UPDATE public.jobs
  SET required_certification_ids = array_remove(required_certification_ids, OLD.id)
  WHERE org_id = OLD.org_id
    AND OLD.id = ANY(required_certification_ids);

  UPDATE public.organization_roles
  SET required_certification_ids = array_remove(required_certification_ids, OLD.id)
  WHERE org_id = OLD.org_id
    AND OLD.id = ANY(required_certification_ids);

  RETURN OLD;
END;
$$;

COMMIT;

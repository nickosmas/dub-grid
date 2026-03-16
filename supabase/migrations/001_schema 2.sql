-- ============================================================================
-- Migration 001: Schema — Enums, Tables, Indexes, Constraints
--
-- Complete DubGrid schema as a single consolidated migration.
-- Replaces 96 incremental migrations (000–095).
-- ============================================================================


-- ══════════════════════════════════════════════════════════════════════════════
-- 1. ENUM TYPES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TYPE public.platform_role AS ENUM ('gridmaster', 'nexus_architect', 'none');
CREATE TYPE public.org_role AS ENUM ('super_admin', 'admin', 'user');
CREATE TYPE public.shift_series_frequency AS ENUM ('daily', 'weekly', 'biweekly');
CREATE TYPE public.employee_status AS ENUM ('active', 'benched', 'terminated');


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. TABLES
-- ══════════════════════════════════════════════════════════════════════════════

-- ── organizations ─────────────────────────────────────────────────────────────

CREATE TABLE public.organizations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL DEFAULT 'My Organization',
  slug                 TEXT UNIQUE,
  address              TEXT NOT NULL DEFAULT '',
  phone                TEXT NOT NULL DEFAULT '',
  employee_count       INTEGER,
  logo_url             TEXT,
  app_name             TEXT DEFAULT 'DubGrid',
  meta_description     TEXT DEFAULT 'Smart staff scheduling for care facilities',
  theme_config         JSONB DEFAULT '{}'::JSONB,
  landing_page_config  JSONB DEFAULT '{}'::JSONB,
  focus_area_label     TEXT,
  certification_label  TEXT,
  role_label           TEXT,
  timezone             TEXT,
  archived_at          TIMESTAMPTZ,
  created_by           UUID,
  updated_by           UUID,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

COMMENT ON COLUMN public.organizations.logo_url IS 'URL to the organization custom logo image';
COMMENT ON COLUMN public.organizations.app_name IS 'Custom display name for the application';
COMMENT ON COLUMN public.organizations.meta_description IS 'Custom SEO meta description';
COMMENT ON COLUMN public.organizations.theme_config IS 'JSON object containing primary_color, accent_color, etc.';
COMMENT ON COLUMN public.organizations.landing_page_config IS 'JSON object containing hero_title, features, and pain_points';


-- ── profiles ──────────────────────────────────────────────────────────────────

CREATE TABLE public.profiles (
  id             UUID PRIMARY KEY,
  org_id         UUID,
  platform_role  public.platform_role NOT NULL DEFAULT 'none',
  version        BIGINT NOT NULL DEFAULT 0,
  role_locked    BOOLEAN NOT NULL DEFAULT false,
  first_name     TEXT,
  last_name      TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT gridmaster_no_org CHECK (
    platform_role <> 'gridmaster' OR org_id IS NULL
  )
);

COMMENT ON COLUMN public.profiles.version IS 'Optimistic lock version counter for race-condition-safe role changes';
COMMENT ON COLUMN public.profiles.role_locked IS 'Flag indicating if role is currently locked during a change operation';
COMMENT ON CONSTRAINT gridmaster_no_org ON public.profiles IS 'Gridmasters cannot belong to an organization — they have global scope';


-- ── organization_memberships ──────────────────────────────────────────────────

CREATE TABLE public.organization_memberships (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           UUID NOT NULL,
  org_id            UUID NOT NULL,
  org_role          public.org_role NOT NULL DEFAULT 'user',
  admin_permissions JSONB,
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, org_id)
);


-- ── organization_roles ────────────────────────────────────────────────────────

CREATE TABLE public.organization_roles (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      UUID NOT NULL,
  name        TEXT NOT NULL,
  abbr        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ
);


-- ── focus_areas ───────────────────────────────────────────────────────────────

CREATE TABLE public.focus_areas (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      UUID NOT NULL,
  name        TEXT NOT NULL,
  color_bg    TEXT NOT NULL DEFAULT '#F1F5F9',
  color_text  TEXT NOT NULL DEFAULT '#475569',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_by  UUID,
  updated_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ONLY public.focus_areas REPLICA IDENTITY FULL;


-- ── certifications ────────────────────────────────────────────────────────────

CREATE TABLE public.certifications (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      UUID NOT NULL,
  name        TEXT NOT NULL,
  abbr        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ
);


-- ── employees ─────────────────────────────────────────────────────────────────

CREATE TABLE public.employees (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL,
  name              TEXT NOT NULL,
  seniority         INTEGER NOT NULL,
  phone             TEXT NOT NULL DEFAULT '',
  email             TEXT NOT NULL DEFAULT '',
  contact_notes     TEXT NOT NULL DEFAULT '',
  certification_id  BIGINT,
  role_ids          BIGINT[] NOT NULL DEFAULT '{}',
  focus_area_ids    INTEGER[] NOT NULL DEFAULT '{}',
  status            public.employee_status NOT NULL DEFAULT 'active',
  status_changed_at TIMESTAMPTZ,
  status_note       TEXT NOT NULL DEFAULT '',
  archived_at       TIMESTAMPTZ,
  created_by        UUID,
  updated_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ONLY public.employees REPLICA IDENTITY FULL;


-- ── shift_categories ──────────────────────────────────────────────────────────

CREATE TABLE public.shift_categories (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id        UUID NOT NULL,
  name          TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#F8FAFC',
  start_time    TIME,
  end_time      TIME,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  focus_area_id BIGINT,
  archived_at   TIMESTAMPTZ
);


-- ── shift_codes ───────────────────────────────────────────────────────────────

CREATE TABLE public.shift_codes (
  id                         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id                     UUID NOT NULL,
  label                      TEXT NOT NULL,
  name                       TEXT NOT NULL,
  color                      TEXT NOT NULL DEFAULT '#F8FAFC',
  border_color               TEXT NOT NULL DEFAULT '#CBD5E1',
  text_color                 TEXT NOT NULL DEFAULT '#64748B',
  is_general                 BOOLEAN NOT NULL DEFAULT false,
  is_off_day                 BOOLEAN NOT NULL DEFAULT false,
  sort_order                 INTEGER NOT NULL DEFAULT 0,
  default_start_time         TIME,
  default_end_time           TIME,
  category_id                BIGINT,
  focus_area_id              INTEGER,
  required_certification_ids BIGINT[] NOT NULL DEFAULT '{}',
  archived_at                TIMESTAMPTZ,
  created_by                 UUID,
  updated_by                 UUID,
  created_at                 TIMESTAMPTZ DEFAULT now(),
  updated_at                 TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ONLY public.shift_codes REPLICA IDENTITY FULL;


-- ── shifts ────────────────────────────────────────────────────────────────────

CREATE TABLE public.shifts (
  emp_id                   UUID NOT NULL,
  date                     DATE NOT NULL,
  org_id                   UUID,
  user_id                  UUID,
  version                  BIGINT NOT NULL DEFAULT 0,
  series_id                UUID,
  from_recurring           BOOLEAN NOT NULL DEFAULT false,
  custom_start_time        TIME,
  custom_end_time          TIME,
  draft_shift_code_ids     INTEGER[] NOT NULL DEFAULT '{}',
  published_shift_code_ids INTEGER[] NOT NULL DEFAULT '{}',
  draft_is_delete          BOOLEAN NOT NULL DEFAULT false,
  focus_area_id            INTEGER,
  created_by               UUID,
  updated_by               UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (emp_id, date)
);

ALTER TABLE ONLY public.shifts REPLICA IDENTITY FULL;


-- ── schedule_notes ────────────────────────────────────────────────────────────

CREATE TABLE public.schedule_notes (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id        UUID NOT NULL,
  emp_id        UUID NOT NULL,
  date          DATE NOT NULL,
  note_type     TEXT NOT NULL DEFAULT 'readings',
  status        TEXT NOT NULL DEFAULT 'published',
  focus_area_id INTEGER,
  created_by    UUID,
  updated_by    UUID,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT schedule_notes_note_type_check CHECK (note_type IN ('readings', 'shower')),
  CONSTRAINT schedule_notes_status_check CHECK (status IN ('published', 'draft', 'draft_deleted')),
  UNIQUE (emp_id, date, note_type, focus_area_id)
);

ALTER TABLE ONLY public.schedule_notes REPLICA IDENTITY FULL;


-- ── indicator_types ───────────────────────────────────────────────────────────

CREATE TABLE public.indicator_types (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      UUID NOT NULL,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#000000',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);


-- ── recurring_shifts ──────────────────────────────────────────────────────────

CREATE TABLE public.recurring_shifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_id          UUID NOT NULL,
  org_id          UUID NOT NULL,
  day_of_week     SMALLINT NOT NULL,
  shift_code_id   INTEGER,
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,
  archived_at     TIMESTAMPTZ,
  created_by      UUID,
  updated_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT recurring_shifts_day_of_week_check CHECK (day_of_week >= 0 AND day_of_week <= 6)
);


-- ── shift_series ──────────────────────────────────────────────────────────────

CREATE TABLE public.shift_series (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_id          UUID NOT NULL,
  org_id          UUID NOT NULL,
  frequency       public.shift_series_frequency NOT NULL,
  days_of_week    SMALLINT[],
  start_date      DATE NOT NULL,
  end_date        DATE,
  max_occurrences INTEGER,
  shift_code_id   INTEGER,
  archived_at     TIMESTAMPTZ,
  created_by      UUID,
  updated_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── invitations ───────────────────────────────────────────────────────────────

CREATE TABLE public.invitations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL,
  invited_by     UUID,
  email          TEXT NOT NULL,
  role_to_assign public.org_role NOT NULL DEFAULT 'user',
  token          UUID NOT NULL DEFAULT gen_random_uuid(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '72 hours',
  accepted_at    TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT one_pending_invite_per_email UNIQUE (org_id, email)
);

COMMENT ON TABLE public.invitations IS 'Organization invitations for invite-only registration. 72-hour expiry, atomic acceptance.';


-- ── role_change_log ───────────────────────────────────────────────────────────

CREATE TABLE public.role_change_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id     UUID NOT NULL,
  changed_by_id      UUID,
  from_role          TEXT NOT NULL,
  to_role            TEXT NOT NULL,
  idempotency_key    TEXT NOT NULL UNIQUE,
  change_type        TEXT NOT NULL DEFAULT 'role_change',
  permissions_before JSONB,
  permissions_after  JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_change_type CHECK (change_type IN ('role_change', 'permission_change'))
);

COMMENT ON TABLE public.role_change_log IS 'Immutable audit log for all role changes in the system';
COMMENT ON COLUMN public.role_change_log.change_type IS 'Type of change: role_change (org_role modified) or permission_change (admin_permissions modified)';
COMMENT ON COLUMN public.role_change_log.permissions_before IS 'Previous admin_permissions JSONB (only for permission_change entries)';
COMMENT ON COLUMN public.role_change_log.permissions_after IS 'New admin_permissions JSONB (only for permission_change entries)';


-- ── jwt_refresh_locks ─────────────────────────────────────────────────────────

CREATE TABLE public.jwt_refresh_locks (
  user_id      UUID PRIMARY KEY,
  locked_until TIMESTAMPTZ NOT NULL,
  reason       TEXT
);

COMMENT ON TABLE public.jwt_refresh_locks IS 'Temporary locks preventing JWT refresh during role transitions to avoid stale token race conditions';
COMMENT ON COLUMN public.jwt_refresh_locks.user_id IS 'User whose JWT refresh is temporarily blocked';
COMMENT ON COLUMN public.jwt_refresh_locks.locked_until IS 'Timestamp until which new token issuance is blocked';
COMMENT ON COLUMN public.jwt_refresh_locks.reason IS 'Reason for the lock (e.g., role_change, security_incident)';


-- ── impersonation_sessions ────────────────────────────────────────────────────

CREATE TABLE public.impersonation_sessions (
  session_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gridmaster_id  UUID NOT NULL,
  target_user_id UUID NOT NULL,
  target_org_id  UUID NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 minutes',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT one_active_session_per_target UNIQUE (gridmaster_id, target_user_id)
);

COMMENT ON TABLE public.impersonation_sessions IS 'Tracks active Gridmaster impersonation sessions for tenant user support';
COMMENT ON COLUMN public.impersonation_sessions.session_id IS 'Unique identifier for the impersonation session';
COMMENT ON COLUMN public.impersonation_sessions.gridmaster_id IS 'The Gridmaster user performing the impersonation';
COMMENT ON COLUMN public.impersonation_sessions.target_user_id IS 'The tenant user being impersonated';
COMMENT ON COLUMN public.impersonation_sessions.target_org_id IS 'The organization of the target user for scoping data access';
COMMENT ON COLUMN public.impersonation_sessions.expires_at IS 'Session expiry time (default 30 minutes from creation)';
COMMENT ON COLUMN public.impersonation_sessions.created_at IS 'Timestamp when the session was created';


-- ── user_sessions ─────────────────────────────────────────────────────────────

CREATE TABLE public.user_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL,
  device_label       TEXT,
  ip_address         INET,
  last_active_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  refresh_token_hash TEXT NOT NULL UNIQUE
);

COMMENT ON TABLE public.user_sessions IS 'Tracks individual device sessions for per-device session management';
COMMENT ON COLUMN public.user_sessions.device_label IS 'User-friendly device identifier (e.g., "Chrome on MacOS")';
COMMENT ON COLUMN public.user_sessions.ip_address IS 'IP address of the device at session creation';
COMMENT ON COLUMN public.user_sessions.refresh_token_hash IS 'Hashed refresh token for session identification - UNIQUE constraint prevents duplicate sessions';


-- ── schedule_draft_sessions ───────────────────────────────────────────────────

CREATE TABLE public.schedule_draft_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL,
  saved_by   UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  saved_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (org_id)
);


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. FOREIGN KEYS
-- ══════════════════════════════════════════════════════════════════════════════

-- organizations
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT organizations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- profiles
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

-- organization_memberships
ALTER TABLE public.organization_memberships
  ADD CONSTRAINT organization_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT organization_memberships_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- organization_roles
ALTER TABLE public.organization_roles
  ADD CONSTRAINT organization_roles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- focus_areas
ALTER TABLE public.focus_areas
  ADD CONSTRAINT focus_areas_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT focus_areas_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT focus_areas_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- certifications
ALTER TABLE public.certifications
  ADD CONSTRAINT certifications_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- employees
ALTER TABLE public.employees
  ADD CONSTRAINT employees_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT employees_certification_id_fkey FOREIGN KEY (certification_id) REFERENCES public.certifications(id) ON DELETE SET NULL,
  ADD CONSTRAINT employees_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT employees_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- shift_categories
ALTER TABLE public.shift_categories
  ADD CONSTRAINT shift_categories_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT shift_categories_focus_area_id_fkey FOREIGN KEY (focus_area_id) REFERENCES public.focus_areas(id) ON DELETE CASCADE;

-- shift_codes
ALTER TABLE public.shift_codes
  ADD CONSTRAINT shift_codes_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT shift_codes_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.shift_categories(id) ON DELETE SET NULL,
  ADD CONSTRAINT shift_codes_focus_area_id_fkey FOREIGN KEY (focus_area_id) REFERENCES public.focus_areas(id) ON DELETE SET NULL,
  ADD CONSTRAINT shift_codes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT shift_codes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- shifts
ALTER TABLE public.shifts
  ADD CONSTRAINT shifts_emp_id_fkey FOREIGN KEY (emp_id) REFERENCES public.employees(id) ON DELETE CASCADE,
  ADD CONSTRAINT shifts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT shifts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT shifts_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.shift_series(id) ON DELETE SET NULL,
  ADD CONSTRAINT shifts_focus_area_id_fkey FOREIGN KEY (focus_area_id) REFERENCES public.focus_areas(id) ON DELETE SET NULL,
  ADD CONSTRAINT shifts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT shifts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- schedule_notes
ALTER TABLE public.schedule_notes
  ADD CONSTRAINT schedule_notes_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT schedule_notes_emp_id_fkey FOREIGN KEY (emp_id) REFERENCES public.employees(id) ON DELETE CASCADE,
  ADD CONSTRAINT schedule_notes_focus_area_id_fkey FOREIGN KEY (focus_area_id) REFERENCES public.focus_areas(id) ON DELETE SET NULL,
  ADD CONSTRAINT schedule_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT schedule_notes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- indicator_types
ALTER TABLE public.indicator_types
  ADD CONSTRAINT indicator_types_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- recurring_shifts
ALTER TABLE public.recurring_shifts
  ADD CONSTRAINT recurring_shifts_emp_id_fkey FOREIGN KEY (emp_id) REFERENCES public.employees(id) ON DELETE CASCADE,
  ADD CONSTRAINT recurring_shifts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT recurring_shifts_shift_code_id_fkey FOREIGN KEY (shift_code_id) REFERENCES public.shift_codes(id) ON DELETE RESTRICT,
  ADD CONSTRAINT recurring_shifts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT recurring_shifts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- shift_series
ALTER TABLE public.shift_series
  ADD CONSTRAINT shift_series_emp_id_fkey FOREIGN KEY (emp_id) REFERENCES public.employees(id) ON DELETE CASCADE,
  ADD CONSTRAINT shift_series_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT shift_series_shift_code_id_fkey FOREIGN KEY (shift_code_id) REFERENCES public.shift_codes(id) ON DELETE RESTRICT,
  ADD CONSTRAINT shift_series_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT shift_series_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- invitations
ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- role_change_log
ALTER TABLE public.role_change_log
  ADD CONSTRAINT role_change_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id),
  ADD CONSTRAINT role_change_log_changed_by_id_fkey FOREIGN KEY (changed_by_id) REFERENCES auth.users(id);

-- jwt_refresh_locks
ALTER TABLE public.jwt_refresh_locks
  ADD CONSTRAINT jwt_refresh_locks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- impersonation_sessions
ALTER TABLE public.impersonation_sessions
  ADD CONSTRAINT impersonation_sessions_gridmaster_id_fkey FOREIGN KEY (gridmaster_id) REFERENCES auth.users(id),
  ADD CONSTRAINT impersonation_sessions_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id),
  ADD CONSTRAINT impersonation_sessions_target_org_id_fkey FOREIGN KEY (target_org_id) REFERENCES public.organizations(id);

-- user_sessions
ALTER TABLE public.user_sessions
  ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- schedule_draft_sessions
ALTER TABLE public.schedule_draft_sessions
  ADD CONSTRAINT schedule_draft_sessions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT schedule_draft_sessions_saved_by_fkey FOREIGN KEY (saved_by) REFERENCES auth.users(id);


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. INDEXES
-- ══════════════════════════════════════════════════════════════════════════════

-- organizations
CREATE INDEX idx_organizations_id ON public.organizations(id);

-- profiles
CREATE INDEX idx_profiles_org_id ON public.profiles(org_id);

-- organization_memberships
CREATE INDEX idx_org_memberships_user_id ON public.organization_memberships(user_id);
CREATE INDEX idx_org_memberships_org_id ON public.organization_memberships(org_id);
CREATE INDEX idx_org_memberships_org_user ON public.organization_memberships(org_id, user_id);

-- organization_roles
CREATE INDEX idx_organization_roles_org_id ON public.organization_roles(org_id);
CREATE UNIQUE INDEX organization_roles_org_name_active_unique ON public.organization_roles(org_id, name) WHERE archived_at IS NULL;
CREATE INDEX idx_organization_roles_active ON public.organization_roles(org_id) WHERE archived_at IS NULL;

-- focus_areas
CREATE INDEX idx_focus_areas_org_id ON public.focus_areas(org_id);
CREATE UNIQUE INDEX focus_areas_org_name_active_unique ON public.focus_areas(org_id, name) WHERE archived_at IS NULL;
CREATE INDEX idx_focus_areas_active ON public.focus_areas(org_id) WHERE archived_at IS NULL;

-- certifications
CREATE INDEX idx_certifications_org_id ON public.certifications(org_id);
CREATE UNIQUE INDEX certifications_org_name_active_unique ON public.certifications(org_id, name) WHERE archived_at IS NULL;
CREATE INDEX idx_certifications_active ON public.certifications(org_id) WHERE archived_at IS NULL;

-- employees
CREATE INDEX idx_employees_org_id ON public.employees(org_id);
CREATE INDEX idx_employees_certification_id ON public.employees(certification_id);
CREATE INDEX idx_employees_role_ids ON public.employees USING gin(role_ids);
CREATE INDEX idx_employees_focus_area_ids ON public.employees USING gin(focus_area_ids);
CREATE UNIQUE INDEX employees_org_name_active_unique ON public.employees(org_id, name) WHERE archived_at IS NULL;
CREATE INDEX idx_employees_active ON public.employees(org_id) WHERE archived_at IS NULL;
CREATE INDEX idx_employees_status ON public.employees(org_id, status) WHERE archived_at IS NULL;

-- shift_categories
CREATE UNIQUE INDEX shift_categories_global_name_unique ON public.shift_categories(org_id, name) WHERE focus_area_id IS NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX shift_categories_area_name_unique ON public.shift_categories(org_id, focus_area_id, name) WHERE focus_area_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX idx_shift_categories_active ON public.shift_categories(org_id) WHERE archived_at IS NULL;

-- shift_codes
CREATE INDEX idx_shift_codes_org_id ON public.shift_codes(org_id);
CREATE UNIQUE INDEX shift_codes_org_label_global_unique ON public.shift_codes(org_id, label) WHERE focus_area_id IS NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX shift_codes_org_label_focus_area_unique ON public.shift_codes(org_id, label, focus_area_id) WHERE focus_area_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX idx_shift_codes_active ON public.shift_codes(org_id) WHERE archived_at IS NULL;
CREATE INDEX idx_shift_codes_required_cert_ids ON public.shift_codes USING gin(required_certification_ids);

-- shifts
CREATE INDEX idx_shifts_emp_id ON public.shifts(emp_id);
CREATE INDEX idx_shifts_date ON public.shifts(date);
CREATE INDEX idx_shifts_org_date ON public.shifts(org_id, date);
CREATE INDEX idx_shifts_series_id ON public.shifts(series_id);
CREATE INDEX idx_shifts_draft_code_ids ON public.shifts USING gin(draft_shift_code_ids);
CREATE INDEX idx_shifts_published_code_ids ON public.shifts USING gin(published_shift_code_ids);

-- schedule_notes
CREATE INDEX idx_schedule_notes_org ON public.schedule_notes(org_id);
CREATE INDEX idx_schedule_notes_emp ON public.schedule_notes(emp_id);

-- indicator_types
CREATE UNIQUE INDEX indicator_types_org_name_active_unique ON public.indicator_types(org_id, name) WHERE archived_at IS NULL;
CREATE INDEX idx_indicator_types_active ON public.indicator_types(org_id) WHERE archived_at IS NULL;

-- recurring_shifts
CREATE INDEX idx_recurring_shifts_org ON public.recurring_shifts(org_id);
CREATE INDEX idx_recurring_shifts_emp ON public.recurring_shifts(emp_id);
CREATE INDEX idx_recurring_shifts_code_id ON public.recurring_shifts(shift_code_id);
CREATE UNIQUE INDEX recurring_shifts_emp_day_from_active_unique ON public.recurring_shifts(emp_id, day_of_week, effective_from) WHERE archived_at IS NULL;
CREATE INDEX idx_recurring_shifts_active ON public.recurring_shifts(org_id) WHERE archived_at IS NULL;

-- shift_series
CREATE INDEX idx_shift_series_org ON public.shift_series(org_id);
CREATE INDEX idx_shift_series_emp ON public.shift_series(emp_id);
CREATE INDEX idx_shift_series_code_id ON public.shift_series(shift_code_id);
CREATE INDEX idx_shift_series_active ON public.shift_series(org_id) WHERE archived_at IS NULL;

-- invitations
CREATE UNIQUE INDEX idx_invitations_token ON public.invitations(token);
CREATE INDEX idx_invitations_org_id ON public.invitations(org_id);
CREATE INDEX idx_invitations_expires_at ON public.invitations(expires_at);

-- role_change_log
CREATE INDEX idx_role_change_log_idempotency_key ON public.role_change_log(idempotency_key);
CREATE INDEX idx_role_change_log_target_user_created ON public.role_change_log(target_user_id, created_at DESC);

-- impersonation_sessions
CREATE INDEX idx_impersonation_sessions_expires_at ON public.impersonation_sessions(expires_at);

-- user_sessions
CREATE INDEX idx_user_sessions_user_last_active ON public.user_sessions(user_id, last_active_at DESC);


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. REALTIME
-- ══════════════════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.focus_areas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_codes;

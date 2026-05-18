-- ============================================================================
-- Migration 001: Schema — Enums, Tables, Indexes, Constraints
--
-- Complete DubGrid schema as a single consolidated migration.
-- Replaces 96 incremental migrations (000–095).
-- ============================================================================


-- ══════════════════════════════════════════════════════════════════════════════
-- 1. ENUM TYPES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TYPE public.platform_role AS ENUM ('gridmaster', 'none');
CREATE TYPE public.org_role AS ENUM ('super_admin', 'admin', 'user');
CREATE TYPE public.shift_series_frequency AS ENUM ('daily', 'weekly', 'biweekly');
CREATE TYPE public.employee_status AS ENUM ('active', 'benched', 'terminated');
CREATE TYPE public.employee_employment_type AS ENUM ('full_time', 'part_time');
CREATE TYPE public.shift_request_type AS ENUM ('pickup', 'swap', 'calloff');
CREATE TYPE public.shift_request_status AS ENUM ('open', 'pending_approval', 'approved', 'rejected', 'cancelled', 'expired');
CREATE TYPE public.profile_change_request_type AS ENUM ('profile_update', 'account_deletion');
CREATE TYPE public.profile_change_request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE public.department_type AS ENUM ('scheduled', 'management');
CREATE TYPE public.workspace_kind AS ENUM ('real', 'sandbox');


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. TABLES
-- ══════════════════════════════════════════════════════════════════════════════

-- ── organizations ─────────────────────────────────────────────────────────────

CREATE TABLE public.organizations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL DEFAULT 'My Organization',
  slug                 TEXT UNIQUE
    CONSTRAINT slug_format CHECK (
      slug IS NULL
      OR (
        slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
        AND slug NOT IN ('www','login','gridmaster','api','admin','status','app')
      )
    ),
  address              TEXT NOT NULL DEFAULT '',
  address_line_1       TEXT NOT NULL DEFAULT '',
  address_line_2       TEXT NOT NULL DEFAULT '',
  address_city         TEXT NOT NULL DEFAULT '',
  address_state        TEXT NOT NULL DEFAULT '',
  address_postal_code  TEXT NOT NULL DEFAULT '',
  address_country      TEXT NOT NULL DEFAULT '',
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
  department_label     TEXT,
  shift_display_mode   TEXT DEFAULT 'code'
    CONSTRAINT shift_display_mode_check CHECK (shift_display_mode IN ('code', 'name')),
  timezone             TEXT NOT NULL DEFAULT 'UTC',
  pay_period_start_date DATE,
  stripe_customer_id   TEXT UNIQUE,
  subscription_status  TEXT NOT NULL DEFAULT 'trialing',
  trial_ends_at        TIMESTAMPTZ DEFAULT (now() + interval '14 days'),
  subscription_seats   INTEGER,
  data_retention_days  INTEGER NOT NULL DEFAULT 365,
  archived_at          TIMESTAMPTZ,
  suspended_at                  TIMESTAMPTZ,
  suspended_reason              TEXT,
  workspace_kind            public.workspace_kind NOT NULL DEFAULT 'real',
  sandbox_source_org_id     UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  sandbox_owner_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sandbox_expires_at        TIMESTAMPTZ,
  sandbox_template_version  INTEGER,
  enforce_conflict_prevention   BOOLEAN NOT NULL DEFAULT false,
  coverage_rule_config JSONB NOT NULL DEFAULT '{"mentoredCoverageCreditPercent":100}'::jsonb,
  feature_overrides    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by           UUID,
  updated_by           UUID,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT organizations_trialing_requires_trial_end
    CHECK (subscription_status <> 'trialing' OR trial_ends_at IS NOT NULL)
);

COMMENT ON COLUMN public.organizations.suspended_at IS 'Non-null when the organization is suspended. Members are blocked from accessing the app.';
COMMENT ON COLUMN public.organizations.data_retention_days IS 'Number of days to retain archived/deleted data before permanent purge (default 365)';
COMMENT ON COLUMN public.organizations.stripe_customer_id IS 'Stripe customer ID for billing';
COMMENT ON COLUMN public.organizations.subscription_status IS 'Stripe subscription status: trialing, active, past_due, canceled, unpaid';
COMMENT ON COLUMN public.organizations.logo_url IS 'URL to the organization custom logo image';
COMMENT ON COLUMN public.organizations.app_name IS 'Custom display name for the application';
COMMENT ON COLUMN public.organizations.meta_description IS 'Custom SEO meta description';
COMMENT ON COLUMN public.organizations.theme_config IS 'JSON object containing primary_color, accent_color, etc.';
COMMENT ON COLUMN public.organizations.landing_page_config IS 'JSON object containing hero_title, features, and pain_points';
COMMENT ON COLUMN public.organizations.feature_overrides IS 'JSON object of per-org feature flag overrides. Keys are flag names, values are booleans. Checked before PostHog.';
COMMENT ON COLUMN public.organizations.pay_period_start_date IS 'Optional biweekly pay-period anchor date. When set, the 2-week schedule view aligns to 14-day periods starting on this date.';
COMMENT ON COLUMN public.organizations.coverage_rule_config IS 'Organization-level schedule coverage rules. mentoredCoverageCreditPercent controls how mentored assignments count toward coverage.';


-- ── profiles ──────────────────────────────────────────────────────────────────

CREATE TABLE public.profiles (
  id             UUID PRIMARY KEY,
  org_id         UUID,
  platform_role  public.platform_role NOT NULL DEFAULT 'none',
  version        BIGINT NOT NULL DEFAULT 0,
  role_locked    BOOLEAN NOT NULL DEFAULT false,
  mfa_enabled    BOOLEAN NOT NULL DEFAULT false,
  terms_accepted_at TIMESTAMPTZ,
  terms_version  TEXT,
  first_name     TEXT,
  last_name      TEXT,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now(),
  last_sign_in_at        TIMESTAMPTZ,
  scheduled_deletion_at  TIMESTAMPTZ,
  deactivation_warned_at TIMESTAMPTZ,
  deactivated_at         TIMESTAMPTZ,
  deactivated_by         UUID,

  CONSTRAINT gridmaster_no_org CHECK (
    platform_role <> 'gridmaster' OR org_id IS NULL
  )
);

COMMENT ON COLUMN public.profiles.version IS 'Optimistic lock version counter for race-condition-safe role changes';
COMMENT ON COLUMN public.profiles.role_locked IS 'Flag indicating if role is currently locked during a change operation';
COMMENT ON CONSTRAINT gridmaster_no_org ON public.profiles IS 'Gridmasters cannot belong to an organization — they have global scope';


-- ── organization_memberships ──────────────────────────────────────────────────

-- NOTE: Organization suspension columns (suspended_at, suspended_reason) are on the organizations table above.

CREATE TABLE public.organization_memberships (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           UUID NOT NULL,
  org_id            UUID NOT NULL,
  org_role          public.org_role NOT NULL DEFAULT 'user',
  admin_permissions          JSONB,
  joined_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  schedule_last_viewed_at    TIMESTAMPTZ,
  archived_at                TIMESTAMPTZ,
  archived_by                UUID,
  department_ids             BIGINT[] NOT NULL DEFAULT '{}',
  /** Subset of department_ids where this user is a dept admin (gets dept permission template). */
  dept_admin_ids             BIGINT[] NOT NULL DEFAULT '{}',
  phone                      TEXT,
  onboarding_completed_at    TIMESTAMPTZ,
  tooltip_tours_completed    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, org_id)
);


-- ── organization_roles ────────────────────────────────────────────────────────

CREATE TABLE public.organization_roles (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id        UUID NOT NULL,
  department_id BIGINT,
  name          TEXT NOT NULL,
  abbr          TEXT NOT NULL,
  is_schedule_role BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  archived_at   TIMESTAMPTZ
);


-- ── focus_areas ───────────────────────────────────────────────────────────────

CREATE TABLE public.focus_areas (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id         UUID NOT NULL,
  department_id  BIGINT,
  name           TEXT NOT NULL,
  color          TEXT NOT NULL DEFAULT '#E2E8F0',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  archived_at    TIMESTAMPTZ,
  created_by     UUID,
  updated_by     UUID,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ONLY public.focus_areas REPLICA IDENTITY FULL;


-- ── certifications ────────────────────────────────────────────────────────────

CREATE TABLE public.certifications (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id        UUID NOT NULL,
  department_id BIGINT,
  name          TEXT NOT NULL,
  abbr          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  archived_at   TIMESTAMPTZ
);


-- ── departments ──────────────────────────────────────────────────────────────
-- Two types: 'scheduled' (contain focus areas, appear on grid) and
-- 'management' (standalone, for non-schedule staff like HR, Reception).

CREATE TABLE public.departments (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      UUID NOT NULL,
  name        TEXT NOT NULL,
  abbr        TEXT NOT NULL DEFAULT '',
  type        public.department_type NOT NULL DEFAULT 'management',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  permissions JSONB,
  CONSTRAINT mgmt_permissions_only CHECK (type = 'management' OR permissions IS NULL)
);

COMMENT ON COLUMN public.departments.permissions IS
  'AdminPermissions JSONB for management departments. Defines what members can do. NULL for scheduled departments.';

ALTER TABLE ONLY public.departments REPLICA IDENTITY FULL;


-- ── employees ─────────────────────────────────────────────────────────────────

CREATE TABLE public.employees (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL,
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  seniority         INTEGER NOT NULL,
  phone             TEXT NOT NULL DEFAULT '',
  email             TEXT NOT NULL DEFAULT '',
  contact_notes     TEXT NOT NULL DEFAULT '',
  certification_id  BIGINT,
  role_ids          BIGINT[] NOT NULL DEFAULT '{}',
  focus_area_ids    BIGINT[] NOT NULL DEFAULT '{}',
  employment_type   public.employee_employment_type NOT NULL DEFAULT 'full_time',
  status            public.employee_status NOT NULL DEFAULT 'active',
  status_changed_at TIMESTAMPTZ,
  status_note       TEXT NOT NULL DEFAULT '',
  archived_at       TIMESTAMPTZ,
  created_by        UUID,
  updated_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  /** Linked Supabase auth user. Set when invitation is accepted. */
  user_id           UUID,
  /** Management department IDs (for employees who also belong to management departments). */
  department_ids    BIGINT[] NOT NULL DEFAULT '{}',
  /** Subset of department_ids where this employee is a dept admin (gets dept permission template). */
  dept_admin_ids    BIGINT[] NOT NULL DEFAULT '{}',
  /** Optimistic concurrency control version counter. */
  version           INTEGER NOT NULL DEFAULT 0
);

-- Non-empty contact details identify one active person per organization.
-- Historical/terminated rows are excluded once archived_at is set.
CREATE UNIQUE INDEX unique_active_employee_email_per_org
  ON public.employees (org_id, lower(btrim(email)))
  WHERE archived_at IS NULL AND btrim(email) <> '';

CREATE UNIQUE INDEX unique_active_employee_phone_per_org
  ON public.employees (org_id, regexp_replace(phone, '[^0-9]+', '', 'g'))
  WHERE archived_at IS NULL AND regexp_replace(phone, '[^0-9]+', '', 'g') <> '';

ALTER TABLE ONLY public.employees REPLICA IDENTITY FULL;


-- ── shift_categories ──────────────────────────────────────────────────────────

CREATE TABLE public.shift_categories (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id        UUID NOT NULL,
  name          TEXT NOT NULL,
  abbr          TEXT,
  start_time    TIME,
  end_time      TIME,
  color         TEXT NOT NULL DEFAULT '#E2E8F0',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  focus_area_id BIGINT,
  break_minutes INTEGER DEFAULT NULL,
  archived_at   TIMESTAMPTZ
);


-- ── jobs ─────────────────────────────────────────────────────────────────────

CREATE TABLE public.jobs (
  id                         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id                     UUID NOT NULL,
  name                       TEXT NOT NULL,
  abbr                       TEXT NOT NULL,
  show_on_grid               BOOLEAN NOT NULL DEFAULT true,
  assignment_mode            TEXT NOT NULL DEFAULT 'with_shift',
  eligibility_mode           TEXT NOT NULL DEFAULT 'and',
  focus_area_ids             BIGINT[] NOT NULL DEFAULT '{}',
  department_ids             BIGINT[] NOT NULL DEFAULT '{}',
  applicable_shift_ids       BIGINT[] NOT NULL DEFAULT '{}',
  eligible_role_ids          BIGINT[] NOT NULL DEFAULT '{}',
  required_certification_ids BIGINT[] NOT NULL DEFAULT '{}',
  color                      TEXT NOT NULL DEFAULT '#E2E8F0',
  border_color               TEXT NOT NULL DEFAULT 'transparent',
  text_color                 TEXT NOT NULL DEFAULT '#1E293B',
  shift_time_overrides       JSONB NOT NULL DEFAULT '{}'::jsonb,
  shift_color_overrides      JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_start_time         TIME,
  default_end_time           TIME,
  default_duration_hours     SMALLINT,
  default_duration_minutes   SMALLINT,
  sort_order                 INTEGER NOT NULL DEFAULT 0,
  system_key                 TEXT,
  archived_at                TIMESTAMPTZ,
  created_by                 UUID,
  updated_by                 UUID,
  created_at                 TIMESTAMPTZ DEFAULT now(),
  updated_at                 TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT jobs_assignment_mode_check CHECK (assignment_mode IN ('with_shift', 'shiftless', 'both')),
  CONSTRAINT jobs_eligibility_mode_check CHECK (eligibility_mode IN ('and', 'or'))
);

ALTER TABLE ONLY public.jobs REPLICA IDENTITY FULL;

-- ── absence_types ───────────────────────────────────────────────────────────

CREATE TABLE public.absence_types (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id       UUID NOT NULL,
  label        TEXT NOT NULL,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#E2E8F0',
  border_color TEXT NOT NULL DEFAULT 'transparent',
  text_color   TEXT NOT NULL DEFAULT '#1E293B',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  archived_at  TIMESTAMPTZ,
  created_by   UUID,
  updated_by   UUID,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ONLY public.absence_types REPLICA IDENTITY FULL;


-- ── schedule_cells ───────────────────────────────────────────────────────────

CREATE TABLE public.schedule_cells (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_id                     UUID NOT NULL,
  date                       DATE NOT NULL,
  org_id                     UUID NOT NULL,
  focus_area_id              BIGINT,
  version                    BIGINT NOT NULL DEFAULT 0,
  series_id                  UUID,
  from_recurring             BOOLEAN NOT NULL DEFAULT false,
  created_by                 UUID,
  updated_by                 UUID,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (emp_id, date)
);

ALTER TABLE ONLY public.schedule_cells REPLICA IDENTITY FULL;


-- ── schedule_cell_snapshots ──────────────────────────────────────────────────

CREATE TABLE public.schedule_cell_snapshots (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_id                    UUID NOT NULL,
  org_id                     UUID NOT NULL,
  snapshot_kind              TEXT NOT NULL,
  state_kind                 TEXT NOT NULL,
  absence_type_id            BIGINT,
  custom_start_time          TEXT,
  custom_end_time            TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (cell_id, snapshot_kind)
);

ALTER TABLE ONLY public.schedule_cell_snapshots REPLICA IDENTITY FULL;

ALTER TABLE public.schedule_cell_snapshots ADD CONSTRAINT schedule_cell_snapshots_snapshot_kind_check
  CHECK (snapshot_kind IN ('draft', 'published'));

ALTER TABLE public.schedule_cell_snapshots ADD CONSTRAINT schedule_cell_snapshots_state_kind_check
  CHECK (state_kind IN ('worked', 'absence', 'deleted'));

ALTER TABLE public.schedule_cell_snapshots ADD CONSTRAINT schedule_cell_snapshots_valid_times
  CHECK (
    custom_start_time IS NULL
    OR custom_end_time IS NULL
    OR custom_start_time <> custom_end_time
  );

ALTER TABLE public.schedule_cell_snapshots ADD CONSTRAINT schedule_cell_snapshots_valid_state
  CHECK (
    (state_kind = 'worked' AND absence_type_id IS NULL)
    OR (
      state_kind = 'absence'
      AND absence_type_id IS NOT NULL
      AND custom_start_time IS NULL
      AND custom_end_time IS NULL
    )
    OR (
      state_kind = 'deleted'
      AND absence_type_id IS NULL
      AND custom_start_time IS NULL
      AND custom_end_time IS NULL
    )
  );


-- ── schedule_cell_segments ───────────────────────────────────────────────────

CREATE TABLE public.schedule_cell_segments (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id                UUID NOT NULL,
  org_id                     UUID NOT NULL,
  position                   INTEGER NOT NULL,
  shift_id                   BIGINT,
  job_id                     BIGINT NOT NULL,
  is_mentored                BOOLEAN NOT NULL DEFAULT false,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (snapshot_id, position)
);

ALTER TABLE ONLY public.schedule_cell_segments REPLICA IDENTITY FULL;

ALTER TABLE public.schedule_cell_segments ADD CONSTRAINT schedule_cell_segments_position_check
  CHECK (position >= 0);


-- ── indicator_types ───────────────────────────────────────────────────────────

CREATE TABLE public.indicator_types (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      UUID NOT NULL,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#000000',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  UUID,
  updated_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ
);


-- ── schedule_notes ────────────────────────────────────────────────────────────

CREATE TABLE public.schedule_notes (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id            UUID NOT NULL,
  emp_id            UUID NOT NULL,
  date              DATE NOT NULL,
  indicator_type_id INTEGER NOT NULL REFERENCES public.indicator_types(id),
  status            TEXT NOT NULL DEFAULT 'published',
  focus_area_id     BIGINT,
  created_by        UUID,
  updated_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT schedule_notes_status_check CHECK (status IN ('published', 'draft', 'draft_deleted')),
  UNIQUE (emp_id, date, indicator_type_id, focus_area_id)
);

ALTER TABLE ONLY public.schedule_notes REPLICA IDENTITY FULL;


-- ── recurring_shifts ────────────────────────────────────────────────────────────

CREATE TABLE public.recurring_shifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_id          UUID NOT NULL,
  org_id          UUID NOT NULL,
  day_of_week     SMALLINT NOT NULL,
  state           JSONB NOT NULL,
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,
  archived_at     TIMESTAMPTZ,
  created_by      UUID,
  updated_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT recurring_shifts_day_of_week_check CHECK (day_of_week >= 0 AND day_of_week <= 6),
  CONSTRAINT valid_effective_range CHECK (effective_until IS NULL OR effective_from <= effective_until)
);


-- ── shift_series ──────────────────────────────────────────────────────────────

CREATE TABLE public.shift_series (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_id          UUID NOT NULL,
  org_id          UUID NOT NULL,
  state           JSONB NOT NULL,
  frequency       public.shift_series_frequency NOT NULL,
  days_of_week    SMALLINT[],
  start_date      DATE NOT NULL,
  end_date        DATE,
  max_occurrences INTEGER,
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
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  /** Employee record this invitation is for. Set when inviting from staff page. */
  employee_id    UUID,
  /** For app-only invitations: store invitee details before account creation. */
  first_name     TEXT,
  last_name      TEXT,
  phone          TEXT,
  department_ids BIGINT[] NOT NULL DEFAULT '{}',
  /** Subset of department_ids where this invitee will be a dept admin. */
  dept_admin_ids BIGINT[] NOT NULL DEFAULT '{}'
);

-- Only one pending (non-accepted, non-revoked) invitation per email per org.
-- Allows multiple historical rows (accepted/revoked) for the same email.
CREATE UNIQUE INDEX one_pending_invite_per_email
  ON public.invitations (org_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

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
  justification  TEXT NOT NULL DEFAULT '',
  ip_address     INET,
  user_agent     TEXT,
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 minutes',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at       TIMESTAMPTZ,
  end_reason     TEXT CHECK (end_reason IN ('manual', 'expired', 'navigation')),

  CONSTRAINT no_self_impersonation CHECK (gridmaster_id != target_user_id)
);

COMMENT ON TABLE public.impersonation_sessions IS 'Tracks Gridmaster impersonation sessions (active and historical) for tenant user support';
COMMENT ON COLUMN public.impersonation_sessions.session_id IS 'Unique identifier for the impersonation session';
COMMENT ON COLUMN public.impersonation_sessions.gridmaster_id IS 'The Gridmaster user performing the impersonation';
COMMENT ON COLUMN public.impersonation_sessions.target_user_id IS 'The tenant user being impersonated';
COMMENT ON COLUMN public.impersonation_sessions.target_org_id IS 'The organization of the target user for scoping data access';
COMMENT ON COLUMN public.impersonation_sessions.justification IS 'Mandatory reason for why the impersonation was started (e.g. "Investigating scheduling bug reported in ticket #1234")';
COMMENT ON COLUMN public.impersonation_sessions.ip_address IS 'IP address of the gridmaster when the session was created';
COMMENT ON COLUMN public.impersonation_sessions.user_agent IS 'Browser user-agent string of the gridmaster at session creation';
COMMENT ON COLUMN public.impersonation_sessions.expires_at IS 'Session expiry time (default 30 minutes from creation)';
COMMENT ON COLUMN public.impersonation_sessions.created_at IS 'Timestamp when the session was created';
COMMENT ON COLUMN public.impersonation_sessions.ended_at IS 'When the session was ended. NULL means still active or pending expiry';
COMMENT ON COLUMN public.impersonation_sessions.end_reason IS 'How the session ended: manual (user clicked end), expired (time ran out), navigation (gridmaster navigated to /gridmaster)';
COMMENT ON CONSTRAINT no_self_impersonation ON public.impersonation_sessions IS 'Prevents a gridmaster from impersonating themselves';


-- ── notifications ───────────────────────────────────────────────────────────

CREATE TABLE public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  org_id     UUID,
  type       TEXT NOT NULL CHECK (type IN (
    'impersonation_start', 'impersonation_end', 'system',
    'shift_change', 'schedule_published', 'shift_request_new',
    'shift_request_approved', 'shift_request_rejected'
  )),
  channel    TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email')),
  category   TEXT,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  metadata   JSONB DEFAULT '{}'::JSONB,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notifications IS 'In-app and email notifications for users';


-- ── profile_change_requests ─────────────────────────────────────────────────

CREATE TABLE public.profile_change_requests (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                     UUID NOT NULL,
  requester_user_id          UUID,
  requester_employee_id      UUID,
  requester_employee_version INTEGER,
  requester_name             TEXT NOT NULL DEFAULT '',
  requester_email            TEXT,
  request_type               public.profile_change_request_type NOT NULL,
  status                     public.profile_change_request_status NOT NULL DEFAULT 'pending',
  requested_changes          JSONB NOT NULL DEFAULT '{}'::JSONB,
  current_values             JSONB NOT NULL DEFAULT '{}'::JSONB,
  request_note               TEXT NOT NULL DEFAULT '',
  resolver_user_id           UUID,
  resolver_note              TEXT NOT NULL DEFAULT '',
  resolved_at                TIMESTAMPTZ,
  cancelled_at               TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  version                    INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT profile_change_requests_changes_object
    CHECK (jsonb_typeof(requested_changes) = 'object'),
  CONSTRAINT profile_change_requests_current_object
    CHECK (jsonb_typeof(current_values) = 'object'),
  CONSTRAINT profile_change_requests_resolved_state
    CHECK (
      (status IN ('approved', 'rejected') AND resolved_at IS NOT NULL AND resolver_user_id IS NOT NULL)
      OR (status NOT IN ('approved', 'rejected') AND resolved_at IS NULL)
    ),
  CONSTRAINT profile_change_requests_cancelled_state
    CHECK (
      (status = 'cancelled' AND cancelled_at IS NOT NULL)
      OR (status <> 'cancelled' AND cancelled_at IS NULL)
    )
);

ALTER TABLE ONLY public.profile_change_requests REPLICA IDENTITY FULL;


-- ── notification_preferences ────────────────────────────────────────────────

CREATE TABLE public.notification_preferences (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID NOT NULL UNIQUE,
  prefs      JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notification_preferences IS 'Per-user notification channel preferences (in_app/email toggles per category)';


-- ── mobile_device_tokens ────────────────────────────────────────────────────

CREATE TABLE public.mobile_device_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  org_id          UUID NOT NULL,
  platform        TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  expo_push_token TEXT NOT NULL UNIQUE,
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mobile_device_tokens IS 'Expo push tokens for native iOS/Android devices. One row per app install token.';


-- ── user_sessions ─────────────────────────────────────────────────────────────

CREATE TABLE public.user_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL,
  org_id             UUID,
  active_org_id      UUID,
  supabase_session_id UUID UNIQUE,
  platform           TEXT,
  app_version        TEXT,
  device_label       TEXT,
  ip_address         INET,
  last_active_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  refresh_token_hash TEXT UNIQUE
);

COMMENT ON TABLE public.user_sessions IS 'Tracks individual device sessions for per-device session management';
COMMENT ON COLUMN public.user_sessions.org_id IS 'Snapshot of the JWT org_id at the last presence ping (audit only — not authoritative for claims)';
COMMENT ON COLUMN public.user_sessions.active_org_id IS 'Authoritative per-session org context read by custom_access_token_hook on JWT refresh. Set by switch_org; falls back to profiles.org_id when NULL';
COMMENT ON COLUMN public.user_sessions.supabase_session_id IS 'Supabase auth session_id claim for correlating web and mobile sessions';
COMMENT ON COLUMN public.user_sessions.platform IS 'Client platform for the session (web, ios, android)';
COMMENT ON COLUMN public.user_sessions.app_version IS 'Client application version when reported';
COMMENT ON COLUMN public.user_sessions.device_label IS 'User-friendly device identifier (e.g., "Chrome on MacOS")';
COMMENT ON COLUMN public.user_sessions.ip_address IS 'IP address of the device at session creation';
COMMENT ON COLUMN public.user_sessions.refresh_token_hash IS 'Hashed refresh token for session identification. UNIQUE prevents duplicates; NULL allowed for rows created by switch_org before the client first calls track-session';


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


-- ── publish_history ──────────────────────────────────────────────────────────

CREATE TABLE public.publish_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL,
  published_by  UUID NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  change_count  INTEGER NOT NULL DEFAULT 0,
  changes       JSONB NOT NULL DEFAULT '[]'::JSONB,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_publish_history_org_date ON public.publish_history(org_id, published_at DESC);


-- ── recurring_shifts_draft_sessions ─────────────────────────────────────────

CREATE TABLE public.recurring_shifts_draft_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL,
  saved_by   UUID NOT NULL,
  draft_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  saved_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, saved_by)
);


-- ── coverage_requirements ─────────────────────────────────────────────────────

CREATE TABLE public.coverage_requirements (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id            UUID NOT NULL,
  focus_area_id     BIGINT NOT NULL,
  job_id            BIGINT NOT NULL,
  preferred_shift_id BIGINT,
  day_of_week       SMALLINT,          -- 0=Sun..6=Sat, NULL = every day
  min_staff         INTEGER NOT NULL DEFAULT 0,
  created_by        UUID,
  updated_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT coverage_req_day_check CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
  CONSTRAINT coverage_req_min_check CHECK (min_staff >= 0)
);

-- Unique: one requirement per (org, focus_area, assignment, day_of_week)
CREATE UNIQUE INDEX coverage_req_per_day_unique
  ON public.coverage_requirements(org_id, focus_area_id, job_id, preferred_shift_id, day_of_week)
  WHERE preferred_shift_id IS NOT NULL AND day_of_week IS NOT NULL;

CREATE UNIQUE INDEX coverage_req_every_day_unique
  ON public.coverage_requirements(org_id, focus_area_id, job_id, preferred_shift_id)
  WHERE preferred_shift_id IS NOT NULL AND day_of_week IS NULL;

CREATE UNIQUE INDEX coverage_req_shiftless_per_day_unique
  ON public.coverage_requirements(org_id, focus_area_id, job_id, day_of_week)
  WHERE preferred_shift_id IS NULL AND day_of_week IS NOT NULL;

CREATE UNIQUE INDEX coverage_req_shiftless_every_day_unique
  ON public.coverage_requirements(org_id, focus_area_id, job_id)
  WHERE preferred_shift_id IS NULL AND day_of_week IS NULL;

-- ── shift_requests ──────────────────────────────────────────────────────────

CREATE TABLE public.shift_requests (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      UUID NOT NULL,
  type                        public.shift_request_type NOT NULL,
  status                      public.shift_request_status NOT NULL DEFAULT 'open',
  requester_emp_id            UUID NOT NULL,
  requester_shift_date        DATE NOT NULL,
  requester_state             JSONB NOT NULL,
  target_emp_id               UUID,
  target_shift_date           DATE,
  target_state                JSONB,
  absence_type_id             BIGINT,
  parent_request_id           UUID,
  admin_user_id               UUID,
  admin_note                  TEXT,
  expires_at                  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '72 hours'),
  resolved_at                 TIMESTAMPTZ,
  idempotency_key             UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ONLY public.shift_requests REPLICA IDENTITY FULL;

-- Swaps must specify a target employee and target shift date
ALTER TABLE public.shift_requests ADD CONSTRAINT target_required_for_swap
  CHECK (type IN ('pickup', 'calloff') OR (target_emp_id IS NOT NULL AND target_shift_date IS NOT NULL));

-- Calloffs and targeted pickups must have an absence type; other requests must not
ALTER TABLE public.shift_requests ADD CONSTRAINT calloff_requires_absence_type
  CHECK (
    (type = 'calloff' AND absence_type_id IS NOT NULL)
    OR (
      type = 'pickup'
      AND (
        (target_emp_id IS NOT NULL AND target_shift_date IS NOT NULL AND absence_type_id IS NOT NULL)
        OR (target_emp_id IS NULL AND target_shift_date IS NULL AND absence_type_id IS NULL)
      )
    )
    OR (type = 'swap' AND absence_type_id IS NULL)
  );

-- Cannot swap with yourself
ALTER TABLE public.shift_requests ADD CONSTRAINT no_self_swap
  CHECK (requester_emp_id != target_emp_id OR target_emp_id IS NULL);

-- Expiry must be after creation
ALTER TABLE public.shift_requests ADD CONSTRAINT valid_expiry
  CHECK (expires_at > created_at);

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

-- departments
ALTER TABLE public.departments
  ADD CONSTRAINT departments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- focus_areas.department_id (parent scheduled department)
-- ON DELETE SET NULL: if a department is deleted, its child focus areas become orphaned
-- (department_id = NULL) and will not appear on the schedule grid. The app UI
-- (DepartmentsSettings) deletes child FAs before deleting the department, so this is
-- a safety net for direct DB operations.
ALTER TABLE public.focus_areas
  ADD CONSTRAINT focus_areas_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;

ALTER TABLE public.organization_roles
  ADD CONSTRAINT organization_roles_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;

ALTER TABLE public.certifications
  ADD CONSTRAINT certifications_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;

-- NOTE: organization_memberships.department_ids, invitations.department_ids, and
-- employees.department_ids are BIGINT[] arrays — no FK constraints (same pattern as
-- employees.focus_area_ids and employees.role_ids). Integrity enforced at app layer.

-- employees
ALTER TABLE public.employees
  ADD CONSTRAINT employees_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT employees_certification_id_fkey FOREIGN KEY (certification_id) REFERENCES public.certifications(id) ON DELETE SET NULL,
  ADD CONSTRAINT employees_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT employees_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT employees_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- shift_categories
ALTER TABLE public.shift_categories
  ADD CONSTRAINT shift_categories_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT shift_categories_focus_area_id_fkey FOREIGN KEY (focus_area_id) REFERENCES public.focus_areas(id) ON DELETE CASCADE;

-- jobs
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT jobs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- absence_types
ALTER TABLE public.absence_types
  ADD CONSTRAINT absence_types_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT absence_types_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT absence_types_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
-- schedule_cells
ALTER TABLE public.schedule_cells
  ADD CONSTRAINT schedule_cells_emp_id_fkey FOREIGN KEY (emp_id) REFERENCES public.employees(id) ON DELETE CASCADE,
  ADD CONSTRAINT schedule_cells_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT schedule_cells_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.shift_series(id) ON DELETE SET NULL,
  ADD CONSTRAINT schedule_cells_focus_area_id_fkey FOREIGN KEY (focus_area_id) REFERENCES public.focus_areas(id) ON DELETE SET NULL,
  ADD CONSTRAINT schedule_cells_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT schedule_cells_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- schedule_cell_snapshots
ALTER TABLE public.schedule_cell_snapshots
  ADD CONSTRAINT schedule_cell_snapshots_cell_id_fkey FOREIGN KEY (cell_id) REFERENCES public.schedule_cells(id) ON DELETE CASCADE,
  ADD CONSTRAINT schedule_cell_snapshots_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT schedule_cell_snapshots_absence_type_id_fkey FOREIGN KEY (absence_type_id) REFERENCES public.absence_types(id) ON DELETE SET NULL;

-- schedule_cell_segments
ALTER TABLE public.schedule_cell_segments
  ADD CONSTRAINT schedule_cell_segments_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.schedule_cell_snapshots(id) ON DELETE CASCADE,
  ADD CONSTRAINT schedule_cell_segments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- schedule_notes
ALTER TABLE public.schedule_notes
  ADD CONSTRAINT schedule_notes_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT schedule_notes_emp_id_fkey FOREIGN KEY (emp_id) REFERENCES public.employees(id) ON DELETE CASCADE,
  ADD CONSTRAINT schedule_notes_focus_area_id_fkey FOREIGN KEY (focus_area_id) REFERENCES public.focus_areas(id) ON DELETE SET NULL,
  ADD CONSTRAINT schedule_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT schedule_notes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- indicator_types
ALTER TABLE public.indicator_types
  ADD CONSTRAINT indicator_types_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT indicator_types_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT indicator_types_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- recurring_shifts
ALTER TABLE public.recurring_shifts
  ADD CONSTRAINT recurring_shifts_emp_id_fkey FOREIGN KEY (emp_id) REFERENCES public.employees(id) ON DELETE CASCADE,
  ADD CONSTRAINT recurring_shifts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT recurring_shifts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT recurring_shifts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- shift_series
ALTER TABLE public.shift_series
  ADD CONSTRAINT shift_series_emp_id_fkey FOREIGN KEY (emp_id) REFERENCES public.employees(id) ON DELETE CASCADE,
  ADD CONSTRAINT shift_series_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT shift_series_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT shift_series_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- invitations
ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT invitations_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;

-- role_change_log
ALTER TABLE public.role_change_log
  ADD CONSTRAINT role_change_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT role_change_log_changed_by_id_fkey FOREIGN KEY (changed_by_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- jwt_refresh_locks
ALTER TABLE public.jwt_refresh_locks
  ADD CONSTRAINT jwt_refresh_locks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- impersonation_sessions
ALTER TABLE public.impersonation_sessions
  ADD CONSTRAINT impersonation_sessions_gridmaster_id_fkey FOREIGN KEY (gridmaster_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT impersonation_sessions_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT impersonation_sessions_target_org_id_fkey FOREIGN KEY (target_org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- notifications
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- profile_change_requests
ALTER TABLE public.profile_change_requests
  ADD CONSTRAINT profile_change_requests_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT profile_change_requests_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT profile_change_requests_requester_employee_id_fkey FOREIGN KEY (requester_employee_id) REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD CONSTRAINT profile_change_requests_resolver_user_id_fkey FOREIGN KEY (resolver_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- mobile_device_tokens
ALTER TABLE public.mobile_device_tokens
  ADD CONSTRAINT mobile_device_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT mobile_device_tokens_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- user_sessions
ALTER TABLE public.user_sessions
  ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT user_sessions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD CONSTRAINT user_sessions_active_org_id_fkey FOREIGN KEY (active_org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

-- shift_requests
ALTER TABLE public.shift_requests
  ADD CONSTRAINT shift_requests_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT shift_requests_requester_emp_id_fkey FOREIGN KEY (requester_emp_id) REFERENCES public.employees(id) ON DELETE CASCADE,
  ADD CONSTRAINT shift_requests_target_emp_id_fkey FOREIGN KEY (target_emp_id) REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD CONSTRAINT shift_requests_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT shift_requests_absence_type_id_fkey FOREIGN KEY (absence_type_id) REFERENCES public.absence_types(id) ON DELETE SET NULL,
  ADD CONSTRAINT shift_requests_parent_request_id_fkey FOREIGN KEY (parent_request_id) REFERENCES public.shift_requests(id) ON DELETE SET NULL;

-- schedule_draft_sessions
ALTER TABLE public.schedule_draft_sessions
  ADD CONSTRAINT schedule_draft_sessions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT schedule_draft_sessions_saved_by_fkey FOREIGN KEY (saved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- recurring_shifts_draft_sessions
ALTER TABLE public.recurring_shifts_draft_sessions
  ADD CONSTRAINT recurring_shifts_draft_org_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT recurring_shifts_draft_user_fkey FOREIGN KEY (saved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- coverage_requirements
ALTER TABLE public.coverage_requirements
  ADD CONSTRAINT coverage_requirements_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT coverage_requirements_focus_area_id_fkey FOREIGN KEY (focus_area_id) REFERENCES public.focus_areas(id) ON DELETE CASCADE,
  ADD CONSTRAINT coverage_requirements_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE,
  ADD CONSTRAINT coverage_requirements_preferred_shift_id_fkey FOREIGN KEY (preferred_shift_id) REFERENCES public.shift_categories(id) ON DELETE CASCADE,
  ADD CONSTRAINT coverage_requirements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT coverage_requirements_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- publish_history
ALTER TABLE public.publish_history
  ADD CONSTRAINT publish_history_org_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT publish_history_user_fkey FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- terms_acceptances (FK added after table definition, see below)
-- subscriptions (FK added after table definition, see below)


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. INDEXES
-- ══════════════════════════════════════════════════════════════════════════════

-- organizations
CREATE INDEX idx_organizations_id ON public.organizations(id);

-- profiles
CREATE INDEX idx_profiles_org_id ON public.profiles(org_id);
CREATE INDEX idx_profiles_last_sign_in ON public.profiles(last_sign_in_at) WHERE last_sign_in_at IS NOT NULL;
CREATE INDEX idx_profiles_scheduled_deletion ON public.profiles(scheduled_deletion_at) WHERE scheduled_deletion_at IS NOT NULL;

-- organization_memberships
CREATE INDEX idx_org_memberships_user_id ON public.organization_memberships(user_id);
CREATE INDEX idx_org_memberships_org_id ON public.organization_memberships(org_id);
CREATE INDEX idx_org_memberships_org_user ON public.organization_memberships(org_id, user_id);

-- organization_roles
CREATE INDEX idx_organization_roles_org_id ON public.organization_roles(org_id);
CREATE UNIQUE INDEX organization_roles_org_name_dept_active_unique ON public.organization_roles(org_id, name, COALESCE(department_id, -1)) WHERE archived_at IS NULL;
CREATE INDEX idx_organization_roles_active ON public.organization_roles(org_id) WHERE archived_at IS NULL;
CREATE INDEX idx_organization_roles_schedule_active ON public.organization_roles(org_id) WHERE archived_at IS NULL AND is_schedule_role = true;
CREATE INDEX idx_organization_roles_department_id ON public.organization_roles(department_id) WHERE department_id IS NOT NULL;

-- focus_areas
CREATE INDEX idx_focus_areas_org_id ON public.focus_areas(org_id);
CREATE UNIQUE INDEX focus_areas_org_name_active_unique ON public.focus_areas(org_id, name) WHERE archived_at IS NULL;
CREATE INDEX idx_focus_areas_active ON public.focus_areas(org_id) WHERE archived_at IS NULL;

-- certifications
CREATE INDEX idx_certifications_org_id ON public.certifications(org_id);
CREATE UNIQUE INDEX certifications_org_name_dept_active_unique ON public.certifications(org_id, name, COALESCE(department_id, -1)) WHERE archived_at IS NULL;
CREATE INDEX idx_certifications_active ON public.certifications(org_id) WHERE archived_at IS NULL;
CREATE INDEX idx_certifications_department_id ON public.certifications(department_id) WHERE department_id IS NOT NULL;

-- departments
CREATE INDEX idx_departments_org_id ON public.departments(org_id);
CREATE UNIQUE INDEX departments_org_name_active_unique ON public.departments(org_id, name) WHERE archived_at IS NULL;
CREATE INDEX idx_departments_active ON public.departments(org_id) WHERE archived_at IS NULL;

-- employees
CREATE INDEX idx_employees_org_id ON public.employees(org_id);
CREATE INDEX idx_employees_certification_id ON public.employees(certification_id);
CREATE INDEX idx_employees_role_ids ON public.employees USING gin(role_ids);
CREATE INDEX idx_employees_focus_area_ids ON public.employees USING gin(focus_area_ids);
CREATE UNIQUE INDEX employees_org_name_active_unique ON public.employees(org_id, first_name, last_name) WHERE archived_at IS NULL;
CREATE INDEX idx_employees_active ON public.employees(org_id) WHERE archived_at IS NULL;
CREATE INDEX idx_employees_status ON public.employees(org_id, status) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX idx_employees_user_id_per_org ON public.employees(org_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_employees_user_id ON public.employees(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_employees_department_ids ON public.employees USING GIN (department_ids) WHERE department_ids != '{}';
CREATE INDEX idx_employees_dept_admin_ids ON public.employees USING GIN (dept_admin_ids) WHERE dept_admin_ids != '{}';
CREATE INDEX idx_focus_areas_department_id ON public.focus_areas(department_id) WHERE department_id IS NOT NULL;

-- shift_categories
CREATE UNIQUE INDEX shift_categories_global_name_unique ON public.shift_categories(org_id, name) WHERE focus_area_id IS NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX shift_categories_area_name_unique ON public.shift_categories(org_id, focus_area_id, name) WHERE focus_area_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX idx_shift_categories_active ON public.shift_categories(org_id) WHERE archived_at IS NULL;

-- jobs
CREATE INDEX idx_jobs_org_id ON public.jobs(org_id);
CREATE UNIQUE INDEX jobs_org_name_active_unique ON public.jobs(org_id, name) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX jobs_org_system_key_unique ON public.jobs(org_id, system_key) WHERE system_key IS NOT NULL;
CREATE INDEX idx_jobs_active ON public.jobs(org_id) WHERE archived_at IS NULL;
CREATE INDEX idx_jobs_focus_area_ids ON public.jobs USING gin(focus_area_ids);
CREATE INDEX idx_jobs_department_ids ON public.jobs USING gin(department_ids);
CREATE INDEX idx_jobs_applicable_shift_ids ON public.jobs USING gin(applicable_shift_ids);
CREATE INDEX idx_jobs_required_cert_ids ON public.jobs USING gin(required_certification_ids);
CREATE INDEX idx_jobs_eligible_role_ids ON public.jobs USING gin(eligible_role_ids);

-- absence_types
CREATE INDEX idx_absence_types_org_id ON public.absence_types(org_id);
CREATE UNIQUE INDEX absence_types_org_label_unique ON public.absence_types(org_id, label) WHERE archived_at IS NULL;
CREATE INDEX idx_absence_types_active ON public.absence_types(org_id) WHERE archived_at IS NULL;
-- schedule_cells
CREATE INDEX idx_schedule_cells_org_date ON public.schedule_cells(org_id, date);
CREATE INDEX idx_schedule_cells_emp_date ON public.schedule_cells(emp_id, date);
CREATE INDEX idx_schedule_cells_series_id ON public.schedule_cells(series_id);
CREATE INDEX idx_schedule_cells_focus_area_id ON public.schedule_cells(focus_area_id) WHERE focus_area_id IS NOT NULL;

-- schedule_cell_snapshots
CREATE INDEX idx_schedule_cell_snapshots_org_kind ON public.schedule_cell_snapshots(org_id, snapshot_kind);
CREATE INDEX idx_schedule_cell_snapshots_cell_id ON public.schedule_cell_snapshots(cell_id);

-- schedule_cell_segments
CREATE INDEX idx_schedule_cell_segments_snapshot_id ON public.schedule_cell_segments(snapshot_id);
CREATE INDEX idx_schedule_cell_segments_org_id ON public.schedule_cell_segments(org_id);
CREATE INDEX idx_schedule_cell_segments_job_id ON public.schedule_cell_segments(job_id);
CREATE INDEX idx_schedule_cell_segments_shift_id ON public.schedule_cell_segments(shift_id) WHERE shift_id IS NOT NULL;

-- schedule_notes
CREATE INDEX idx_schedule_notes_org ON public.schedule_notes(org_id);
CREATE INDEX idx_schedule_notes_emp ON public.schedule_notes(emp_id);
CREATE INDEX idx_schedule_notes_emp_date ON public.schedule_notes(emp_id, date);
CREATE INDEX idx_schedule_notes_indicator_type_id ON public.schedule_notes(indicator_type_id);

-- indicator_types
CREATE UNIQUE INDEX indicator_types_org_name_active_unique ON public.indicator_types(org_id, name) WHERE archived_at IS NULL;
CREATE INDEX idx_indicator_types_active ON public.indicator_types(org_id) WHERE archived_at IS NULL;

-- recurring_shifts
CREATE INDEX idx_recurring_shifts_org ON public.recurring_shifts(org_id);
CREATE INDEX idx_recurring_shifts_emp ON public.recurring_shifts(emp_id);
CREATE UNIQUE INDEX recurring_shifts_emp_day_from_active_unique ON public.recurring_shifts(emp_id, day_of_week, effective_from) WHERE archived_at IS NULL;
CREATE INDEX idx_recurring_shifts_active ON public.recurring_shifts(org_id) WHERE archived_at IS NULL;

-- shift_series
CREATE INDEX idx_shift_series_org ON public.shift_series(org_id);
CREATE INDEX idx_shift_series_emp ON public.shift_series(emp_id);
CREATE INDEX idx_shift_series_active ON public.shift_series(org_id) WHERE archived_at IS NULL;

-- invitations
CREATE UNIQUE INDEX idx_invitations_token ON public.invitations(token);
CREATE INDEX idx_invitations_org_id ON public.invitations(org_id);
CREATE INDEX idx_invitations_expires_at ON public.invitations(expires_at);
CREATE INDEX idx_invitations_employee_id ON public.invitations(employee_id) WHERE employee_id IS NOT NULL;

-- role_change_log
CREATE INDEX idx_role_change_log_idempotency_key ON public.role_change_log(idempotency_key);
CREATE INDEX idx_role_change_log_target_user_created ON public.role_change_log(target_user_id, created_at DESC);

-- impersonation_sessions
CREATE UNIQUE INDEX one_active_session_per_target
  ON public.impersonation_sessions (gridmaster_id, target_user_id)
  WHERE ended_at IS NULL;
CREATE INDEX idx_impersonation_sessions_expires_at ON public.impersonation_sessions(expires_at);
CREATE INDEX idx_impersonation_sessions_history ON public.impersonation_sessions(created_at DESC);

-- notifications
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user_all ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_org ON public.notifications(user_id, org_id, created_at DESC);

-- profile_change_requests
CREATE INDEX idx_profile_change_requests_org_status ON public.profile_change_requests(org_id, status, created_at DESC);
CREATE INDEX idx_profile_change_requests_requester ON public.profile_change_requests(requester_user_id, org_id, created_at DESC);
CREATE INDEX idx_profile_change_requests_employee ON public.profile_change_requests(requester_employee_id, created_at DESC) WHERE requester_employee_id IS NOT NULL;
CREATE UNIQUE INDEX one_pending_profile_change_request_per_type
  ON public.profile_change_requests(org_id, requester_user_id, request_type)
  WHERE status = 'pending';

-- mobile_device_tokens
CREATE INDEX idx_mobile_device_tokens_user_org ON public.mobile_device_tokens(user_id, org_id);
CREATE INDEX idx_mobile_device_tokens_active ON public.mobile_device_tokens(org_id, user_id) WHERE disabled_at IS NULL;

-- user_sessions
CREATE INDEX idx_user_sessions_user_last_active ON public.user_sessions(user_id, last_active_at DESC);
CREATE INDEX idx_user_sessions_user_supabase_session ON public.user_sessions(user_id, supabase_session_id);
CREATE INDEX idx_user_sessions_org_last_active ON public.user_sessions(org_id, last_active_at DESC);

-- coverage_requirements
CREATE INDEX idx_coverage_requirements_org ON public.coverage_requirements(org_id);
CREATE INDEX idx_coverage_requirements_lookup ON public.coverage_requirements(org_id, focus_area_id, job_id, preferred_shift_id);

-- shift_requests
CREATE INDEX idx_shift_requests_org_status ON public.shift_requests(org_id, status);
CREATE INDEX idx_shift_requests_requester ON public.shift_requests(requester_emp_id, status);
CREATE INDEX idx_shift_requests_target ON public.shift_requests(target_emp_id, status) WHERE target_emp_id IS NOT NULL;
CREATE INDEX idx_shift_requests_org_open_pickups ON public.shift_requests(org_id) WHERE type = 'pickup' AND status = 'open';
CREATE INDEX idx_shift_requests_expiry ON public.shift_requests(expires_at) WHERE status IN ('open', 'pending_approval');
CREATE INDEX idx_shift_requests_approved_calloffs ON public.shift_requests(org_id, requester_shift_date) WHERE type = 'calloff' AND status = 'approved';
CREATE INDEX idx_shift_requests_parent ON public.shift_requests(parent_request_id) WHERE parent_request_id IS NOT NULL;


-- ── cookie_consents ─────────────────────────────────────────────────────────

CREATE TABLE public.cookie_consents (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         UUID,
  ip_hash         TEXT NOT NULL,
  consent         JSONB NOT NULL DEFAULT '{"essential": true, "analytics": false}',
  consent_version TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cookie_consents IS 'Stores cookie consent records for compliance';


-- ── terms_acceptances ───────────────────────────────────────────────────────

CREATE TABLE public.terms_acceptances (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        UUID NOT NULL,
  terms_version  TEXT NOT NULL,
  accepted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address     INET,
  user_agent     TEXT
);

CREATE INDEX idx_terms_acceptances_user ON public.terms_acceptances(user_id);

COMMENT ON TABLE public.terms_acceptances IS 'Immutable audit trail of terms and conditions acceptances';

ALTER TABLE public.terms_acceptances
  ADD CONSTRAINT terms_acceptances_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- ── subscriptions ───────────────────────────────────────────────────────────

CREATE TABLE public.subscriptions (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id                UUID NOT NULL UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id    TEXT,
  status                TEXT NOT NULL DEFAULT 'trialing',
  price_id              TEXT,
  quantity              INTEGER NOT NULL DEFAULT 1,
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  cancel_at             TIMESTAMPTZ,
  canceled_at           TIMESTAMPTZ,
  trial_end             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_stripe_id ON public.subscriptions(stripe_subscription_id);

COMMENT ON TABLE public.subscriptions IS 'Stripe subscription tracking per organization';

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- ── audit_log ──────────────────────────────────────────────────────────────

CREATE TABLE public.audit_log (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id        UUID,
  actor_id      UUID,
  actor_email   TEXT,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  details       JSONB NOT NULL DEFAULT '{}',
  ip_address    INET,
  user_agent    TEXT,
  impersonation_session_id UUID,        -- set when action taken during impersonation
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_org_created ON public.audit_log(org_id, created_at DESC);
CREATE INDEX idx_audit_log_actor ON public.audit_log(actor_id);
CREATE INDEX idx_audit_log_resource ON public.audit_log(resource_type, resource_id);

COMMENT ON TABLE public.audit_log IS 'Comprehensive audit trail for all mutations across the platform';


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. REALTIME
-- ══════════════════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_cells;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_cell_snapshots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_cell_segments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.organizations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.focus_areas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_change_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.absence_types;
ALTER PUBLICATION supabase_realtime ADD TABLE public.coverage_requirements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_memberships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_roles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invitations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.certifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.departments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.indicator_types;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.impersonation_sessions;

-- 078: Payment grace and the lock alert (44f).
--
-- Stripe keeps retrying a failed payment; DubGrid decides when access stops.
-- The webhook records when an organization first needs payment attention, and
-- access locks once that start plus the organization's payment grace passes.
-- Existing rows are left without a start on purpose: a missing start never
-- locks, so nothing locks at deploy, and the next Stripe event for a
-- subscription still needing attention records one.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS payment_grace_started_at TIMESTAMPTZ;

-- The request proxy evaluates access as the signed-in member.
GRANT SELECT (payment_grace_started_at) ON TABLE public.organizations TO authenticated;

-- Super Admins are alerted when their organization locks, for a trial or a
-- payment. Re-created with the new type; NOT VALID then VALIDATE keeps the
-- check from blocking writes while existing rows are checked.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'impersonation_start', 'impersonation_end', 'system',
  'shift_change', 'schedule_published', 'shift_request_new',
  'shift_request_approved', 'shift_request_rejected', 'shift_request_expired',
  'recurring_shift_updated', 'shift_series_updated',
  'schedule_note_published', 'recurring_schedules_applied',
  'invitation_received', 'invitation_accepted', 'invitation_revoked',
  'invitation_resent', 'invitation_expired',
  'membership_removed', 'admin_permissions_changed', 'member_dept_changed',
  'employee_created', 'employee_status_changed', 'employee_profile_changed',
  'org_settings_changed', 'org_suspended', 'org_unsuspended',
  'billing_subscription_changed', 'billing_payment_failed',
  'billing_payment_succeeded',
  'billing_trial_ending_soon', 'billing_trial_expired',
  'billing_access_locked',
  'security_email_changed', 'security_password_changed',
  'security_mfa_changed', 'security_new_device', 'security_session_revoked',
  'org_created', 'org_trial_started', 'org_archived', 'org_restored',
  'org_subscription_converted', 'org_subscription_canceled', 'org_payment_failed'
)) NOT VALID;
ALTER TABLE public.notifications VALIDATE CONSTRAINT notifications_type_check;

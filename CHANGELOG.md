# Changelog

All notable changes to DubGrid are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- Realtime cache invalidation via CDC on config tables (useRealtimeInvalidation hook)
- StaleDataBanner component for connection loss / stale data warnings
- Comprehensive audit logging on all schedule-definition config mutations (jobs, shifts, employees, departments, coverage)
- Gridmaster: force logout, audit log for viewed_all_users
- `org_id` NOT NULL constraint on shifts table
- Custom time format validation constraints on shifts
- Org-scoped constraint on notifications table

### Changed
- usePermissions channel naming changed from random ID to deterministic (uid-based)
- All UPDATE queries in db.ts now include `org_id` WHERE clause for safety

---

## [0.1.0] — 2026-04-05

### Added
- Department hierarchy: two-type model (scheduled + management)
  - Scheduled departments contain focus areas as children
  - Management departments for non-schedule staff (HR, admin)
  - Department permission templates (JSONB) on management departments
  - Permission union: department permissions merged with direct user permissions
- People Hub: unified directory of employees, app-only users, and pending invitations
- 24 granular admin permissions (expanded from 16) with view/manage pattern
- Onboarding wizard upgrades and gridmaster portal improvements
- Session tracking (user_sessions table, track-session API route)
- Direct permission assignment for user-role members via department membership
- GDPR data export and account deletion endpoints
- Calendar export (iCalendar .ics format)
- Schedule export (PDF/CSV)
- Shift request approvals audit table
- Feature flags editor (per-org overrides)
- Organization suspension with middleware enforcement (Redis-cached)
- Publish history with JSONB change tracking

### Security
- org_id safety clauses on all UPDATE queries prevent cross-org mutations
- Shifts table org_id changed from nullable to NOT NULL
- Custom time format validation prevents malformed shift data

---

## [0.0.1] — 2026-03-01

### Added
- Initial release: multi-tenant scheduling platform
- Four-tier RBAC (Gridmaster > Super Admin > Admin > User)
- Schedule grid with 1-week, 2-week, and month views
- Draft/publish workflow with optimistic locking
- Recurring shifts and shift series
- Real-time collaboration (cell locks, presence, live sync)
- Dashboard analytics with expandable detail views
- Staff management with full employee lifecycle
- Staff detail pages (Overview, Schedule, Activity, Reports)
- Coverage requirements and status visualization
- Shift requests (pickup, swap, calloff) with approval workflow
- Gridmaster portal (org management, impersonation, audit logs)
- Invite-only registration with 72-hour tokens
- Password reset and email verification flows
- Print export with configurable layout
- Subdomain-based multi-tenancy
- Edge middleware for JWT verification and RBAC
- Row-Level Security on all tables

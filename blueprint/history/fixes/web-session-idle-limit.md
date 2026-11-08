# Fix: end idle web sessions on the server (F-204, part)

**Status:** complete

## Problem

The 30-minute web sign-out ran only in the browser. A session whose tab never
ran its timer (closed, or a stolen refresh token) stayed renewable for as long
as the refresh token lived.

## Fix

- Migration 128: `web_session_is_idle` and `touch_web_session`, and the token
  hook refuses to renew a `web` session with no activity for 35 minutes (the
  browser's 30 plus the gap between reports). A session already past the
  limit can't be revived by a leftover access token.
- The idle timer reports this tab's own activity (`onActivity`), and
  `InactivityGuard` sends it at most every 5 minutes to
  `POST /api/auth/session-activity`, which calls `touch_web_session` as the
  signed-in user (UI code doesn't call the database directly).
- iOS, Android and a session with no recorded platform are never checked: the
  app stays signed in until the person signs out (owner, 2026-11-08).

## Evidence

- `web-session-idle-limit.integration.test.ts` (8): idle web refused, active
  web renewed, mobile and unknown never limited, activity recorded on the
  caller's own session only, an idle session not revived. Run locally with
  102 to 128 applied inside rolled-back transactions.
- A hook test for reporting only this tab's activity.
- Type-check, lint and docs pass.

## Not in this fix

- An access token issued before the limit still works until it expires
  (at most an hour).
- Script-readable cookies (rest of F-204).

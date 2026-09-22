# Draft schedule state is editor-only

**Type:** Fix

**Status:** verified

**Fixes:** F-09 (archived as `runtime-resilience-webhook-deeplinks-paging-realtime/F-09`)

## The problem

Regular staff must only ever see the published schedule, including their own
row. Today three layers leak unpublished state to them:

- **Row-level policies.** `members_select_schedule_cell_snapshots` and
  `members_select_schedule_cell_segments` (`003_rls_policies.sql:601,620`)
  gate rows on the organization only, so any member can read draft
  snapshots and segments straight through the data API, and the Realtime
  CDC feed (`useOrgRealtimeInvalidation` subscribes to both tables) hands
  them draft rows. `members_select_schedule_notes` (`003:388`) likewise
  returns `draft` notes.
- **The notes route.** `POST /api/schedule/manage` `fetchNotes`
  (`apps/web/src/app/api/schedule/manage/route.ts:806`) returns every note
  regardless of status; only the client filters `draft` notes for viewers
  (`SchedulePageClient.tsx:3636`). The sibling `fetchShifts` action already
  redacts drafts server-side with `redactDraftForViewer`.
- **The draft broadcast.** Editors send `draft_changed` diffs built from the
  server echo (both snapshots) on the shared private topic
  `schedule:<org>` (`SchedulePageClient.tsx:3680`), which every member joins
  (`schedule_members_receive_realtime`, migration 013). Viewers' clients
  apply those diffs to their grid (`SchedulePageClient.tsx:1963`), so staff
  see edits before publication, and the payload reaches their socket even
  when the client ignores it.

The web read path (`fetchShifts` through the route) and every mobile read
(service role, `normalizePublishedScheduleRow`) already project the
published state; they are unaffected.

## The fix

- **Migration `035_draft_state_editor_only.sql`.** Restate the three member
  read policies so a member sees only published rows unless they hold
  `canEditShifts` (snapshots, segments) or `canEditShifts` / `canEditNotes`
  (notes): snapshots `snapshot_kind = 'published'`, segments through an
  `EXISTS` on their published parent snapshot, notes `status <> 'draft'`
  (`draft_deleted` is a published note pending removal and stays visible).
  Add two `realtime.messages` policies for the editor topic
  `schedule:<org>:drafts`, receive and send, with the same editor clause as
  `schedule_editors_send_realtime`; the shared topic's policies are
  untouched. Gridmaster and service-role paths are unchanged. Checksum
  locked; a clean local reset applies it.
- **Notes route.** `fetchNotes` drops `draft` notes for a caller without
  `canEditShifts` or `canEditNotes` and reports `draft_deleted` as
  `published` to them, mirroring `redactDraftForViewer`.
- **Editor topic.** Editors (`canEditShifts || canEditNotes`) join a second
  private channel `schedule:<org>:drafts` and send and receive
  `draft_changed` there through a second `useReliableRealtimeBroadcasts`
  instance; viewers never join it and their `draft_changed` handler goes
  away. Presence, `editing_cell`, `editor_session_ended`,
  `schedule_published` and `drafts_discarded` stay on the shared topic so
  viewers still refetch on publish and discard. Channel names and the
  join decision live in `_lib/realtime-channel.ts` with unit tests.

Must not break: editor draft diffs between two editor tabs, the being-edited
markers, publish and discard refetches for viewers, the mobile schedule,
dashboard coverage (service role), the sandbox (`is_own_sandbox_org` clause
kept on the new policies), and the seed.

## Build steps

- [x] **1. Migration 035 with text and live tests** - the three restated
      read policies, the two editor-topic policies, checksum. Done when
      `db:migrations:check` and a clean reset pass, the text test pins the
      clauses, and a live test shows a regular member reading only published
      snapshots, segments and notes, an editor reading drafts too, and the
      service role unchanged.
- [x] **2. Viewer notes redaction in the route** - `fetchNotes` redaction and
      a route test with a viewer and an editor. Done when the viewer response
      carries no `draft` note and `draft_deleted` reads as `published`.
- [x] **3. Editor-only draft topic on the web client** - channel helpers with
      tests, the second channel for editors, `draft_changed` moved onto it,
      the viewer handler removed. Done when the helper tests pass, the web
      suite is green, and in the browser an editor's draft edit reaches a
      second editor tab and never a viewer tab, while a publish still
      refreshes the viewer.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile`, the live integration test, a clean
  `supabase db reset`.
- Browser, local dev: `qa-super-admin@dubgrid.test` edits a draft cell in
  one tab; `qa-regular@dubgrid.test` in another tab sees no change and the
  Realtime websocket frames for the viewer carry no `draft_changed`; publish
  from the editor; the viewer refreshes to the published cell.
- Data API as `qa-regular`: `GET /rest/v1/schedule_cell_snapshots?snapshot_kind=eq.draft`
  returns no rows; as `qa-super-admin` it does.
- `/audit` afterwards: the repair is recorded against the archived id in the
  history file and any finding the re-review raises moves through the
  ledger as usual.

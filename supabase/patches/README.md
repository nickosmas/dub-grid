# Historical production patches

These files are retained as evidence of one-time in-place upgrades that predate
DubGrid's numbered forward-migration policy. They are not a second migration
stream, are not discovered by `supabase db push`, and must never be applied as a
batch.

| Patch                                         | Disposition                                                                                                                                                                                           | Qualification                                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `2026-08-org-isolation.sql`                   | Historical companion to the then-edited baseline functions and grants. Later forward hardening continues in migrations 005, 016, 017, and 018. Do not replay it automatically.                        | The read-only inspector verifies current live-state isolation, the archive trigger, and restricted auth-hook grants. |
| `2026-08-department-ids.sql`                  | One-time upgrade from scalar department ownership to arrays. Fresh databases receive the final shape through migration 001. Do not replay it automatically or drop its legacy columns during release. | The inspector verifies both array columns and all four replacement indexes.                                          |
| `2026-08-role-certification-requirements.sql` | One-time upgrade adding role requirements and compact-label configuration. Fresh databases receive the final shape through migration 001. Do not replay it automatically.                             | The inspector verifies both required columns.                                                                        |

If any qualification fails on production, stop the release. Inspect the real
schema and data shape, then add a new reviewed, retry-safe numbered forward
migration. Never fix the gap by editing 001-004 or blindly replaying these
historical patches.

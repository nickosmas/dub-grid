// Shared with web via `@dubgrid/domain` so the two platforms can't drift on
// what counts as "on the schedule" vs "management only". Re-exported here to
// keep the existing mobile import path.
export { isManagementOnly, isManagementUser, isOnSchedule } from "@dubgrid/domain";

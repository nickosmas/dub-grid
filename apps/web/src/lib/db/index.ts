/**
 * Data access layer — barrel re-export.
 *
 * All consumers import from "@/lib/db" (this file). The implementation is
 * split into domain modules for maintainability. Adding a new module?
 * Just add an `export * from "./module-name"` line below.
 */

export * from "./shared";
export * from "./types";
export * from "./mappers";
export * from "./organizations";
export * from "./config";
export * from "./employees";
export * from "./shifts";
export * from "./schedule";
export * from "./invitations";
export * from "./requests";
export * from "./notifications";
export * from "./sessions";
export * from "./admin";
export * from "./access";

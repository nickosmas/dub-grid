// Static UI constants — all schedule/org data is loaded from the database.

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Designation options for employee forms. Editable via Settings → Designations in the future. */
export const DESIGNATIONS = ["JLCSN", "CSN III", "CSN II", "STAFF", "—"] as const;

/** Role/qualification toggle options for employee forms. */
export const ROLES = [
  "DCSN", "DVCSN", "Supv", "Mentor", "CN", "SC. Mgr.", "Activity Coordinator", "SC/Asst/Act/Cor",
] as const;

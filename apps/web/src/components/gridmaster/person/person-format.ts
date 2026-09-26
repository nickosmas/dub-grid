import type { GridmasterPersonRecord } from "@/features/gridmaster/person-record";

export function formatDay(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatMoment(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** An actor id as the email it resolves to, or the id when it does not. */
export function formatActor(record: GridmasterPersonRecord, id: string | null): string | null {
  if (!id) return null;
  return record.actors[id] ?? id;
}

/** The name to show for a person: profile name, then staff name, then email. */
export function getPersonName(record: GridmasterPersonRecord): string {
  const profileName = [record.profile?.firstName, record.profile?.lastName]
    .filter(Boolean)
    .join(" ");
  if (profileName) return profileName;
  const staff = record.organizations.flatMap((organization) => organization.employees)[0];
  const staffName = staff ? `${staff.firstName} ${staff.lastName}`.trim() : "";
  return staffName || record.account?.email || "Unnamed person";
}

/** The organization an account-level action is recorded against. */
export function getPrimaryOrgId(record: GridmasterPersonRecord): string | null {
  const active = record.organizations.find(
    (organization) => organization.membership && !organization.membership.archivedAt,
  );
  return active?.org.id ?? null;
}

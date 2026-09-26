"use client";

import type { ReactNode } from "react";
import type { GridmasterPersonRecord } from "@/features/gridmaster/person-record";
import { PersonField, PersonFieldGrid, PersonSection, PersonSubheading } from "./PersonField";
import { formatActor, formatDay, formatMoment } from "./person-format";

function describeConsent(consent: Record<string, boolean>): string {
  const choices = Object.entries(consent)
    .filter(([category]) => category !== "essential")
    .map(([category, allowed]) => `${category} ${allowed ? "on" : "off"}`);
  return choices.length > 0 ? `Essential, ${choices.join(", ")}` : "Essential only";
}

/** The sign-in record, profile, account state and consent history. */
export function PersonAccountCard({
  record,
  actions,
}: {
  record: GridmasterPersonRecord;
  actions?: ReactNode;
}) {
  const { account, profile } = record;

  if (!account) {
    return (
      <PersonSection title="Account">
        <p className="text-[13px] text-[var(--dg-color-text-secondary)]">
          No account. This person has a staff record but has never signed in.
        </p>
      </PersonSection>
    );
  }

  return (
    <PersonSection
      title="Account"
      description="Sign-in, profile, account state and consent."
      actions={actions}
    >
      <PersonSubheading>Sign-in</PersonSubheading>
      <PersonFieldGrid>
        <PersonField label="Sign-in email" value={account.email} />
        <PersonField
          label="Last sign-in"
          value={account.lastSignInAt ? formatMoment(account.lastSignInAt) : null}
          empty="Never"
          tabular
        />
        <PersonField label="Account created" value={formatDay(account.createdAt)} tabular />
        <PersonField
          label="Email confirmed"
          value={account.emailConfirmedAt ? formatDay(account.emailConfirmedAt) : null}
          empty="Not confirmed"
          tabular
        />
      </PersonFieldGrid>

      {profile ? (
        <>
          <PersonSubheading>Profile</PersonSubheading>
          <PersonFieldGrid>
            <PersonField label="First name" value={profile.firstName} />
            <PersonField label="Last name" value={profile.lastName} />
            <PersonField label="Two-factor" value={profile.mfaEnabled ? "On" : "Off"} />
            <PersonField label="Profile updated" value={formatDay(profile.updatedAt)} tabular />
          </PersonFieldGrid>

          <PersonSubheading>Account state</PersonSubheading>
          <PersonFieldGrid>
            <PersonField
              label="Deactivated"
              value={
                profile.deactivatedAt
                  ? `${formatDay(profile.deactivatedAt)} by ${formatActor(record, profile.deactivatedBy) ?? "unknown"}`
                  : null
              }
              empty="No"
            />
            <PersonField
              label="Inactivity warning sent"
              value={profile.deactivationWarnedAt ? formatDay(profile.deactivationWarnedAt) : null}
              empty="No"
              tabular
            />
            <PersonField
              label="Deletion scheduled"
              value={profile.scheduledDeletionAt ? formatDay(profile.scheduledDeletionAt) : null}
              empty="No"
              tabular
            />
            <PersonField
              label="Terminated"
              value={
                profile.terminatedAt
                  ? `${formatDay(profile.terminatedAt)} by ${formatActor(record, profile.terminatedBy) ?? "unknown"}`
                  : null
              }
              empty="No"
            />
            {profile.terminatedReason ? (
              <PersonField label="Termination reason" value={profile.terminatedReason} wide />
            ) : null}
          </PersonFieldGrid>
        </>
      ) : null}

      <PersonSubheading>Terms and consent</PersonSubheading>
      {record.termsAcceptances.length === 0 && record.cookieConsents.length === 0 ? (
        <p className="text-[13px] text-[var(--dg-color-text-muted)]">
          No terms acceptance or cookie choice recorded.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 text-[13px]">
          {record.termsAcceptances.map((acceptance) => (
            <li key={`terms-${acceptance.version}-${acceptance.acceptedAt}`}>
              <span className="text-[var(--dg-color-text-primary)]">
                Accepted terms {acceptance.version}
              </span>{" "}
              <span className="dg-tabular-nums text-[var(--dg-color-text-muted)]">
                {formatMoment(acceptance.acceptedAt)}
              </span>
              {acceptance.userAgent ? (
                <span className="block truncate text-[var(--dg-color-text-muted)]">
                  {acceptance.userAgent}
                </span>
              ) : null}
            </li>
          ))}
          {record.cookieConsents.map((choice) => (
            <li key={`consent-${choice.createdAt}`}>
              <span className="text-[var(--dg-color-text-primary)]">
                Cookies: {describeConsent(choice.consent)}
                {choice.version ? ` (version ${choice.version})` : ""}
              </span>{" "}
              <span className="dg-tabular-nums text-[var(--dg-color-text-muted)]">
                {formatMoment(choice.createdAt)}
              </span>
              {choice.userAgent ? (
                <span className="block truncate text-[var(--dg-color-text-muted)]">
                  {choice.userAgent}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </PersonSection>
  );
}

"use client";

import type { ReactNode } from "react";
import { StatusPill } from "@/components/ui/status-pill";
import type {
  GridmasterKnownDevice,
  GridmasterPersonRecord,
} from "@/features/gridmaster/person-record";
import { PersonField, PersonFieldGrid, PersonSection, PersonSubheading } from "./PersonField";
import { formatDay, formatMoment } from "./person-format";

const FACTOR_TYPES: Record<string, string> = { totp: "Authenticator app", phone: "Phone" };

/** Two-factor, each factor, the devices they have signed in from, and any login lock. */
export function PersonSecurityCard({
  record,
  twoFactorActions,
  loginLockActions,
  renderDeviceActions,
}: {
  record: GridmasterPersonRecord;
  twoFactorActions?: ReactNode;
  loginLockActions?: ReactNode;
  renderDeviceActions?: (device: GridmasterKnownDevice) => ReactNode;
}) {
  const { security, loginLock } = record;
  if (!security) return null;
  const { twoFactor, knownDevices } = security;

  return (
    <PersonSection title="Security" description="Two-factor, known devices and sign-in lock.">
      <PersonSubheading>Two-factor</PersonSubheading>
      <PersonFieldGrid>
        <PersonField label="Two-factor" value={twoFactor.enabled ? "On" : "Off"} />
        <PersonField
          label="Must enroll again"
          value={
            twoFactor.reenrollRequiredAt
              ? `Since reset on ${formatMoment(twoFactor.reenrollRequiredAt)}`
              : null
          }
          empty="No"
        />
      </PersonFieldGrid>
      {twoFactor.factors.length === 0 ? (
        <p className="text-[13px] text-[var(--dg-color-text-muted)]">No factors enrolled.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--dg-color-border-light)]">
          {twoFactor.factors.map((factor) => (
            <li key={factor.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-[var(--dg-color-text-primary)]">
                  {factor.name || FACTOR_TYPES[factor.type] || factor.type}
                </span>
                <StatusPill tone={factor.status === "verified" ? "success" : "neutral"}>
                  {factor.status === "verified" ? "Verified" : "Not verified"}
                </StatusPill>
              </div>
              <span className="dg-tabular-nums text-[12px] text-[var(--dg-color-text-muted)]">
                {FACTOR_TYPES[factor.type] ?? factor.type} · enrolled {formatDay(factor.createdAt)}{" "}
                ·{" "}
                {factor.lastUsedAt ? `last used ${formatMoment(factor.lastUsedAt)}` : "never used"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {twoFactorActions ? <div className="flex flex-wrap gap-2">{twoFactorActions}</div> : null}

      <PersonSubheading>Known devices</PersonSubheading>
      {knownDevices.length === 0 ? (
        <p className="text-[13px] text-[var(--dg-color-text-muted)]">
          No devices remembered. Their next sign-in anywhere sends a new-device alert.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--dg-color-border-light)]">
          {knownDevices.map((device) => (
            <li
              key={device.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="dg-tabular-nums text-[13px] text-[var(--dg-color-text-primary)]">
                {device.platform ?? "Unknown device"} · first seen {formatDay(device.firstSeenAt)} ·
                last seen {formatMoment(device.lastSeenAt)}
              </span>
              {renderDeviceActions ? (
                <div className="flex gap-2">{renderDeviceActions(device)}</div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <PersonSubheading>Sign-in lock</PersonSubheading>
      <p className="text-[13px] text-[var(--dg-color-text-secondary)]">
        {loginLock === null
          ? "Not tracked here: the sign-in limiter only runs in production."
          : loginLock.locked
            ? loginLock.resetsAt
              ? `Locked after too many attempts. Clears no earlier than ${formatMoment(loginLock.resetsAt)}.`
              : "Locked after too many attempts."
            : "Not locked."}
      </p>
      {loginLock?.locked && loginLockActions ? (
        <div className="flex flex-wrap gap-2">{loginLockActions}</div>
      ) : null}
    </PersonSection>
  );
}

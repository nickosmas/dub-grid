"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BILLING_POLICY_KEYS,
  BILLING_POLICY_LIMITS,
  type BillingPolicy,
  type BillingPolicyKey,
  type BillingPolicyOverrides,
} from "@dubgrid/domain";
import { Button } from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import { NumberField } from "@/components/ui/number-field";
import { Switch } from "@/components/ui/switch";
import {
  BILLING_POLICY_LABELS,
  formatPolicyDays,
} from "@/components/gridmaster/gridmaster-billing-rules";
import {
  fetchGridmasterBillingPolicy,
  updateGridmasterBillingPolicy,
  type GridmasterBillingPolicyInput,
} from "@/features/gridmaster/client";
import { useStepUpAction } from "@/hooks/useStepUpAction";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import { sectionBodyStyle, sectionHeaderStyle, sectionStyle } from "@/lib/styles";
import type { GridmasterBillingOrgSummary } from "@/types";

function PolicyRows({
  values,
  note,
}: {
  values: BillingPolicy;
  note?: (key: BillingPolicyKey) => string | null;
}) {
  return (
    <dl style={{ display: "grid", gap: 10, margin: 0, fontSize: "var(--dg-fs-label)" }}>
      {BILLING_POLICY_KEYS.map((key) => (
        <div
          key={key}
          style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
        >
          <dt style={{ color: "var(--dg-color-text-secondary)", fontWeight: 600 }}>
            {BILLING_POLICY_LABELS[key].label}
          </dt>
          <dd className="dg-tabular-nums" style={{ margin: 0, textAlign: "right" }}>
            {formatPolicyDays(values[key])}
            {note?.(key) && (
              <span style={{ display: "block", color: "var(--dg-color-text-muted)" }}>
                {note(key)}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function usePolicySave(onSaved: () => void) {
  const queryClient = useQueryClient();
  const stepUp = useStepUpAction();
  const [saving, setSaving] = useState(false);

  async function save(input: GridmasterBillingPolicyInput) {
    setSaving(true);
    try {
      const completed = await stepUp.run((accessToken) =>
        updateGridmasterBillingPolicy(input, accessToken),
      );
      if (!completed) return;
      toast.success("Billing policy saved");
      onSaved();
    } catch (error) {
      toast.error(formatClientErrorMessage(error, "We couldn't save the billing policy."));
    } finally {
      setSaving(false);
      // A 409 means someone else changed it; refetch either way. The audit list
      // shows the change too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.billing() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.auditAll() });
    }
  }

  return { save, saving, dialog: stepUp.dialog };
}

/** The platform defaults every organization inherits. */
export function PlatformBillingPolicyCard() {
  const policyQuery = useQuery({
    queryKey: queryKeys.gridmaster.billingPolicy(),
    queryFn: fetchGridmasterBillingPolicy,
    staleTime: 30_000,
  });
  const [draft, setDraft] = useState<Record<BillingPolicyKey, number | null> | null>(null);
  const { save, saving, dialog } = usePolicySave(() => setDraft(null));
  const platform = policyQuery.data?.platform;
  const valid =
    draft !== null &&
    BILLING_POLICY_KEYS.every((key) => {
      const value = draft[key];
      const { min, max } = BILLING_POLICY_LIMITS[key];
      return value !== null && value >= min && value <= max;
    });

  return (
    <div style={sectionStyle}>
      <div
        style={{
          ...sectionHeaderStyle,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span>Billing policy</span>
        <Button
          type="button"
          className="dg-btn dg-btn-secondary dg-btn-sm"
          disabled={!platform}
          onClick={() =>
            platform &&
            setDraft(
              Object.fromEntries(BILLING_POLICY_KEYS.map((key) => [key, platform[key]])) as Record<
                BillingPolicyKey,
                number | null
              >,
            )
          }
        >
          Edit
        </Button>
      </div>
      <div style={sectionBodyStyle}>
        {platform ? (
          <PolicyRows values={platform} />
        ) : (
          <span style={{ color: "var(--dg-color-text-muted)" }}>
            {policyQuery.isError ? "We couldn't load the billing policy." : "Loading…"}
          </span>
        )}
        <p
          style={{
            margin: "12px 0 0",
            fontSize: "var(--dg-fs-caption)",
            color: "var(--dg-color-text-muted)",
          }}
        >
          Platform defaults. An organization's override on its Billing tab takes their place.
        </p>
      </div>
      {draft && platform && (
        <ConfirmDialog
          title="Edit the platform billing defaults?"
          message={
            <div style={{ display: "grid", gap: 14 }}>
              <span>An organization&apos;s own override takes their place.</span>
              {BILLING_POLICY_KEYS.map((key) => (
                <label key={key} style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontWeight: 600 }}>{BILLING_POLICY_LABELS[key].label}</span>
                  <span style={{ color: "var(--dg-color-text-muted)" }}>
                    {BILLING_POLICY_LABELS[key].help} {BILLING_POLICY_LIMITS[key].min} to{" "}
                    {BILLING_POLICY_LIMITS[key].max} days.
                  </span>
                  <NumberField
                    nullable
                    min={BILLING_POLICY_LIMITS[key].min}
                    max={BILLING_POLICY_LIMITS[key].max}
                    value={draft[key]}
                    onChange={(value) => setDraft({ ...draft, [key]: value })}
                    aria-label={BILLING_POLICY_LABELS[key].label}
                  />
                </label>
              ))}
            </div>
          }
          confirmLabel="Save policy"
          variant="warning"
          isLoading={saving}
          confirmDisabled={!valid}
          onConfirm={() =>
            void save({
              scope: "platform",
              values: draft as BillingPolicy,
              expectedUpdatedAt: platform.updatedAt,
            })
          }
          onCancel={() => setDraft(null)}
        />
      )}
      {dialog}
    </div>
  );
}

type OverrideDraft = Record<BillingPolicyKey, { overridden: boolean; value: number | null }>;

/** One organization's effective policy, and the overrides that change it. */
export function OrganizationBillingPolicyCard({ org }: { org: GridmasterBillingOrgSummary }) {
  const [draft, setDraft] = useState<OverrideDraft | null>(null);
  const { save, saving, dialog } = usePolicySave(() => setDraft(null));
  const { values, sources } = org.policy;

  function openEditor() {
    setDraft(
      Object.fromEntries(
        BILLING_POLICY_KEYS.map((key) => [
          key,
          { overridden: sources[key] === "organization", value: values[key] },
        ]),
      ) as OverrideDraft,
    );
  }

  const valid =
    draft !== null &&
    BILLING_POLICY_KEYS.every((key) => {
      const entry = draft[key];
      if (!entry.overridden) return true;
      const { min, max } = BILLING_POLICY_LIMITS[key];
      return entry.value !== null && entry.value >= min && entry.value <= max;
    });

  function submit() {
    if (!draft) return;
    const overrides: BillingPolicyOverrides = {};
    for (const key of BILLING_POLICY_KEYS) {
      const next = draft[key].overridden ? draft[key].value : null;
      const current = sources[key] === "organization" ? values[key] : null;
      if (next !== current) overrides[key] = next;
    }
    if (Object.keys(overrides).length === 0) {
      setDraft(null);
      return;
    }
    void save({ scope: "organization", orgId: org.orgId, overrides });
  }

  return (
    <div style={sectionStyle}>
      <div
        style={{
          ...sectionHeaderStyle,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span>Billing policy</span>
        <Button type="button" className="dg-btn dg-btn-secondary dg-btn-sm" onClick={openEditor}>
          Edit overrides
        </Button>
      </div>
      <div style={sectionBodyStyle}>
        <PolicyRows
          values={values}
          note={(key) =>
            sources[key] === "organization" ? "Organization override" : "Platform default"
          }
        />
      </div>
      {draft && (
        <ConfirmDialog
          title={`Override ${org.orgName}'s billing policy?`}
          message={
            <div style={{ display: "grid", gap: 14 }}>
              <span>Turn an override off to use the platform default again.</span>
              {BILLING_POLICY_KEYS.map((key) => {
                const entry = draft[key];
                return (
                  <div key={key} style={{ display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Switch
                        checked={entry.overridden}
                        ariaLabel={`Override ${BILLING_POLICY_LABELS[key].label}`}
                        onChange={(overridden) =>
                          setDraft({ ...draft, [key]: { ...entry, overridden } })
                        }
                      />
                      <span style={{ fontWeight: 600 }}>{BILLING_POLICY_LABELS[key].label}</span>
                    </div>
                    {entry.overridden ? (
                      <NumberField
                        nullable
                        min={BILLING_POLICY_LIMITS[key].min}
                        max={BILLING_POLICY_LIMITS[key].max}
                        value={entry.value}
                        onChange={(value) => setDraft({ ...draft, [key]: { ...entry, value } })}
                        aria-label={`${BILLING_POLICY_LABELS[key].label} for ${org.orgName}`}
                      />
                    ) : (
                      <span style={{ color: "var(--dg-color-text-muted)" }}>
                        Uses the platform default.
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          }
          confirmLabel="Save overrides"
          variant="warning"
          isLoading={saving}
          confirmDisabled={!valid}
          onConfirm={submit}
          onCancel={() => setDraft(null)}
        />
      )}
      {dialog}
    </div>
  );
}

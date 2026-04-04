"use client";

import React from "react";
import { Organization } from "@/types";
import { toast } from "sonner";

export default function ScheduleRules({
  organization,
  onOrganizationSave,
}: {
  organization: Organization;
  onOrganizationSave: (o: Organization) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <div>
        <div style={{ fontSize: "var(--dg-fs-body)", fontWeight: 600, color: "var(--color-text-primary)" }}>Enforce shift conflict prevention</div>
        <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", marginTop: 2 }}>When enabled, overlapping shifts cannot be saved. Admins can override.</div>
      </div>
      <button
        onClick={async () => {
          const next = !organization.enforceConflictPrevention;
          try {
            await onOrganizationSave({ ...organization, enforceConflictPrevention: next });
            toast.success(next ? "Conflict enforcement enabled" : "Conflict enforcement disabled");
          } catch { toast.error("Failed to update setting"); }
        }}
        style={{
          width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", flexShrink: 0,
          background: organization.enforceConflictPrevention ? "var(--color-primary)" : "var(--color-border)",
          position: "relative", transition: "background 0.2s",
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: "50%", background: "#fff",
          position: "absolute", top: 3,
          left: organization.enforceConflictPrevention ? 23 : 3,
          transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)",
        }} />
      </button>
    </div>
  );
}

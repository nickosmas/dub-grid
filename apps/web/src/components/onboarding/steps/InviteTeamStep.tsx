"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, ArrowRight } from "lucide-react";
import StepLayout from "../StepLayout";
import { useEmployees, usePermissions } from "@/hooks";

interface InviteTeamStepProps {
  onNext: () => void;
  onBack: () => void;
}

/**
 * Invite Your Team — the missing CTA the audit flagged. Surfaces the People
 * page as the canonical place to add staff (which is where the full invite +
 * employee-creation modal already lives) so the wizard doesn't fork the
 * invitation domain model. Auto-advances once at least one employee exists.
 */
export default function InviteTeamStep({ onNext, onBack }: InviteTeamStepProps) {
  const perms = usePermissions();
  const { employees, loading } = useEmployees(perms.orgId ?? null);
  const [autoAdvanced, setAutoAdvanced] = useState(false);

  const hasEmployees = employees.length > 0;

  // If the user adds employees on /people while keeping this tab open and
  // returns here, advance automatically — no manual click needed.
  useEffect(() => {
    if (hasEmployees && !autoAdvanced) {
      setAutoAdvanced(true);
      onNext();
    }
  }, [hasEmployees, autoAdvanced, onNext]);

  return (
    <StepLayout
      title="Invite your team"
      description="Workspaces are more useful with people in them. Open the People page to add or import staff. You can come back here whenever you're done."
      onNext={onNext}
      onBack={onBack}
      nextLabel={hasEmployees ? "Finish setup" : "Skip for now"}
      backLabel="Back"
    >
      <div
        style={{
          background: "var(--color-bg-card, white)",
          borderRadius: "var(--dg-radius-xl)",
          border: "1px solid var(--color-border)",
          padding: "32px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "var(--color-brand-bg, rgba(59,130,246,0.08))",
            color: "var(--color-brand)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Users size={28} />
        </div>

        <div style={{ maxWidth: 420 }}>
          <h3
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              margin: "0 0 6px",
              letterSpacing: "-0.01em",
            }}
          >
            {hasEmployees
              ? `${employees.length} ${employees.length === 1 ? "employee" : "employees"} added`
              : "No employees yet"}
          </h3>
          <p
            style={{
              fontSize: 14,
              color: "var(--color-text-muted)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {hasEmployees
              ? "Nice. You're ready to start building your schedule."
              : "Add staff one at a time or import a CSV from the People page. Their invitation emails will go out automatically."}
          </p>
        </div>

        <Link
          href="/people"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 24px",
            borderRadius: 10,
            border: hasEmployees
              ? "1px solid var(--color-border)"
              : "none",
            background: hasEmployees
              ? "var(--color-bg-card, white)"
              : "var(--color-brand)",
            color: hasEmployees
              ? "var(--color-text-primary)"
              : "var(--color-text-inverse)",
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
            boxShadow: hasEmployees
              ? "none"
              : "0 2px 8px rgba(37, 99, 235, 0.2)",
          }}
        >
          {hasEmployees ? "Manage on People page" : "Open People page"}
          <ArrowRight size={16} />
        </Link>

        {!loading && !hasEmployees && (
          <p
            style={{
              fontSize: 12,
              color: "var(--color-text-faint)",
              margin: 0,
              maxWidth: 380,
            }}
          >
            This page auto-advances once your first employee is added.
          </p>
        )}
      </div>
    </StepLayout>
  );
}

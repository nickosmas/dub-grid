"use client";

import { useState } from "react";
import StepLayout from "../StepLayout";
import InviteEmployeeModal from "@/components/InviteEmployeeModal";
import { Button } from "@/components/Button";
import { useOrganizationData } from "@/hooks";

interface InviteTeamStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function InviteTeamStep({ onNext, onBack }: InviteTeamStepProps) {
  const { org, departments } = useOrganizationData();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCount, setInviteCount] = useState(0);

  if (!org) return null;

  return (
    <>
      <StepLayout
        title="Invite your team"
        description="Bring your team into DubGrid now, or skip and invite them later from People."
        onNext={onNext}
        onBack={onBack}
        nextLabel={inviteCount > 0 ? "Continue" : "Skip for now"}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <Button
            type="button"
            className="dg-btn dg-btn-primary"
            onClick={() => setShowInvite(true)}
          >
            Invite a teammate
          </Button>

          {inviteCount > 0 && (
            <p style={{ margin: 0, fontSize: 14, color: "var(--dg-color-text-muted)" }}>
              {inviteCount} teammate{inviteCount > 1 ? "s" : ""} invited.
            </p>
          )}
        </div>
      </StepLayout>

      {showInvite && (
        <InviteEmployeeModal
          employee={null}
          orgId={org.id}
          orgName={org.name || "your organization"}
          departments={departments}
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setInviteCount((count) => count + 1);
            setShowInvite(false);
          }}
        />
      )}
    </>
  );
}

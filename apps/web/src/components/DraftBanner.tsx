"use client";

import type { DraftBreakdown } from "@/lib/draft-utils";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import ChangeCountChips from "@/components/ChangeCountChips";
import { Hint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";

interface DraftBannerProps {
  onPublish: () => void;
  onCancel: () => void;
  isPublishing?: boolean;
  isCanceling?: boolean;
  breakdown?: DraftBreakdown;
  canPublish?: boolean;
  /**
   * Optional dismiss handler. When provided, an "×" button hides the banner
   * until the underlying draft data changes again. Hiding is a UI affordance
   * only — drafts are not discarded.
   */
  onDismiss?: () => void;
}

export default function DraftBanner({
  onPublish,
  onCancel,
  isPublishing,
  isCanceling,
  breakdown,
  canPublish = true,
  onDismiss,
}: DraftBannerProps) {
  const isDisabled = isPublishing || isCanceling;
  const publishHint = canPublish
    ? "Save all draft changes to the live schedule"
    : "You don't have permission to publish schedules.";

  return (
    <div className="dg-draft-banner no-print" data-tour="draft-banner">
      {/* A title, where a bare amber dot used to sit: the banner is already
          amber and bordered, so the dot said nothing the banner hadn't. */}
      <span style={{ fontWeight: 700 }}>Draft changes</span>
      {/* Every draft change is highlighted on the grid, with no toggle to
          switch that off, so these counts are also the key for what is
          already showing. */}
      {breakdown && (
        <ChangeCountChips
          counts={{
            newShifts: breakdown.newShifts,
            modifiedShifts: breakdown.modifiedShifts,
            deletedShifts: breakdown.deletedShifts,
            notes: breakdown.newNotes + breakdown.deletedNotes,
          }}
        />
      )}
      <div className="dg-draft-banner-actions">
        <Hint content={hint("Delete all unpublished draft changes")} side="bottom">
          <Button
            data-tour="draft-banner-discard"
            onClick={onCancel}
            disabled={isDisabled}
            className="dg-btn dg-btn-secondary dg-btn-sm"
            style={{ color: "var(--dg-color-danger-dark)" }}
          >
            <ButtonLoading loading={Boolean(isCanceling)} spinnerSize={12}>
              Discard
            </ButtonLoading>
          </Button>
        </Hint>
        <Hint content={hint(publishHint)} side="bottom">
          <Button
            data-tour="draft-banner-publish"
            onClick={onPublish}
            disabled={isDisabled || !canPublish}
            className="dg-btn dg-btn-primary dg-btn-sm"
          >
            <ButtonLoading loading={Boolean(isPublishing)} spinnerSize={12}>
              Publish
            </ButtonLoading>
          </Button>
        </Hint>
        {onDismiss && (
          <Hint content={hint("Hide this banner for the rest of this session")} side="bottom">
            <Button type="button" onClick={onDismiss} className="dg-btn dg-btn-secondary dg-btn-sm">
              Close
            </Button>
          </Hint>
        )}
      </div>
    </div>
  );
}

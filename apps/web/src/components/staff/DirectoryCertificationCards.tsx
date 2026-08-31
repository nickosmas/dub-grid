"use client";

import type { StaffCertificationCount } from "@dubgrid/domain";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/Button";
import { MaybeHint } from "@/components/ui/hint";
import type { NamedItem } from "@/types";
import type { CertificationFilter } from "./useStaffFilters";

/**
 * A compact tile. The certified-staff total and each certification share this
 * shape so the row reads as one total followed by its breakdown.
 */
function CountTile({
  label,
  count,
  selected,
}: {
  label: string;
  count: number;
  selected?: boolean;
}) {
  return (
    <Card
      size="sm"
      className={
        selected
          ? "border-[var(--dg-color-brand-border)] bg-[var(--dg-color-brand-bg)]"
          : "border-[var(--dg-color-border-light)]"
      }
    >
      <CardContent>
        <p className="text-[11px] font-semibold uppercase tracking-wide truncate text-[var(--dg-color-text-subtle)]">
          {label}
        </p>
        <p className="text-2xl font-bold tracking-tight mt-0.5 tabular-nums">{count}</p>
      </CardContent>
    </Card>
  );
}

/**
 * The certified-staff total followed by a tile per certification, so a
 * scheduler sees both the headline number and the mix behind it in one row.
 *
 * Abbreviations lead because full credential names run long ("Journal Listed
 * Christian Science Nurse"); the full name is the tooltip. `auto-fit` sizing
 * keeps the row tidy whether an org has three certifications or a dozen.
 */
export function DirectoryCertificationCards({
  counts,
  certifications,
  certificationLabel,
  useCompactRoleCertificationLabels = false,
  certifiedCount,
  uncertifiedCount,
  selectedCertification,
  onSelectCertification,
}: {
  counts: StaffCertificationCount[];
  certifications: NamedItem[];
  certificationLabel: string;
  useCompactRoleCertificationLabels?: boolean;
  certifiedCount: number;
  uncertifiedCount: number;
  selectedCertification: CertificationFilter;
  onSelectCertification: (value: CertificationFilter) => void;
}) {
  if (counts.length === 0) {
    return null;
  }

  const certificationById = new Map(certifications.map((c) => [c.id, c]));
  const certifiedSelected = selectedCertification === "any";
  const uncertifiedSelected = selectedCertification === "none";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3">
      {/* "Certified staff" describes the person, not the credential, so this
          copy holds however an org renames its certification label — someone
          holding a "License" or a "Skill Level" is still certified. */}
      <Button
        type="button"
        aria-label={`Certified staff count, ${certifiedCount}`}
        aria-pressed={certifiedSelected}
        onClick={() => onSelectCertification(certifiedSelected ? null : "any")}
        className="text-left"
      >
        <CountTile label="Certified staff" count={certifiedCount} selected={certifiedSelected} />
      </Button>

      {counts.map(({ certificationId, count }) => {
        const certification =
          typeof certificationId === "number" ? certificationById.get(certificationId) : undefined;
        // A dangling reference to a certification that has since been archived.
        // Shown so the tiles still sum to the certified total beside them.
        const isArchived = certificationId === "archived";
        const label = isArchived
          ? "Archived"
          : ((useCompactRoleCertificationLabels
              ? certification?.abbr || certification?.name
              : certification?.name) ?? "—");
        const fullName = isArchived
          ? `Holders of an archived ${certificationLabel.toLowerCase()} entry`
          : (certification?.name ?? null);
        const isSelected = selectedCertification === certificationId;

        return (
          <MaybeHint key={String(certificationId)} content={fullName}>
            <Button
              type="button"
              aria-label={`${label}, ${count} staff`}
              aria-pressed={isSelected}
              disabled={isArchived}
              onClick={() => {
                if (!isArchived) {
                  onSelectCertification(isSelected ? null : (certificationId as number));
                }
              }}
              className="text-left disabled:cursor-default"
            >
              <CountTile label={label} count={count} selected={isSelected} />
            </Button>
          </MaybeHint>
        );
      })}

      {/* Last, and named for what it means rather than what the people do:
          these are the staff who hold no certification at all. */}
      <MaybeHint content={`Staff holding no ${certificationLabel.toLowerCase()}`}>
        <Button
          type="button"
          aria-label={`Not certified count, ${uncertifiedCount}`}
          aria-pressed={uncertifiedSelected}
          onClick={() => onSelectCertification(uncertifiedSelected ? null : "none")}
          className="text-left"
        >
          <CountTile
            label="Not certified"
            count={uncertifiedCount}
            selected={uncertifiedSelected}
          />
        </Button>
      </MaybeHint>
    </div>
  );
}

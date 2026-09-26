"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/Button";
import { StatusPill } from "@/components/ui/status-pill";
import { searchGridmasterStaff } from "@/features/gridmaster/client";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import { PersonSection } from "./PersonField";

const MIN_LENGTH = 2;

const STATUS_LABELS: Record<string, string> = { inactive: "Inactive", removed: "Removed" };

/** Finds staff who never got an account, in any organization. */
export function StaffWithoutAccountSearch({ onOpen }: { onOpen: (employeeId: string) => void }) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  const results = useQuery({
    queryKey: queryKeys.gridmaster.staffSearch(query),
    queryFn: () => searchGridmasterStaff(query).then((result) => result.staff),
    enabled: query.length >= MIN_LENGTH,
    staleTime: 30_000,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setQuery(draft.trim());
  }

  return (
    <PersonSection
      title="Staff without an account"
      description="Staff records that were never linked to a sign-in, in every organization."
    >
      <form className="flex flex-wrap gap-2" onSubmit={submit} role="search">
        <input
          className="dg-input min-w-[220px] flex-1"
          aria-label="Search staff without an account"
          placeholder="Name, email or phone"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          type="submit"
          className="dg-btn dg-btn-secondary"
          disabled={draft.trim().length < MIN_LENGTH}
        >
          Search
        </Button>
      </form>

      {results.isError ? (
        <p className="text-[13px] text-[var(--dg-color-danger-text)]">
          {formatClientErrorMessage(results.error, "We couldn't search staff. Try again.")}
        </p>
      ) : results.isFetching ? (
        <p className="text-[13px] text-[var(--dg-color-text-muted)]">Searching</p>
      ) : results.data ? (
        results.data.length === 0 ? (
          <p className="text-[13px] text-[var(--dg-color-text-muted)]">
            No staff without an account match &quot;{query}&quot;.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--dg-color-border-light)]">
            {results.data.map((staff) => (
              <li key={staff.employeeId}>
                <Button
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-left"
                  spinner={false}
                  onClick={() => onOpen(staff.employeeId)}
                >
                  <span className="text-[13px] font-semibold text-[var(--dg-color-text-primary)]">
                    {staff.name || "Unnamed"}
                  </span>
                  <span className="text-[12px] text-[var(--dg-color-text-muted)]">
                    {staff.orgName}
                  </span>
                  {staff.email ? (
                    <span className="text-[12px] text-[var(--dg-color-text-muted)]">
                      {staff.email}
                    </span>
                  ) : null}
                  {staff.status !== "active" || staff.archivedAt ? (
                    <StatusPill tone="neutral">
                      {staff.archivedAt
                        ? "Archived"
                        : (STATUS_LABELS[staff.status] ?? staff.status)}
                    </StatusPill>
                  ) : null}
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </PersonSection>
  );
}

export type BulkDeleteReviewTarget = {
  key: string;
  empId: string;
  date: Date;
  empName: string;
  shiftLabel: string;
  isPublishedBacked: boolean;
};

export function getBulkDeleteReviewCounts(targets: BulkDeleteReviewTarget[]) {
  const publishedBacked = targets.filter((target) => target.isPublishedBacked).length;
  return {
    publishedBacked,
    draftOnly: targets.length - publishedBacked,
  };
}

function ReviewCountChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        padding: "3px 8px",
        borderRadius: 999,
        border: "1px solid var(--dg-color-border)",
        background: "var(--dg-color-surface)",
        color: "var(--dg-color-text-secondary)",
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

function formatEntryCount(count: number, label: string) {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function formatAffectedEntryCount(count: number) {
  return `${count} ${count === 1 ? "entry" : "entries"} affected`;
}

export function getBulkDeleteReviewPeople(targets: BulkDeleteReviewTarget[]) {
  const peopleById = new Map<
    string,
    {
      key: string;
      empName: string;
      targets: BulkDeleteReviewTarget[];
    }
  >();

  for (const target of targets) {
    const existing = peopleById.get(target.empId);
    if (existing) {
      existing.targets.push(target);
    } else {
      peopleById.set(target.empId, {
        key: target.empId,
        empName: target.empName,
        targets: [target],
      });
    }
  }

  return Array.from(peopleById.values())
    .map((person) => ({
      ...person,
      targets: [...person.targets].sort(
        (left, right) => left.date.getTime() - right.date.getTime(),
      ),
    }))
    .sort((left, right) => left.empName.localeCompare(right.empName));
}

export default function BulkDeleteReviewContent({
  targets,
}: {
  targets: BulkDeleteReviewTarget[];
}) {
  const counts = getBulkDeleteReviewCounts(targets);
  const people = getBulkDeleteReviewPeople(targets);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <p style={{ margin: 0 }}>
        {`Remove ${targets.length} selected entr${targets.length === 1 ? "y" : "ies"}? Entries already on the published schedule will be removed from the live schedule when you publish these changes.`}
      </p>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          fontSize: "var(--dg-fs-caption)",
        }}
      >
        <ReviewCountChip>
          {formatEntryCount(counts.publishedBacked, "already published")}
        </ReviewCountChip>
        <ReviewCountChip>
          {formatEntryCount(counts.draftOnly, "unpublished change")}
        </ReviewCountChip>
      </div>
      <div
        role="list"
        aria-label="People with entries selected for removal"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          maxHeight: 280,
          overflowY: "auto",
          border: "1px solid var(--dg-color-border)",
          borderRadius: "var(--dg-radius-md)",
          padding: 8,
          background: "var(--dg-color-bg)",
        }}
      >
        {people.map((person) => (
          <div
            key={person.key}
            role="listitem"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 8,
              alignItems: "center",
              fontSize: "var(--dg-fs-caption)",
            }}
          >
            <strong>{person.empName}</strong>
            <span
              style={{
                color: "var(--dg-color-danger-text)",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {formatAffectedEntryCount(person.targets.length)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

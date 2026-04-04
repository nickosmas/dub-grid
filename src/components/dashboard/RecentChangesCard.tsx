import type { PublishHistoryEntry } from "@/types";

interface RecentChangesCardProps {
  publishHistory: PublishHistoryEntry | null;
  currentEmpId: string | null;
  isAdmin: boolean;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function RecentChangesCard({
  publishHistory,
  currentEmpId,
  isAdmin,
}: RecentChangesCardProps) {
  if (!publishHistory) {
    return (
      <div className="dg-card">
        <div className="dg-card-header">
          <div>
            <div className="dg-card-title">Recent changes</div>
            <div className="dg-card-subtitle">Schedule updates</div>
          </div>
        </div>
        <div className="dg-card-body" style={{ textAlign: "center", padding: "24px 18px" }}>
          <div style={{ fontSize: 12, color: "var(--color-text-subtle)" }}>
            No recent schedule publications
          </div>
        </div>
      </div>
    );
  }

  const changes = publishHistory.changes ?? [];

  // For users, filter to only changes affecting their employee
  const relevantChanges = !isAdmin && currentEmpId != null
    ? changes.filter((c) => String(c.empId) === String(currentEmpId))
    : changes;

  const newCount = relevantChanges.filter((c) => c.kind === "new").length;
  const modifiedCount = relevantChanges.filter((c) => c.kind === "modified").length;
  const deletedCount = relevantChanges.filter((c) => c.kind === "deleted").length;

  return (
    <div className="dg-card">
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title">Recent changes</div>
          <div className="dg-card-subtitle">
            {isAdmin ? "Last published" : "Affecting your schedule"}
            {" \u00B7 "}
            {formatRelativeTime(publishHistory.publishedAt)}
          </div>
        </div>
      </div>
      <div className="dg-card-body">
        {relevantChanges.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--color-text-subtle)", textAlign: "center", padding: "8px 0" }}>
            {isAdmin ? "No changes in last publish" : "No changes to your shifts"}
          </div>
        ) : (
          <>
            {/* Summary */}
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)" }}>
                {relevantChanges.length}
              </span>
              <div style={{ fontSize: 11, color: "var(--color-text-subtle)", lineHeight: 1.5 }}>
                change{relevantChanges.length !== 1 ? "s" : ""}
                <br />
                {publishHistory.startDate} &ndash; {publishHistory.endDate}
              </div>
            </div>

            {/* Breakdown chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {newCount > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5,
                  background: "var(--color-success-bg)", color: "var(--color-success-text)",
                  border: "1px solid var(--color-success-border)",
                }}>
                  {newCount} new
                </span>
              )}
              {modifiedCount > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5,
                  background: "var(--color-info-bg)", color: "var(--color-info)",
                  border: "1px solid var(--color-info-border)",
                }}>
                  {modifiedCount} modified
                </span>
              )}
              {deletedCount > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5,
                  background: "var(--color-danger-bg)", color: "var(--color-danger)",
                  border: "1px solid var(--color-danger-border)",
                }}>
                  {deletedCount} removed
                </span>
              )}
            </div>

            {/* Published by */}
            {isAdmin && publishHistory.publishedBy && (
              <div style={{ fontSize: 10, color: "var(--color-text-faint)", marginTop: 8 }}>
                Published by {publishHistory.publishedBy}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

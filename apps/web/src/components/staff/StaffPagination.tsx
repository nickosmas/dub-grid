"use client";

interface StaffPaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function StaffPagination({ page, totalPages, totalCount, pageSize, onPageChange }: StaffPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        fontSize: "var(--dg-fs-label)",
        color: "var(--color-text-muted)",
      }}
    >
      <span style={{ fontSize: "var(--dg-fs-caption)" }}>
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="dg-btn dg-btn-secondary"
          style={{ padding: "5px 12px", fontSize: "var(--dg-fs-caption)" }}
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="dg-btn dg-btn-secondary"
          style={{ padding: "5px 12px", fontSize: "var(--dg-fs-caption)" }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

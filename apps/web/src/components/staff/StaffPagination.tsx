"use client";

import { Pagination } from "@/components/ui/pagination";

interface StaffPaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function StaffPagination({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
}: StaffPaginationProps) {
  return (
    <Pagination
      page={page}
      totalPages={totalPages}
      onPageChange={onPageChange}
      summary={`Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} of ${totalCount}`}
    />
  );
}

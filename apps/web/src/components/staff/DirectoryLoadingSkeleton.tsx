import { Skeleton } from "@/components/ui/skeleton";

export function DirectoryLoadingSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Skeleton className="h-7 w-32 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[88px] rounded-[var(--dg-radius-md)]" />
        ))}
      </div>

      {/* Search */}
      <Skeleton className="h-10 w-full rounded-[var(--dg-radius-sm)]" />

      {/* Tabs */}
      <Skeleton className="h-8 w-80" />

      {/* Table */}
      <div className="rounded-[var(--dg-radius-md)] border border-border overflow-hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-6 py-3.5 border-b border-border last:border-b-0"
          >
            <Skeleton className="h-4 w-4 rounded shrink-0" />
            <Skeleton className="h-5 w-5 rounded shrink-0" />
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full hidden md:block" />
            <Skeleton className="h-5 w-16 rounded-full hidden md:block" />
            <Skeleton className="h-5 w-16 rounded-full hidden lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

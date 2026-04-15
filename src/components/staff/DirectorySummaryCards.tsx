import { Card, CardContent } from "@/components/ui/card";

export function DirectorySummaryCards({
  activeCount,
  benchedCount,
  terminatedCount,
  managementCount,
}: {
  activeCount: number;
  benchedCount: number;
  terminatedCount: number;
  managementCount: number;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Active */}
      <Card size="sm" className="border-[var(--color-brand-border)]">
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-subtle)]">On Schedule</p>
            <p className="text-2xl font-bold tracking-tight mt-0.5">{activeCount}</p>
          </div>
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-brand-bg)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-brand)]">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
        </CardContent>
      </Card>

      {/* Management */}
      <Card size="sm" className="border-[var(--color-border-light)]">
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-subtle)]">Management</p>
            <p className="text-2xl font-bold tracking-tight mt-0.5">{managementCount}</p>
          </div>
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-bg-secondary)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-subtle)]">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
        </CardContent>
      </Card>

      {/* Benched */}
      <Card size="sm" className="border-[var(--color-warning-border,#FDE68A)]">
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-subtle)]">Benched</p>
            <p className="text-2xl font-bold tracking-tight mt-0.5">{benchedCount}</p>
          </div>
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-warning-bg,#FEF3C7)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-warning-text,#92400E)]">
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
          </div>
        </CardContent>
      </Card>

      {/* Terminated */}
      <Card size="sm" className="border-[var(--color-danger-border,#FECACA)]">
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-subtle)]">Terminated</p>
            <p className="text-2xl font-bold tracking-tight mt-0.5">{terminatedCount}</p>
          </div>
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-danger-bg,#FEF2F2)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-danger,#DC2626)]">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="17" y1="11" x2="22" y2="11" />
            </svg>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

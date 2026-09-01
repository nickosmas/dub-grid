import { Card, CardContent } from "@/components/ui/card";

export function DirectorySummaryCards({
  onScheduleCount,
  fullTimeCount,
  partTimeCount,
  showEmploymentCounts = true,
}: {
  onScheduleCount: number;
  fullTimeCount: number;
  partTimeCount: number;
  showEmploymentCounts?: boolean;
}) {
  return (
    <div className={`grid grid-cols-1 gap-4 ${showEmploymentCounts ? "sm:grid-cols-3" : ""}`}>
      <Card
        size="sm"
        className="border-[var(--dg-color-brand-border)]"
        aria-label="On schedule staff count"
      >
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--dg-color-text-subtle)]">
              On schedule
            </p>
            <p className="text-2xl font-bold tracking-tight mt-0.5">{onScheduleCount}</p>
          </div>
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--dg-color-brand-bg)]">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--dg-color-brand)]"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
        </CardContent>
      </Card>

      {showEmploymentCounts && (
        <Card
          size="sm"
          className="border-[var(--dg-color-border-light)]"
          aria-label="Full-time staff count"
        >
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--dg-color-text-subtle)]">
                Full-time
              </p>
              <p className="text-2xl font-bold tracking-tight mt-0.5">{fullTimeCount}</p>
            </div>
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--dg-color-bg-secondary)]">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[var(--dg-color-text-subtle)]"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4" />
                <path d="M8 2v4" />
                <path d="M3 10h18" />
                <path d="M8 14h.01" />
                <path d="M12 14h.01" />
                <path d="M16 14h.01" />
                <path d="M8 18h.01" />
                <path d="M12 18h.01" />
              </svg>
            </div>
          </CardContent>
        </Card>
      )}

      {showEmploymentCounts && (
        <Card
          size="sm"
          className="border-[var(--dg-color-border-light)]"
          aria-label="Part-time staff count"
        >
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--dg-color-text-subtle)]">
                Part-time
              </p>
              <p className="text-2xl font-bold tracking-tight mt-0.5">{partTimeCount}</p>
            </div>
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--dg-color-warning-bg,#FEF3C7)]">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[var(--dg-color-warning-text,#92400E)]"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4" />
                <path d="M8 2v4" />
                <path d="M3 10h18" />
                <path d="M8 15h8" />
                <path d="M8 18h5" />
              </svg>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

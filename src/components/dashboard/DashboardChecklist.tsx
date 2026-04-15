import Link from "next/link";

type SetupStep = {
  done: boolean;
  label: string;
  href: string;
};

interface DashboardChecklistProps {
  steps: SetupStep[];
}

export default function DashboardChecklist({ steps }: DashboardChecklistProps) {
  const doneCount = steps.filter((step) => step.done).length;
  const progress = Math.round((doneCount / steps.length) * 100);

  return (
    <div
      style={{
        padding: "32px 24px",
        background: "var(--color-surface)",
        borderRadius: 14,
        border: "1px dashed var(--color-border)",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3
            style={{
              margin: "0 0 4px",
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            Get started with DubGrid
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: "var(--dg-fs-body)",
              color: "var(--color-text-muted)",
            }}
          >
            Complete these steps to set up your organization. {doneCount} of{" "}
            {steps.length} done.
          </p>
        </div>
        <div style={{ minWidth: 120, textAlign: "right" }}>
          <div
            style={{
              fontSize: "var(--dg-fs-caption)",
              color: "var(--color-text-muted)",
              fontWeight: 600,
            }}
          >
            {progress}% complete
          </div>
        </div>
      </div>

      <div
        style={{
          height: 8,
          width: "100%",
          borderRadius: 999,
          background: "var(--color-border)",
          overflow: "hidden",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            background: "var(--color-brand)",
            transition: "width 200ms ease",
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {steps.map((step) => (
          <Link
            key={step.label}
            href={step.href}
            className="dg-link"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderRadius: 8,
              background: step.done
                ? "var(--color-success-bg)"
                : "var(--color-bg)",
              border: `1px solid ${step.done ? "var(--color-success)" : "var(--color-border)"}`,
              color: step.done
                ? "var(--color-success-text)"
                : "var(--color-text-primary)",
              textDecoration: "none",
              fontSize: "var(--dg-fs-body)",
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: step.done ? "var(--color-success)" : "transparent",
                border: step.done ? "none" : "2px solid var(--color-border)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {step.done ? "✓" : null}
            </span>
            {step.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

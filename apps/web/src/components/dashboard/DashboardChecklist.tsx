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
        background: "var(--dg-color-surface)",
        borderRadius: "var(--dg-radius-md)",
        border: "1px dashed var(--dg-color-border)",
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
              color: "var(--dg-color-text-primary)",
            }}
          >
            Get started with DubGrid
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: "var(--dg-fs-body)",
              color: "var(--dg-color-text-muted)",
            }}
          >
            Complete these steps to set up your organization. {doneCount} of {steps.length} done.
          </p>
        </div>
        <div style={{ minWidth: 120, textAlign: "right" }}>
          <div
            style={{
              fontSize: "var(--dg-fs-caption)",
              color: "var(--dg-color-text-muted)",
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
          background: "var(--dg-color-border)",
          overflow: "hidden",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            background: "var(--dg-color-brand)",
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
              borderRadius: "var(--dg-radius-md)",
              background: step.done ? "var(--dg-color-success-bg)" : "var(--dg-color-bg)",
              border: `1px solid ${step.done ? "var(--dg-color-success)" : "var(--dg-color-border)"}`,
              color: step.done ? "var(--dg-color-success-text)" : "var(--dg-color-text-primary)",
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
                background: step.done ? "var(--dg-color-success)" : "transparent",
                border: step.done ? "none" : "2px solid var(--dg-color-border)",
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

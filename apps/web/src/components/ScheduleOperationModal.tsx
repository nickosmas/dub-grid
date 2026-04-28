"use client";

import Modal from "@/components/Modal";

interface ScheduleOperationModalProps {
  title: string;
  detail?: string;
  progress: number;
}

function clampProgress(progress: number) {
  return Math.max(0, Math.min(100, Math.round(progress)));
}

export default function ScheduleOperationModal({
  title,
  detail,
  progress,
}: ScheduleOperationModalProps) {
  const safeProgress = clampProgress(progress);
  const descId = "schedule-operation-progress-detail";

  return (
    <Modal
      title={title}
      onClose={() => {}}
      onRequestClose={() => false}
      showCloseButton={false}
      style={{ maxWidth: 420 }}
      aria-describedby={detail ? descId : undefined}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <span
            style={{
              fontSize: "var(--dg-fs-footnote)",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--color-text-subtle)",
            }}
          >
            In Progress
          </span>
          <span
            style={{
              fontSize: "calc(var(--dg-fs-section-title) + 8px)",
              fontWeight: 800,
              lineHeight: 1,
              color: "var(--color-brand)",
            }}
          >
            {safeProgress}%
          </span>
        </div>

        <div
          role="progressbar"
          aria-label={`${title} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={safeProgress}
          style={{
            height: 12,
            borderRadius: 999,
            background: "var(--color-bg-secondary)",
            overflow: "hidden",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${safeProgress}%`,
              background:
                "linear-gradient(90deg, var(--color-brand) 0%, var(--color-primary) 100%)",
              transition: "width 180ms ease",
            }}
          />
        </div>

        {detail ? (
          <p
            id={descId}
            style={{
              margin: 0,
              fontSize: "var(--dg-fs-body-sm)",
              lineHeight: 1.5,
              color: "var(--color-text-secondary)",
            }}
          >
            {detail}
          </p>
        ) : null}

        <p
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--color-text-faint)",
          }}
        >
          Please wait while we finish this scheduling update.
        </p>
      </div>
    </Modal>
  );
}

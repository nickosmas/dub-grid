"use client";

import { ShiftCode } from "@/types";

// Excluded from legend — internal/meta entries with no printed meaning
const EXCLUDED = new Set(["OFF", "0.3"]);

export default function PrintLegend({ shiftCodes }: { shiftCodes: ShiftCode[] }) {
  const items = shiftCodes.filter((s) => !EXCLUDED.has(s.label));

  return (
    <div className="print-legend">
      <div className="print-legend__title">Shift Code Key</div>
      <div className="print-legend__grid">
        {items.map((s) => (
          <div key={s.id} className="print-legend__item">
            <span
              className="print-legend__badge"
              style={{
                background: s.color,
                border: `1.5px solid ${s.border}`,
                color: s.text,
              }}
            >
              {s.label}
            </span>
            <span className="print-legend__name">{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

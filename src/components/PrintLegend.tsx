import { ShiftCode, ShiftDisplayMode } from "@/types";

// Excluded from legend — internal/meta entries with no printed meaning
const EXCLUDED = new Set(["OFF", "0.3"]);

export default function PrintLegend({ shiftCodes, shiftDisplayMode = "code" }: { shiftCodes: ShiftCode[]; shiftDisplayMode?: ShiftDisplayMode }) {
  const isNameMode = shiftDisplayMode === "name";
  const items = shiftCodes.filter((s) => !EXCLUDED.has(s.label));

  return (
    <div className="print-legend">
      <div className="print-legend__title">{isNameMode ? "Shift Key" : "Shift Code Key"}</div>
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
              {isNameMode ? (s.name || s.label) : s.label}
            </span>
            {!isNameMode && <span className="print-legend__name">{s.name}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

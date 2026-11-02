"use client";

import { AREA_LABEL_PRESETS } from "@dubgrid/domain";
import { SelectableTag } from "@/components/ui/selectable-tag";

interface AreaLabelPresetsProps {
  value: string;
  onSelect: (label: string) => void;
  disabled?: boolean;
}

export function AreaLabelPresets({ value, onSelect, disabled }: AreaLabelPresetsProps) {
  const current = value.trim().toLowerCase();
  return (
    <div
      role="group"
      aria-label="Suggested area labels"
      style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}
    >
      {AREA_LABEL_PRESETS.map((preset) => (
        <SelectableTag
          key={preset}
          selected={preset.toLowerCase() === current}
          disabled={disabled}
          onClick={() => onSelect(preset)}
        >
          {preset}
        </SelectableTag>
      ))}
    </div>
  );
}

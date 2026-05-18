"use client";

import { useMemo } from "react";
import CustomSelect from "@/components/CustomSelect";
import { US_STATES, normalizeUsStateValue } from "@/lib/us-states";

interface UsStateSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export default function UsStateSelect({
  id,
  value,
  onChange,
  disabled,
  style,
}: UsStateSelectProps) {
  const normalized = useMemo(() => normalizeUsStateValue(value), [value]);
  const options = useMemo(
    () => US_STATES.map(({ value: code, label }) => ({ value: code, label })),
    [],
  );

  return (
    <CustomSelect
      id={id}
      ariaLabel="State"
      value={normalized}
      options={options}
      onChange={onChange}
      disabled={disabled}
      placeholder="Select a state…"
      style={{ width: "100%", ...style }}
    />
  );
}

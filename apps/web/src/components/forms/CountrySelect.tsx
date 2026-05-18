"use client";

import CustomSelect from "@/components/CustomSelect";

const COUNTRY_OPTIONS = [{ value: "United States", label: "United States" }];
const US_ALIASES = new Set(["us", "usa", "u.s.", "u.s.a.", "united states", "united states of america"]);

interface CountrySelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export default function CountrySelect({
  id,
  value,
  onChange,
  disabled,
  style,
}: CountrySelectProps) {
  const normalized = value.trim().toLowerCase();
  const resolved = !normalized || US_ALIASES.has(normalized) ? "United States" : value;
  const onlyOneOption = COUNTRY_OPTIONS.length === 1;

  return (
    <CustomSelect
      id={id}
      ariaLabel="Country"
      value={resolved}
      options={COUNTRY_OPTIONS}
      onChange={onChange}
      disabled={disabled ?? onlyOneOption}
      style={{ width: "100%", ...style }}
    />
  );
}

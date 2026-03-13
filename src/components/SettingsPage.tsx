"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

import { Company, FocusArea, ShiftCategory, ShiftCode, IndicatorType, CompanyUser, AdminPermissions, NamedItem } from "@/types";
import * as db from "@/lib/db";
import { parseTo12h, to24h, fmt12h } from "@/lib/utils";
import ImpersonationPanel from "@/components/ImpersonationPanel";
import { usePermissions } from "@/hooks";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";

interface SettingsPageProps {
  company: Company;
  focusAreas: FocusArea[];
  shiftCodes: ShiftCode[];
  shiftCategories: ShiftCategory[];
  indicatorTypes: IndicatorType[];
  certifications: NamedItem[];
  companyRoles: NamedItem[];
  onCompanySave: (company: Company) => void;
  onFocusAreasChange: (focusAreas: FocusArea[]) => void;
  onShiftCodesChange: (codes: ShiftCode[]) => void;
  onShiftCategoriesChange: (categories: ShiftCategory[]) => void;
  onIndicatorTypesChange: (types: IndicatorType[]) => void;
  onCertificationsChange: (items: NamedItem[]) => void;
  onCompanyRolesChange: (items: NamedItem[]) => void;
  canManageCompany: boolean;
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid var(--color-border)",
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        maxWidth: 860,
      }}
    >
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid var(--color-border-light)",
          fontWeight: 700,
          fontSize: 14,
          color: "var(--color-text-secondary)",
        }}
      >
        {title}
      </div>
      <div style={{ padding: "20px" }}>{children}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 11px",
  border: "1.5px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 13,
  outline: "none",
  background: "#fff",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--color-text-subtle)",
  letterSpacing: "0.05em",
  display: "block",
  marginBottom: 5,
};

// ── Common IANA timezones ─────────────────────────────────────────────────────
const TIMEZONES = [
  { value: "America/New_York",    label: "Eastern (ET) — New York" },
  { value: "America/Chicago",     label: "Central (CT) — Chicago" },
  { value: "America/Denver",      label: "Mountain (MT) — Denver" },
  { value: "America/Phoenix",     label: "Mountain (no DST) — Phoenix" },
  { value: "America/Los_Angeles", label: "Pacific (PT) — Los Angeles" },
  { value: "America/Anchorage",   label: "Alaska (AKT) — Anchorage" },
  { value: "Pacific/Honolulu",    label: "Hawaii (HT) — Honolulu" },
  { value: "America/Toronto",     label: "Eastern (ET) — Toronto" },
  { value: "America/Vancouver",   label: "Pacific (PT) — Vancouver" },
  { value: "America/Winnipeg",    label: "Central (CT) — Winnipeg" },
  { value: "America/Halifax",     label: "Atlantic (AT) — Halifax" },
  { value: "America/St_Johns",    label: "Newfoundland (NT) — St. John's" },
  { value: "Europe/London",       label: "GMT/BST — London" },
  { value: "Europe/Paris",        label: "CET/CEST — Paris" },
  { value: "Australia/Sydney",    label: "AEST/AEDT — Sydney" },
  { value: "Australia/Melbourne", label: "AEST/AEDT — Melbourne" },
  { value: "Pacific/Auckland",    label: "NZST/NZDT — Auckland" },
];

// ── 12-hour time picker ───────────────────────────────────────────────────────
function TimeInput12h({ value, onChange }: { value: string | null | undefined; onChange: (v: string | null) => void }) {
  const init = parseTo12h(value);
  const [hour, setHour] = useState(init.hour);
  const [minute, setMinute] = useState(init.minute);
  const [period, setPeriod] = useState<"AM" | "PM">(init.period);

  useEffect(() => {
    const p = parseTo12h(value);
    setHour(p.hour);
    setMinute(p.minute);
    setPeriod(p.period);
  }, [value]);

  const selStyle: React.CSSProperties = {
    ...inputStyle,
    padding: "7px 4px",
    textAlign: "center",
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <select
        value={hour}
        onChange={(e) => { setHour(e.target.value); onChange(to24h(e.target.value, minute, period)); }}
        style={{ ...selStyle, width: 52 }}
      >
        <option value="">--</option>
        {[1,2,3,4,5,6,7,8,9,10,11,12].map((h) => (
          <option key={h} value={String(h)}>{h}</option>
        ))}
      </select>
      <span style={{ fontWeight: 700, color: "var(--color-text-muted)" }}>:</span>
      <select
        value={minute}
        onChange={(e) => { setMinute(e.target.value); onChange(to24h(hour, e.target.value, period)); }}
        style={{ ...selStyle, width: 52 }}
      >
        {["00","05","10","15","20","25","30","35","40","45","50","55"].map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <select
        value={period}
        onChange={(e) => { const p = e.target.value as "AM" | "PM"; setPeriod(p); onChange(to24h(hour, minute, p)); }}
        style={{ ...selStyle, width: 58 }}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

// ── Company Settings ──────────────────────────────────────────────────────────
function CompanySettings({
  company,
  onSave,
}: {
  company: Company;
  onSave: (o: Company) => void;
}) {
  const [form, setForm] = useState({
    name: company.name,
    address: company.address,
    phone: company.phone,
    employeeCount: company.employeeCount?.toString() ?? "",
    focusAreaLabel: company.focusAreaLabel,
    certificationLabel: company.certificationLabel,
    roleLabel: company.roleLabel,
    timezone: company.timezone ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isModified =
    form.name !== company.name ||
    form.address !== company.address ||
    form.phone !== company.phone ||
    (form.employeeCount || "") !== (company.employeeCount?.toString() ?? "") ||
    form.focusAreaLabel !== company.focusAreaLabel ||
    form.certificationLabel !== company.certificationLabel ||
    form.roleLabel !== company.roleLabel ||
    form.timezone !== (company.timezone ?? "");

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const updated: Company = {
        ...company,
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        employeeCount: form.employeeCount ? parseInt(form.employeeCount) : null,
        focusAreaLabel: form.focusAreaLabel.trim() || "Focus Areas",
        certificationLabel: form.certificationLabel.trim() || "Certifications",
        roleLabel: form.roleLabel.trim() || "Roles",
        timezone: form.timezone || null,
      };
      await db.updateCompany(updated);
      onSave(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success("Settings saved");
    } catch (err) {
      toast.error("Failed to save settings");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [form, company, onSave]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <label style={labelStyle}>COMPANY NAME</label>
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>PHONE</label>
          <input
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            placeholder="(415) 555-0100"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>ADDRESS</label>
          <input
            value={form.address}
            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            placeholder="123 Main St, City, State ZIP"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>NUMBER OF EMPLOYEES</label>
          <input
            type="number"
            min="0"
            value={form.employeeCount}
            onChange={(e) =>
              setForm((p) => ({ ...p, employeeCount: e.target.value }))
            }
            placeholder="e.g. 28"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Custom terminology labels */}
      <div>
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 12px" }}>
          Customize what your company calls each feature. These labels appear throughout the app.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>FOCUS AREAS LABEL</label>
            <input
              value={form.focusAreaLabel}
              onChange={(e) => setForm((p) => ({ ...p, focusAreaLabel: e.target.value }))}
              placeholder="Focus Areas"
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "4px 0 0" }}>
              e.g. Focus Areas, Departments, Units
            </p>
          </div>
          <div>
            <label style={labelStyle}>CERTIFICATIONS LABEL</label>
            <input
              value={form.certificationLabel}
              onChange={(e) => setForm((p) => ({ ...p, certificationLabel: e.target.value }))}
              placeholder="Certifications"
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "4px 0 0" }}>
              e.g. Certifications, Designations
            </p>
          </div>
          <div>
            <label style={labelStyle}>ROLES LABEL</label>
            <input
              value={form.roleLabel}
              onChange={(e) => setForm((p) => ({ ...p, roleLabel: e.target.value }))}
              placeholder="Roles"
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "4px 0 0" }}>
              e.g. Responsibilities, Positions
            </p>
          </div>
        </div>
      </div>

      {/* Timezone */}
      <div>
        <label style={labelStyle}>TIME ZONE</label>
        <select
          value={form.timezone}
          onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
          style={{ ...inputStyle, maxWidth: 340 }}
        >
          <option value="">— Select a time zone —</option>
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={handleSave}
          disabled={!isModified || saving}
          style={{
            background: isModified ? "var(--color-accent-gradient)" : "#ccc",
            border: "none",
            color: "#fff",
            borderRadius: 8,
            padding: "9px 20px",
            fontSize: 13,
            fontWeight: 700,
            cursor: isModified ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span style={{ fontSize: 13, color: "#16A34A", fontWeight: 600 }}>
            Saved!
          </span>
        )}
      </div>
    </div>
  );
}

// ── Focus Area row ────────────────────────────────────────────────────────────
function FocusAreaRow({
  focusArea,
  companyId,
  onSaved,
  onDeleted,
}: {
  focusArea: FocusArea & { isNew?: boolean };
  companyId: string;
  onSaved: (w: FocusArea) => void;
  onDeleted: (id: number) => void;
}) {
  const [form, setForm] = useState({
    name: focusArea.name,
    colorBg: focusArea.colorBg,
    colorText: focusArea.colorText,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isModified =
    form.name !== focusArea.name ||
    form.colorBg !== focusArea.colorBg ||
    form.colorText !== focusArea.colorText;

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const saved = await db.upsertFocusArea({
        id: focusArea.isNew ? undefined : focusArea.id,
        companyId: companyId,
        name: form.name.trim(),
        colorBg: form.colorBg,
        colorText: form.colorText,
        sortOrder: focusArea.sortOrder,
      }) as FocusArea;
      onSaved(saved);
      toast.success("Focus area saved");
    } catch (err) {
      toast.error("Failed to save focus area");
      console.error('upsertFocusArea error:', err instanceof Error ? err.message : JSON.stringify(err), err);
    } finally {
      setSaving(false);
    }
  }, [form, focusArea, companyId, onSaved]);

  const handleDelete = useCallback(async () => {
    if (focusArea.isNew) {
      onDeleted(focusArea.id);
      return;
    }
    setDeleting(true);
    try {
      await db.deleteFocusArea(focusArea.id);
      onDeleted(focusArea.id);
      toast.success("Focus area deleted");
    } catch (err) {
      toast.error("Failed to delete focus area");
      console.error(err);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [focusArea, onDeleted]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 100px 100px auto auto",
        gap: 10,
        alignItems: "center",
        padding: "10px 0",
        borderBottom: "1px solid var(--color-border-light)",
      }}
    >
      <input
        value={form.name}
        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
        placeholder="Area name"
        style={{ ...inputStyle }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <label style={{ ...labelStyle, marginBottom: 2 }}>BG COLOR</label>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="color"
            value={form.colorBg}
            onChange={(e) =>
              setForm((p) => ({ ...p, colorBg: e.target.value }))
            }
            style={{
              width: 32,
              height: 28,
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              cursor: "pointer",
              padding: 2,
            }}
          />
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: 20,
              background: form.colorBg,
              color: form.colorText,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            Preview
          </span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <label style={{ ...labelStyle, marginBottom: 2 }}>TEXT COLOR</label>
        <input
          type="color"
          value={form.colorText}
          onChange={(e) =>
            setForm((p) => ({ ...p, colorText: e.target.value }))
          }
          style={{
            width: 32,
            height: 28,
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            cursor: "pointer",
            padding: 2,
          }}
        />
      </div>
      <button
        onClick={handleSave}
        disabled={!isModified || saving}
        style={{
          background: isModified ? "var(--color-accent-gradient)" : "#ccc",
          border: "none",
          color: "#fff",
          borderRadius: 7,
          padding: "7px 14px",
          fontSize: 12,
          fontWeight: 700,
          cursor: isModified ? "pointer" : "not-allowed",
          whiteSpace: "nowrap",
        }}
      >
        {saving ? "…" : "Save"}
      </button>
      <button
        onClick={() => setShowDeleteConfirm(true)}
        disabled={deleting}
        style={{
          background: "none",
          border: "1px solid #FEE2E2",
          borderRadius: 7,
          color: "#EF4444",
          padding: "7px 12px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {deleting ? "…" : "Delete"}
      </button>
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Focus Area?"
          message={<>Delete <strong>{form.name || "this area"}</strong>? Employees assigned to this area will need to be reassigned.</>}
          confirmLabel="Delete"
          variant="danger"
          isLoading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}

// ── Focus Areas Settings ──────────────────────────────────────────────────────
function FocusAreasSettings({
  focusAreas,
  companyId,
  label,
  onChange,
}: {
  focusAreas: FocusArea[];
  companyId: string;
  label: string;
  onChange: (focusAreas: FocusArea[]) => void;
}) {
  const [localFocusAreas, setLocalFocusAreas] =
    useState<(FocusArea & { isNew?: boolean })[]>(focusAreas);
  const nextTmpId = useRef(-1);

  const handleAdd = () => {
    const tmp: FocusArea & { isNew: boolean } = {
      id: nextTmpId.current--,
      companyId: companyId,
      name: "",
      colorBg: "#F1F5F9",
      colorText: "#475569",
      sortOrder: localFocusAreas.length,
      isNew: true,
    };
    setLocalFocusAreas((prev) => [...prev, tmp]);
  };

  const handleSaved = (saved: FocusArea) => {
    const updated = localFocusAreas.map((w) =>
      w.name === saved.name || w.id === saved.id ? saved : w,
    );
    setLocalFocusAreas(updated);
    onChange(updated);
  };

  const handleDeleted = (id: number) => {
    const updated = localFocusAreas.filter((w) => w.id !== id);
    setLocalFocusAreas(updated);
    onChange(updated);
  };

  return (
    <div>
      <div style={{ marginBottom: 4 }}>
        {localFocusAreas.map((focusArea) => (
          <FocusAreaRow
            key={focusArea.id}
            focusArea={focusArea}
            companyId={companyId}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        ))}
      </div>
      <button
        onClick={handleAdd}
        style={{
          marginTop: 12,
          background: "none",
          border: "1.5px dashed var(--color-border)",
          borderRadius: 8,
          color: "var(--color-text-muted)",
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          width: "100%",
        }}
      >
        + Add {label}
      </button>
    </div>
  );
}

// ── Shift Code row ────────────────────────────────────────────────────────────
function ShiftCodeRow({
    st,
  focusAreas,
  shiftCategories,
  companyId,
  certifications,
  certificationLabel,
  focusAreaLabel = "Focus Area",
  isOffDayRow,
  hideFocusAreaSelect,
  onSaved,
  onDeleted,
}: {
  st: ShiftCode & { isNew?: boolean };
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  companyId: string;
  certifications: NamedItem[];
  certificationLabel: string;
  focusAreaLabel?: string;
  isOffDayRow?: boolean;
  hideFocusAreaSelect?: boolean;
  onSaved: (s: ShiftCode, prevId: number) => void;
  onDeleted: (id: number) => void;
}) {
  const [form, setForm] = useState({
    label: st.label,
    name: st.name,
    color: st.color === "transparent" ? "#F8FAFC" : st.color,
    border: st.border === "transparent" ? "#CBD5E1" : st.border,
    text: st.text === "transparent" ? "#64748B" : st.text,
    categoryId: st.categoryId ?? null as number | null,
    isOffDay: st.isOffDay ?? isOffDayRow ?? false,
    focusAreaId: st.focusAreaId ?? null as number | null,
    requiredCertificationIds: st.requiredCertificationIds ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(!!st.isNew);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Re-sync form from prop when the parent data changes (e.g. fresh fetch
  // after cert deletion trigger cleans up IDs).
  const stIdRef = useRef(st.id);
  const stVersionRef = useRef(JSON.stringify(st.requiredCertificationIds ?? []));
  useEffect(() => {
    const newVersion = JSON.stringify(st.requiredCertificationIds ?? []);
    if (st.id !== stIdRef.current || newVersion !== stVersionRef.current) {
      stIdRef.current = st.id;
      stVersionRef.current = newVersion;
      setForm({
        label: st.label,
        name: st.name,
        color: st.color === "transparent" ? "#F8FAFC" : st.color,
        border: st.border === "transparent" ? "#CBD5E1" : st.border,
        text: st.text === "transparent" ? "#64748B" : st.text,
        categoryId: st.categoryId ?? null,
        isOffDay: st.isOffDay ?? isOffDayRow ?? false,
        focusAreaId: st.focusAreaId ?? null,
        requiredCertificationIds: st.requiredCertificationIds ?? [],
      });
    }
  }, [st, isOffDayRow]);

  const isDirty = st.isNew ||
    form.label !== st.label ||
    form.name !== st.name ||
    form.color !== (st.color === "transparent" ? "#F8FAFC" : st.color) ||
    form.border !== (st.border === "transparent" ? "#CBD5E1" : st.border) ||
    form.text !== (st.text === "transparent" ? "#64748B" : st.text) ||
    form.categoryId !== (st.categoryId ?? null) ||
    form.isOffDay !== (st.isOffDay ?? isOffDayRow ?? false) ||
    form.focusAreaId !== (st.focusAreaId ?? null) ||
    JSON.stringify(form.requiredCertificationIds) !== JSON.stringify(st.requiredCertificationIds ?? []);

  const canSave = isDirty && !!form.label.trim() && !!form.name.trim();

  const handleSave = useCallback(async () => {
    if (!form.label.trim() || !form.name.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await db.upsertShiftCode({
        id: st.isNew ? undefined : st.id,
        companyId: companyId,
        label: form.label.trim(),
        name: form.name.trim(),
        color: form.color,
        border: form.border,
        text: form.text,
        categoryId: form.categoryId,
        isGeneral: form.focusAreaId == null,
        isOffDay: form.isOffDay,
        focusAreaId: form.focusAreaId,
        sortOrder: st.sortOrder,
        requiredCertificationIds: form.requiredCertificationIds,
      });
      onSaved(saved, st.id);
      setExpanded(false);
      toast.success("Shift code saved");
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? JSON.stringify(err) ?? "Unknown error";
      console.error("Save shift code error:", msg, err);
      setSaveError(msg);
      toast.error("Failed to save shift code");
    } finally {
      setSaving(false);
    }
  }, [form, st, companyId, onSaved]);

  const handleDelete = useCallback(async () => {
    if (st.isNew) {
      onDeleted(st.id);
      return;
    }
    setDeleting(true);
    try {
      await db.deleteShiftCode(st.id);
      onDeleted(st.id);
      toast.success("Shift code deleted");
    } catch (err) {
      toast.error("Failed to delete shift code");
      console.error(err);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [st, onDeleted]);

  return (
    <div style={{ borderBottom: "1px solid var(--color-border-light)" }}>
      {/* Collapsed row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 0",
          cursor: "pointer",
        }}
        onClick={() => setExpanded((e) => !e)}
      >
        <span
          style={{
            display: "inline-block",
            minWidth: 44,
            padding: "3px 8px",
            background: form.color,
            border: `1.5px solid ${form.border}`,
            color: form.text,
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          {form.label || "…"}
        </span>
        <span
          style={{
            fontSize: 13,
            color: "var(--color-text-secondary)",
            flex: 1,
          }}
        >
          {form.name || "—"}
        </span>
        {!hideFocusAreaSelect && form.focusAreaId != null && (
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            {focusAreas.find((w) => w.id === form.focusAreaId)?.name}
          </span>
        )}
        {form.categoryId !== null && (
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 6px",
            background: "var(--color-bg-subtle)",
            color: "var(--color-text-secondary)",
            borderRadius: 4,
            border: "1px solid var(--color-border-light)",
          }}>
            {shiftCategories.find(c => c.id === form.categoryId)?.name}
          </span>
        )}
        <span
          style={{
            fontSize: 14,
            color: "var(--color-text-faint)",
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        >
          ▾
        </span>
      </div>

      {/* Expanded edit form */}
      {expanded && (
        <div
          style={{
            background: "var(--color-bg, #F8FAFC)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            padding: 16,
            marginBottom: 10,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              gap: 10,
            }}
          >
            <div>
              <label style={labelStyle}>CODE / LABEL</label>
              <input
                value={form.label}
                onChange={(e) =>
                  setForm((p) => ({ ...p, label: e.target.value }))
                }
                placeholder="e.g. D"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>FULL NAME</label>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="e.g. Day Shift"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Focus area — single select (hidden when section pre-assigns it) */}
          {!hideFocusAreaSelect && (
            <div>
              <label style={labelStyle}>
                {focusAreaLabel.toUpperCase()} (leave blank for global)
              </label>
              <select
                value={form.focusAreaId ?? ""}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    focusAreaId: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                style={{ ...inputStyle, marginTop: 4 }}
              >
                <option value="">— Global (no {focusAreaLabel.toLowerCase()}) —</option>
                {focusAreas.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Shift Category */}
          {!form.isOffDay && (
            <div>
              <label style={labelStyle}>SHIFT CATEGORY</label>
              <select
                value={form.categoryId ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value ? Number(e.target.value) : null }))}
                style={{ ...inputStyle, marginTop: 4 }}
              >
                <option value="">— Generic (No Category) —</option>
                {shiftCategories
                  .filter(c => form.focusAreaId == null || c.focusAreaId == null || c.focusAreaId === form.focusAreaId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name} {c.focusAreaId ? `(${focusAreas.find(w => w.id === c.focusAreaId)?.name})` : "(Global)"}</option>
                  ))}
              </select>
            </div>
          )}

          {/* Colors */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 10,
            }}
          >
            <div>
              <label style={labelStyle}>BACKGROUND</label>
              <input
                type="color"
                value={form.color}
                onChange={(e) =>
                  setForm((p) => ({ ...p, color: e.target.value }))
                }
                style={{
                  width: "100%",
                  height: 34,
                  border: "1px solid var(--color-border)",
                  borderRadius: 7,
                  cursor: "pointer",
                  padding: 2,
                }}
              />
            </div>
            <div>
              <label style={labelStyle}>BORDER</label>
              <input
                type="color"
                value={form.border}
                onChange={(e) =>
                  setForm((p) => ({ ...p, border: e.target.value }))
                }
                style={{
                  width: "100%",
                  height: 34,
                  border: "1px solid var(--color-border)",
                  borderRadius: 7,
                  cursor: "pointer",
                  padding: 2,
                }}
              />
            </div>
            <div>
              <label style={labelStyle}>TEXT</label>
              <input
                type="color"
                value={form.text}
                onChange={(e) =>
                  setForm((p) => ({ ...p, text: e.target.value }))
                }
                style={{
                  width: "100%",
                  height: 34,
                  border: "1px solid var(--color-border)",
                  borderRadius: 7,
                  cursor: "pointer",
                  padding: 2,
                }}
              />
            </div>
          </div>

          {/* Required Certifications — only for regular shifts */}
          {!form.isOffDay && certifications.length > 0 && (
            <div>
              <label style={labelStyle}>
                REQUIRED {certificationLabel.toUpperCase()} (leave all unchecked = any qualification)
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 4 }}>
                {certifications.map((desig) => {
                  const checked = form.requiredCertificationIds.includes(desig.id);
                  return (
                    <label
                      key={desig.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 13,
                        cursor: "pointer",
                        padding: "4px 10px",
                        borderRadius: 20,
                        border: `1.5px solid ${
                          checked ? "var(--color-accent-start)" : "var(--color-border)"
                        }`,
                        background: checked ? "#EEF2FF" : "transparent",
                        transition: "border-color 0.1s, background 0.1s",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        style={{ display: "none" }}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            requiredCertificationIds: e.target.checked
                              ? [...p.requiredCertificationIds, desig.id]
                              : p.requiredCertificationIds.filter((d) => d !== desig.id),
                          }))
                        }
                      />
                      <span
                        style={{
                          fontWeight: checked ? 700 : 500,
                          color: checked
                            ? "var(--color-accent-start)"
                            : "var(--color-text-secondary)",
                        }}
                      >
                        {desig.name !== desig.abbr ? `${desig.abbr} — ${desig.name}` : desig.name}
                      </span>
                    </label>
                  );
                })}
              </div>
              {form.requiredCertificationIds.length > 0 && (
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--color-text-muted)" }}>
                  Only {form.requiredCertificationIds.map(id => certifications.find(s => s.id === id)?.name).filter(Boolean).join(", ")} can be assigned this shift.
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          {saveError && (
            <p style={{ color: "#EF4444", fontSize: 12, margin: "0 0 8px" }}>
              <strong>Error:</strong> {saveError}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              style={{
                background: canSave ? "var(--color-accent-gradient)" : "var(--color-border-light)",
                border: "none",
                color: canSave ? "#fff" : "var(--color-text-muted)",
                borderRadius: 7,
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: 700,
                cursor: canSave ? "pointer" : "default",
                opacity: canSave ? 1 : 0.6,
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setExpanded(false)}
              style={{
                background: "var(--color-border-light)",
                border: "none",
                borderRadius: 7,
                color: "var(--color-text-muted)",
                padding: "8px 14px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              style={{
                background: "none",
                border: "1px solid #FEE2E2",
                borderRadius: 7,
                color: "#EF4444",
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {deleting ? "…" : "Delete"}
            </button>
          </div>
        </div>
      )}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Shift Code?"
          message={<>Delete <strong>{form.label}</strong>? This code will be removed from future schedules.</>}
          confirmLabel="Delete"
          variant="danger"
          isLoading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}

// ── Shift Codes Settings ──────────────────────────────────────────────────────
function ShiftCodesSettings({
  shiftCodes,
  focusAreas,
  shiftCategories,
  companyId,
  certifications,
  certificationLabel,
  focusAreaLabel,
  onChange,
}: {
  shiftCodes: ShiftCode[];
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  companyId: string;
  certifications: NamedItem[];
  certificationLabel: string;
  focusAreaLabel: string;
  onChange: (types: ShiftCode[]) => void;
}) {
  const [local, setLocal] =
    useState<(ShiftCode & { isNew?: boolean })[]>(shiftCodes);
  const nextTmpId = useRef(-1);

  // Sync local state when the parent shiftCodes prop changes (e.g. fresh DB
  // data replacing stale cache data). Only replaces items that haven't been
  // locally added (isNew), so unsaved additions aren't lost.
  useEffect(() => {
    setLocal((prev) => {
      const newItems = prev.filter((s) => (s as { isNew?: boolean }).isNew);
      return [...shiftCodes, ...newItems];
    });
  }, [shiftCodes]);

  const handleAdd = (focusAreaId: number | null, isOffDay = false) => {
    const tmp: ShiftCode & { isNew: boolean } = {
      id: nextTmpId.current--,
      companyId: companyId,
      label: "",
      name: "",
      color: isOffDay ? "#F1F5F9" : "#F8FAFC",
      border: "#CBD5E1",
      text: "#64748B",
      isOffDay,
      focusAreaId: focusAreaId,
      sortOrder: local.filter((s) => (s.focusAreaId ?? null) === focusAreaId).length,
      isNew: true,
    };
    setLocal((prev) => [...prev, tmp]);
  };

  const handleSaved = (saved: ShiftCode, prevId: number) => {
    const updated = local.map((s) => (s.id === prevId ? saved : s));
    setLocal(updated);
    onChange(updated);
  };

  const handleDeleted = (id: number) => {
    const updated = local.filter((s) => s.id !== id);
    setLocal(updated);
    onChange(updated);
  };

  const addBtnStyle: React.CSSProperties = {
    marginTop: 6,
    background: "none",
    border: "1.5px dashed var(--color-border)",
    borderRadius: 8,
    color: "var(--color-text-muted)",
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  };

  const renderRows = (codes: (ShiftCode & { isNew?: boolean })[], isOffDaySection = false, hideAreaSelect = false) =>
    codes.map((st) => (
      <ShiftCodeRow
        key={st.id}
        st={st}
        focusAreas={focusAreas}
        shiftCategories={shiftCategories}
        companyId={companyId}
        certifications={certifications}
        certificationLabel={certificationLabel}
        focusAreaLabel={focusAreaLabel}
        isOffDayRow={isOffDaySection}
        hideFocusAreaSelect={hideAreaSelect}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    ));

  const sectionHeader = (label: string, colorBg?: string, colorText?: string) => (
    <div style={{
      padding: "10px 16px",
      background: colorBg || "var(--color-bg-subtle)",
      color: colorText || "var(--color-text-secondary)",
      fontWeight: 700,
      fontSize: 13,
      borderBottom: "1px solid var(--color-border-light)",
    }}>
      {label}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 14px" }}>
        Click any row to expand and edit. The label (code) is used in the schedule grid.
      </p>

      {/* Per-focus-area sections */}
      {focusAreas.map((focusArea) => {
        const areaCodes = local.filter(
          (s) => !s.isOffDay && s.focusAreaId === focusArea.id,
        );
        return (
          <div key={focusArea.id} style={{ marginBottom: 20, border: "1px solid var(--color-border-light)", borderRadius: 10, overflow: "hidden" }}>
            {sectionHeader(focusArea.name, focusArea.colorBg, focusArea.colorText)}
            {areaCodes.length > 0 && (
              <div style={{ padding: "0 16px" }}>
                {renderRows(areaCodes, false, true)}
              </div>
            )}
            <div style={{ padding: "8px 16px" }}>
              <button onClick={() => handleAdd(focusArea.id)} style={addBtnStyle}>
                + Add Shift Code
              </button>
            </div>
          </div>
        );
      })}

      {/* General / cross-area codes */}
      {(() => {
        const generalCodes = local.filter(
          (s) => !s.isOffDay && s.focusAreaId == null,
        );
        return (
          <div style={{ marginBottom: 20, border: "1px solid var(--color-border-light)", borderRadius: 10, overflow: "hidden" }}>
            {sectionHeader("General / Cross-Area")}
            {generalCodes.length > 0 && (
              <div style={{ padding: "0 16px" }}>
                {renderRows(generalCodes, false, true)}
              </div>
            )}
            <div style={{ padding: "8px 16px" }}>
              <button onClick={() => handleAdd(null)} style={addBtnStyle}>
                + Add General Code
              </button>
            </div>
          </div>
        );
      })()}

      {/* Off Days */}
      {(() => {
        const offDayCodes = local.filter((s) => s.isOffDay);
        return (
          <div style={{ border: "1px solid var(--color-border-light)", borderRadius: 10, overflow: "hidden" }}>
            {sectionHeader("Off Days")}
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0, padding: "8px 16px 4px" }}>
              Off days (scheduled off, sick leave, vacation) do not count toward shift totals.
            </p>
            {offDayCodes.length > 0 && (
              <div style={{ padding: "0 16px" }}>
                {renderRows(offDayCodes, true, true)}
              </div>
            )}
            <div style={{ padding: "8px 16px" }}>
              <button onClick={() => handleAdd(null, true)} style={addBtnStyle}>
                + Add Off Day Code
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── String List Editor ────────────────────────────────────────────────────────
// Tag list with live-preview drag reordering.
function StringListSettings({
  label,
  items,
  onSave,
  placeholder,
}: {
  label: string;
  items: NamedItem[];
  onSave: (items: NamedItem[]) => Promise<void>;
  placeholder: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [local, setLocal] = useState<NamedItem[]>(items);
  const [newName, setNewName] = useState("");
  const [newAbbr, setNewAbbr] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDirty = JSON.stringify(local) !== JSON.stringify(items);

  const displayList = useMemo((): NamedItem[] => {
    if (!isEditing || draggedIdx === null || dragOverIdx === null) return isEditing ? local : items;
    const list = [...local];
    const [item] = list.splice(draggedIdx, 1);
    list.splice(dragOverIdx, 0, item);
    return list;
  }, [isEditing, local, items, draggedIdx, dragOverIdx]);

  const handleEnterEdit = () => {
    setLocal([...items]);
    setIsEditing(true);
    setNewName("");
    setNewAbbr("");
    setError(null);
  };

  const handleCancel = () => {
    setLocal([...items]);
    setIsEditing(false);
    setDraggedIdx(null);
    setDragOverIdx(null);
    setNewName("");
    setNewAbbr("");
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(local);
      setSaved(true);
      setIsEditing(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : JSON.stringify(err);
      setError(msg || "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () => {
    const trimmedName = newName.trim();
    const trimmedAbbr = newAbbr.trim() || trimmedName;
    if (!trimmedName || local.some((it) => it.name === trimmedName)) return;
    setLocal((prev) => [...prev, { id: 0, companyId: "", name: trimmedName, abbr: trimmedAbbr, sortOrder: prev.length }]);
    setNewName("");
    setNewAbbr("");
  };

  const handleRemove = (i: number) => {
    setLocal((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleItemChange = (i: number, field: "name" | "abbr", value: string) => {
    setLocal((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  };

  const handleDragStart = (idx: number) => {
    setDraggedIdx(idx);
    setDragOverIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, targetIdx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(targetIdx);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (draggedIdx !== null && dragOverIdx !== null && draggedIdx !== dragOverIdx) {
      const list = [...local];
      const [item] = list.splice(draggedIdx, 1);
      list.splice(dragOverIdx, 0, item);
      setLocal(list);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const gridCols = isEditing ? "24px 32px 1fr 200px 28px" : "32px 1fr 200px";

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 0, marginBottom: 12 }}>
        {label}
      </p>

      {/* Controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        {!isEditing && (
          <button
            onClick={handleEnterEdit}
            className="dg-btn"
            style={{ padding: "7px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
          </button>
        )}
        {isEditing && isDirty && (
          <button onClick={handleSave} disabled={saving} className="dg-btn dg-btn-primary" style={{ padding: "7px 14px" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        )}
        {isEditing && (
          <button onClick={handleCancel} className="dg-btn" style={{ padding: "7px 14px" }}>
            Cancel
          </button>
        )}
        {saved && (
          <span style={{ fontSize: 13, color: "#16A34A", fontWeight: 600 }}>Saved!</span>
        )}
      </div>

      {/* Table */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: isEditing ? "1.5px solid #2563EB" : "1px solid var(--color-border)",
          overflow: "hidden",
          boxShadow: isEditing ? "0 0 0 3px rgba(37,99,235,0.1)" : "0 1px 4px rgba(0,0,0,0.04)",
          transition: "border-color 0.15s, box-shadow 0.15s",
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridCols,
            padding: "10px 16px",
            borderBottom: "1px solid var(--color-border-light)",
            background: isEditing ? "#EFF6FF" : undefined,
          }}
        >
          {(isEditing
            ? ["", "#", "Full Name", "Abbreviation", ""]
            : ["#", "Full Name", "Abbreviation"]
          ).map((h, i) => (
            <div
              key={i}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--color-text-subtle)",
                letterSpacing: "0.06em",
              }}
            >
              {h}
            </div>
          ))}
        </div>

        {/* Item rows */}
        {displayList.map((item, i) => {
          const isDragging = isEditing && draggedIdx !== null && local[draggedIdx]?.name === item.name;
          const isDropTarget = isEditing && dragOverIdx === i && draggedIdx !== null && draggedIdx !== i;
          return (
            <div
              key={i}
              draggable={isEditing}
              onDragStart={isEditing ? () => handleDragStart(i) : undefined}
              onDragOver={isEditing ? (e) => handleDragOver(e, i) : undefined}
              onDrop={isEditing ? handleDrop : undefined}
              onDragEnd={isEditing ? handleDragEnd : undefined}
              style={{
                display: "grid",
                gridTemplateColumns: gridCols,
                padding: "8px 16px",
                borderTop: isDropTarget
                  ? "2px solid #2563EB"
                  : i === 0
                    ? "none"
                    : "1px solid var(--color-border-light)",
                alignItems: "center",
                background: i % 2 === 0 ? "#fff" : "var(--color-row-alt, #FAFAFA)",
                cursor: isEditing ? "grab" : "default",
                transition: "background 0.15s, opacity 0.15s",
                opacity: isDragging ? 0.4 : 1,
                userSelect: isEditing ? "none" : undefined,
              }}
            >
              {isEditing && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-faint)" }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="3" y="2" width="2" height="2" rx="1"/>
                    <rect x="9" y="2" width="2" height="2" rx="1"/>
                    <rect x="3" y="6" width="2" height="2" rx="1"/>
                    <rect x="9" y="6" width="2" height="2" rx="1"/>
                    <rect x="3" y="10" width="2" height="2" rx="1"/>
                    <rect x="9" y="10" width="2" height="2" rx="1"/>
                  </svg>
                </div>
              )}

              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-faint)" }}>
                {i + 1}
              </div>

              {isEditing ? (
                <input
                  value={item.name}
                  onChange={(e) => handleItemChange(i, "name", e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  draggable={false}
                  placeholder="Full name"
                  style={{ ...inputStyle, fontSize: 13, fontWeight: 500 }}
                />
              ) : (
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)" }}>
                  {item.name}
                </div>
              )}

              {isEditing ? (
                <input
                  value={item.abbr}
                  onChange={(e) => handleItemChange(i, "abbr", e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  draggable={false}
                  placeholder="Abbreviation"
                  style={{ ...inputStyle, fontSize: 13, fontWeight: 600 }}
                />
              ) : (
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-muted)" }}>
                  {item.abbr}
                </div>
              )}

              {isEditing && (
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); handleRemove(i); }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-text-muted)",
                    fontSize: 16,
                    lineHeight: 1,
                    padding: "0 2px",
                  }}
                  title="Remove"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {/* Add new row — only in edit mode */}
        {isEditing && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              padding: "8px 16px",
              borderTop: "1px solid var(--color-border-light)",
              alignItems: "center",
              background: "#F8FAFC",
            }}
          >
            <div />
            <div />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder={placeholder}
              style={{ ...inputStyle, fontSize: 13 }}
            />
            <input
              value={newAbbr}
              onChange={(e) => setNewAbbr(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Abbreviation"
              style={{ ...inputStyle, fontSize: 13 }}
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              style={{
                background: "none",
                border: "none",
                cursor: newName.trim() ? "pointer" : "not-allowed",
                color: newName.trim() ? "#2563EB" : "var(--color-text-faint)",
                fontSize: 18,
                fontWeight: 700,
                lineHeight: 1,
                padding: 0,
              }}
              title="Add"
            >
              +
            </button>
          </div>
        )}
      </div>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "#FEF2F2",
            border: "1px solid #FCA5A5",
            borderRadius: 8,
            color: "#B91C1C",
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          <strong>Save Error:</strong> {error}
        </div>
      )}
    </div>
  );
}


// ── Indicator Types Settings ──────────────────────────────────────────────────
function IndicatorTypesSettings({
  indicatorTypes,
  companyId,
  onChange,
}: {
  indicatorTypes: IndicatorType[];
  companyId: string;
  onChange: (types: IndicatorType[]) => void;
}) {
  const [local, setLocal] = useState<(IndicatorType & { isNew?: boolean })[]>(indicatorTypes);
  const [saving, setSaving] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const nextTmpId = useRef(-1);

  const handleAdd = () => {
    const tmp: IndicatorType & { isNew: boolean } = {
      id: nextTmpId.current--,
      companyId: companyId,
      name: "",
      color: "#6366F1",
      sortOrder: local.length,
      isNew: true,
    };
    setLocal((prev) => [...prev, tmp]);
  };

  const handleSave = async (indicator: IndicatorType & { isNew?: boolean }) => {
    if (!indicator.name.trim()) return;
    setSaving(indicator.id);
    try {
      const saved = await db.upsertIndicatorType({
        id: indicator.isNew ? undefined : indicator.id,
        companyId: companyId,
        name: indicator.name.trim(),
        color: indicator.color,
        sortOrder: indicator.sortOrder,
      });
      const updated = local.map((i) => (i.id === indicator.id ? saved : i));
      setLocal(updated);
      onChange(updated);
      toast.success("Indicator saved");
    } catch (err) {
      toast.error("Failed to save indicator");
      console.error(err);
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (indicator: IndicatorType & { isNew?: boolean }) => {
    if (indicator.isNew) {
      const updated = local.filter((i) => i.id !== indicator.id);
      setLocal(updated);
      onChange(updated);
      return;
    }
    setDeleting(indicator.id);
    try {
      await db.deleteIndicatorType(indicator.id);
      const updated = local.filter((i) => i.id !== indicator.id);
      setLocal(updated);
      onChange(updated);
      toast.success("Indicator deleted");
    } catch (err) {
      toast.error("Failed to delete indicator");
      console.error(err);
    } finally {
      setDeleting(null);
      setConfirmDeleteId(null);
    }
  };

  const handleChange = (id: number, field: "name" | "color", value: string) => {
    setLocal((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 14px" }}>
        Indicators appear as colored dots on shift cells. Add, rename, or recolor them here.
      </p>
      {local.map((indicator) => {
        const isSavingThis = saving === indicator.id;
        const isDeletingThis = deleting === indicator.id;
        return (
          <div
            key={indicator.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px auto auto",
              gap: 10,
              alignItems: "center",
              padding: "10px 0",
              borderBottom: "1px solid var(--color-border-light)",
            }}
          >
            <input
              value={indicator.name}
              onChange={(e) => handleChange(indicator.id, "name", e.target.value)}
              placeholder="Indicator name (e.g. Readings)"
              style={{ ...inputStyle }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="color"
                value={indicator.color}
                onChange={(e) => handleChange(indicator.id, "color", e.target.value)}
                style={{
                  width: 32,
                  height: 28,
                  border: "1px solid var(--color-border)",
                  borderRadius: 4,
                  cursor: "pointer",
                  padding: 2,
                }}
              />
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: indicator.color,
                  border: "1px solid rgba(0,0,0,0.12)",
                  flexShrink: 0,
                }}
              />
            </div>
            <button
              onClick={() => handleSave(indicator)}
              disabled={isSavingThis || !indicator.name.trim()}
              style={{
                background: indicator.name.trim() ? "var(--color-accent-gradient)" : "#ccc",
                border: "none",
                color: "#fff",
                borderRadius: 7,
                padding: "7px 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: indicator.name.trim() ? "pointer" : "not-allowed",
                whiteSpace: "nowrap",
              }}
            >
              {isSavingThis ? "…" : "Save"}
            </button>
            <button
              onClick={() => indicator.isNew ? handleDelete(indicator) : setConfirmDeleteId(indicator.id)}
              disabled={isDeletingThis}
              style={{
                background: "none",
                border: "1px solid #FEE2E2",
                borderRadius: 7,
                color: "#EF4444",
                padding: "7px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {isDeletingThis ? "…" : "Delete"}
            </button>
          </div>
        );
      })}
      <button
        onClick={handleAdd}
        style={{
          marginTop: 8,
          background: "none",
          border: "1.5px dashed var(--color-border)",
          borderRadius: 8,
          color: "var(--color-text-muted)",
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          width: "100%",
        }}
      >
        + Add Indicator
      </button>
      {confirmDeleteId !== null && (() => {
        const indicator = local.find(i => i.id === confirmDeleteId);
        if (!indicator) return null;
        return (
          <ConfirmDialog
            title="Delete Indicator?"
            message={<>Delete <strong>{indicator.name || "this indicator"}</strong>? This indicator will be removed from all shift cells.</>}
            confirmLabel="Delete"
            variant="danger"
            isLoading={deleting === confirmDeleteId}
            onConfirm={() => handleDelete(indicator)}
            onCancel={() => setConfirmDeleteId(null)}
          />
        );
      })()}
    </div>
  );
}


// ── Shift Categories Settings ──────────────────────────────────────────────────
function ShiftCategoriesSettings({
  shiftCategories,
  focusAreas,
  companyId,
  onChange,
}: {
  shiftCategories: ShiftCategory[];
  focusAreas: FocusArea[];
  companyId: string;
  onChange: (categories: ShiftCategory[]) => void;
}) {
  const [local, setLocal] = useState<(ShiftCategory & { isNew?: boolean })[]>(shiftCategories);
  const [saving, setSaving] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const originalRef = useRef<Map<number, ShiftCategory>>(
    new Map(shiftCategories.map((c) => [c.id, c]))
  );
  const nextTmpId = useRef(-1);

  const handleAdd = (focusAreaId: number | null) => {
    const tmpId = nextTmpId.current--;
    const tmp: ShiftCategory & { isNew: boolean } = {
      id: tmpId,
      companyId: companyId,
      name: "",
      color: "#EFF6FF",
      startTime: null,
      endTime: null,
      sortOrder: local.filter((c) => c.focusAreaId === focusAreaId).length,
      focusAreaId,
      isNew: true,
    };
    setLocal((prev) => [...prev, tmp]);
    setEditingId(tmpId);
  };

  const handleChange = (id: number, field: keyof ShiftCategory, value: string | number | null) => {
    setLocal((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const handleCancel = (cat: ShiftCategory & { isNew?: boolean }) => {
    if (cat.isNew) {
      setLocal((prev) => prev.filter((c) => c.id !== cat.id));
      onChange(local.filter((c) => c.id !== cat.id));
    } else {
      const orig = originalRef.current.get(cat.id);
      if (orig) setLocal((prev) => prev.map((c) => (c.id === cat.id ? orig : c)));
    }
    setEditingId(null);
  };

  const handleSave = async (cat: ShiftCategory & { isNew?: boolean }) => {
    if (!cat.name.trim()) return;
    setSaving(cat.id);
    try {
      const saved = await db.upsertShiftCategory({
        id: cat.isNew ? undefined : cat.id,
        companyId: companyId,
        name: cat.name.trim(),
        color: cat.color,
        startTime: cat.startTime || null,
        endTime: cat.endTime || null,
        sortOrder: cat.sortOrder,
        focusAreaId: cat.focusAreaId ?? null,
      });
      originalRef.current.set(saved.id, saved);
      const updated = local.map((c) => (c.id === cat.id ? saved : c));
      setLocal(updated);
      onChange(updated);
      setEditingId(null);
      toast.success("Category saved");
    } catch (err) {
      toast.error("Failed to save category");
      console.error(err);
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (cat: ShiftCategory & { isNew?: boolean }) => {
    if (cat.isNew) {
      const updated = local.filter((c) => c.id !== cat.id);
      setLocal(updated);
      onChange(updated);
      setEditingId(null);
      return;
    }
    setDeleting(cat.id);
    try {
      await db.deleteShiftCategory(cat.id);
      const updated = local.filter((c) => c.id !== cat.id);
      setLocal(updated);
      onChange(updated);
      setEditingId(null);
      toast.success("Category deleted");
    } catch (err) {
      toast.error("Failed to delete category");
      console.error(err);
    } finally {
      setDeleting(null);
      setConfirmDeleteId(null);
    }
  };

  const addBtnStyle: React.CSSProperties = {
    marginTop: 6,
    background: "none",
    border: "1.5px dashed var(--color-border)",
    borderRadius: 8,
    color: "var(--color-text-muted)",
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  };

  const renderCategoryRow = (cat: ShiftCategory & { isNew?: boolean }) => {
    const isEditing = editingId === cat.id;
    const isSavingThis = saving === cat.id;
    const isDeletingThis = deleting === cat.id;
    const orig = originalRef.current.get(cat.id);
    const isDirty = cat.isNew || !orig ||
      cat.name !== orig.name ||
      (cat.startTime ?? null) !== (orig.startTime ?? null) ||
      (cat.endTime ?? null) !== (orig.endTime ?? null);

    if (!isEditing) {
      return (
        <div
          key={cat.id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "11px 0",
            borderBottom: "1px solid var(--color-border-light)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {cat.name || <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>Untitled</span>}
            </span>
            {(cat.startTime || cat.endTime) && (
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {fmt12h(cat.startTime)} – {fmt12h(cat.endTime)}
              </span>
            )}
          </div>
          <button
            onClick={() => setEditingId(cat.id)}
            style={{
              background: "none",
              border: "1px solid var(--color-border)",
              borderRadius: 7,
              color: "var(--color-text-primary)",
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Edit
          </button>
        </div>
      );
    }

    return (
      <div
        key={cat.id}
        style={{
          padding: "12px 0",
          borderBottom: "1px solid var(--color-border-light)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto",
            gap: 10,
            alignItems: "end",
            marginBottom: 10,
          }}
        >
          <div>
            <label style={labelStyle}>NAME</label>
            <input
              value={cat.name}
              onChange={(e) => handleChange(cat.id, "name", e.target.value)}
              placeholder="e.g. Day Shift"
              style={{ ...inputStyle }}
              autoFocus
            />
          </div>
          <div>
            <label style={labelStyle}>START</label>
            <TimeInput12h
              value={cat.startTime}
              onChange={(v) => handleChange(cat.id, "startTime", v)}
            />
          </div>
          <div>
            <label style={labelStyle}>END</label>
            <TimeInput12h
              value={cat.endTime}
              onChange={(v) => handleChange(cat.id, "endTime", v)}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => handleSave(cat)}
            disabled={isSavingThis || !cat.name.trim() || !isDirty}
            style={{
              background: cat.name.trim() && isDirty ? "var(--color-accent-gradient)" : "#ccc",
              border: "none",
              color: "#fff",
              borderRadius: 7,
              padding: "7px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: cat.name.trim() && isDirty ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
            }}
          >
            {isSavingThis ? "…" : "Save"}
          </button>
          <button
            onClick={() => handleCancel(cat)}
            disabled={isSavingThis}
            style={{
              background: "none",
              border: "1px solid var(--color-border)",
              borderRadius: 7,
              color: "var(--color-text-primary)",
              padding: "7px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => cat.isNew ? handleDelete(cat) : setConfirmDeleteId(cat.id)}
            disabled={isDeletingThis}
            style={{
              background: "none",
              border: "1px solid #FEE2E2",
              borderRadius: 7,
              color: "#EF4444",
              padding: "7px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              marginLeft: "auto",
            }}
          >
            {isDeletingThis ? "…" : "Delete"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 14px" }}>
        Define the tally categories for each focus area (e.g. Day, Evening, Night).
      </p>

      {focusAreas.map((focusArea) => {
        const areaCats = local.filter((c) => c.focusAreaId === focusArea.id);
        return (
          <div
            key={focusArea.id}
            style={{
              marginBottom: 20,
              border: "1px solid var(--color-border-light)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 16px",
                background: focusArea.colorBg || "var(--color-bg)",
                color: focusArea.colorText || "var(--color-text-primary)",
                fontWeight: 700,
                fontSize: 13,
                borderBottom: areaCats.length > 0 ? "1px solid var(--color-border-light)" : "none",
              }}
            >
              {focusArea.name}
            </div>
            {areaCats.length > 0 && (
              <div style={{ padding: "0 16px" }}>
                {areaCats.map(renderCategoryRow)}
              </div>
            )}
            <div style={{ padding: "8px 16px" }}>
              <button onClick={() => handleAdd(focusArea.id)} style={addBtnStyle}>
                + Add Category
              </button>
            </div>
          </div>
        );
      })}
      {confirmDeleteId !== null && (() => {
        const cat = local.find(c => c.id === confirmDeleteId);
        if (!cat) return null;
        return (
          <ConfirmDialog
            title="Delete Category?"
            message={<>Delete <strong>{cat.name || "this category"}</strong>? Shift codes in this category will become uncategorized.</>}
            confirmLabel="Delete"
            variant="danger"
            isLoading={deleting === confirmDeleteId}
            onConfirm={() => handleDelete(cat)}
            onCancel={() => setConfirmDeleteId(null)}
          />
        );
      })()}
    </div>
  );
}


// ── Admin permission metadata ──────────────────────────────────────────────────

const PERM_GROUPS: { label: string; keys: (keyof AdminPermissions)[] }[] = [
  { label: "Schedule", keys: ["canEditShifts", "canPublishSchedule", "canApplyRegularSchedule"] },
  { label: "Notes", keys: ["canEditNotes"] },
  { label: "Recurring", keys: ["canManageRegularShifts", "canManageShiftSeries"] },
  { label: "Staff", keys: ["canManageEmployees"] },
  { label: "Configuration", keys: ["canManageFocusAreas", "canManageShiftCodes", "canManageIndicatorTypes", "canManageCompanySettings"] },
];

const PERM_LABELS: Record<keyof AdminPermissions, string> = {
  canViewSchedule: "View Schedule",
  canEditShifts: "Edit Shifts",
  canPublishSchedule: "Publish Schedule",
  canApplyRegularSchedule: "Apply Regular Schedule",
  canEditNotes: "Edit Notes / Indicators",
  canManageRegularShifts: "Manage Regular Shifts",
  canManageShiftSeries: "Manage Shift Series",
  canViewStaff: "View Staff",
  canManageEmployees: "Manage Employees",
  canManageFocusAreas: "Manage Focus Areas",
  canManageShiftCodes: "Manage Shift Codes",
  canManageIndicatorTypes: "Manage Indicator Types",
  canManageCompanySettings: "Manage Company Settings",
};

/** Permissions that are always on and cannot be toggled off. */
const ALWAYS_ON = new Set<keyof AdminPermissions>(["canViewSchedule", "canViewStaff"]);

function emptyAdminPerms(): AdminPermissions {
  return {
    canViewSchedule: true,
    canEditShifts: false,
    canPublishSchedule: false,
    canApplyRegularSchedule: false,
    canEditNotes: false,
    canManageRegularShifts: false,
    canManageShiftSeries: false,
    canViewStaff: true,
    canManageEmployees: false,
    canManageFocusAreas: false,
    canManageShiftCodes: false,
    canManageIndicatorTypes: false,
    canManageCompanySettings: false,
  };
}

// ── User Management Settings ──────────────────────────────────────────────────
function UserManagementSettings({ companyId, isSuperAdmin }: { companyId: string; isSuperAdmin: boolean }) {
  const myRole = isSuperAdmin ? "super_admin" : "user";
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [editingPerms, setEditingPerms] = useState<Record<string, AdminPermissions>>({});
  const [savingPerms, setSavingPerms] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    db.fetchCompanyUsers(companyId)
      .then((u) => { if (mounted) { setUsers(u); setLoading(false); } })
      .catch((e) => { if (mounted) { setError(e.message); setLoading(false); } });
    return () => { mounted = false; };
  }, [companyId]);

  const handleRoleChange = async (userId: string, newRole: "admin" | "user") => {
    setSaving(userId);
    setError(null);
    try {
      await db.changeCompanyUserRole(userId, newRole);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, companyRole: newRole } : u));
      if (newRole === "user") setExpandedUserId((prev) => prev === userId ? null : prev);
      toast.success("Role updated");
    } catch (e) {
      toast.error("Failed to change role");
      setError(e instanceof Error ? e.message : "Failed to change role");
    } finally {
      setSaving(null);
    }
  };

  const openPermissions = (user: CompanyUser) => {
    if (expandedUserId === user.id) { setExpandedUserId(null); return; }
    setExpandedUserId(user.id);
    if (!editingPerms[user.id]) {
      setEditingPerms((prev) => ({
        ...prev,
        [user.id]: { ...emptyAdminPerms(), ...(user.adminPermissions ?? {}) },
      }));
    }
  };

  const handlePermToggle = (userId: string, key: keyof AdminPermissions, value: boolean) => {
    setEditingPerms((prev) => ({ ...prev, [userId]: { ...prev[userId], [key]: value } }));
  };

  const handlePermsSave = async (userId: string) => {
    setSavingPerms(userId);
    setError(null);
    try {
      await db.updateAdminPermissions(userId, editingPerms[userId], companyId);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, adminPermissions: editingPerms[userId] } : u));
      toast.success("Permissions saved");
    } catch (e) {
      toast.error("Failed to save permissions");
      setError(e instanceof Error ? e.message : "Failed to save permissions");
    } finally {
      setSavingPerms(null);
    }
  };

  const handlePermsReset = async (userId: string) => {
    setSavingPerms(userId);
    setError(null);
    try {
      await db.updateAdminPermissions(userId, null, companyId);
      const cleared = emptyAdminPerms();
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, adminPermissions: null } : u));
      setEditingPerms((prev) => ({ ...prev, [userId]: cleared }));
      toast.success("Permissions reset");
    } catch (e) {
      toast.error("Failed to reset permissions");
      setError(e instanceof Error ? e.message : "Failed to reset permissions");
    } finally {
      setSavingPerms(null);
    }
  };

  const ROLE_LABELS: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Admin",
    user: "User",
  };

  const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
    super_admin: { bg: "#F0FDF4", text: "#15803D" },
    admin: { bg: "#EFF6FF", text: "#2563EB" },
    user: { bg: "var(--color-border-light)", text: "var(--color-text-muted)" },
  };

  if (loading) {
    return <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Loading users…</p>;
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 16px" }}>
        Manage user roles and admin permissions. Super Admins can promote users to Admin and configure their access.
      </p>
      {error && (
        <div style={{ marginBottom: 12, padding: 10, background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 8, color: "#B91C1C", fontSize: 13 }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {users.map((user) => {
          const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "—";
          const roleColor = ROLE_COLORS[user.companyRole] ?? ROLE_COLORS.user;
          const isProtected = user.companyRole === "super_admin" || user.platformRole === "gridmaster";
          const isExpanded = expandedUserId === user.id;
          const savedPerms = { ...emptyAdminPerms(), ...(user.adminPermissions ?? {}) };
          const perms = editingPerms[user.id] ?? savedPerms;
          const allPermKeys = PERM_GROUPS.flatMap((g) => g.keys);
          const hasUnsavedChanges = isExpanded && editingPerms[user.id] != null &&
            allPermKeys.some((key) => editingPerms[user.id][key] !== savedPerms[key]);

          return (
            <div key={user.id} style={{ borderBottom: "1px solid var(--color-border-light)" }}>
              {/* User row */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0" }}>
                <div style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: "var(--color-accent-gradient)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0,
                }}>
                  {(displayName !== "—" ? displayName : "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                    {displayName}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                    {user.email ?? "—"} · Joined {new Date(user.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 20,
                  background: roleColor.bg, color: roleColor.text, whiteSpace: "nowrap",
                }}>
                  {ROLE_LABELS[user.companyRole] ?? user.companyRole}
                </span>
                {!isProtected && myRole === "super_admin" && (
                  <select
                    value={user.companyRole}
                    disabled={saving === user.id}
                    onChange={(e) => handleRoleChange(user.id, e.target.value as "admin" | "user")}
                    style={{
                      fontSize: 12, padding: "4px 8px",
                      border: "1.5px solid var(--color-border)", borderRadius: 7,
                      background: "#fff", cursor: "pointer",
                    }}
                  >
                    <option value="admin">Promote to Admin</option>
                    <option value="user">Reset to User</option>
                  </select>
                )}
                {user.companyRole === "admin" && myRole === "super_admin" && (
                  <button
                    onClick={() => openPermissions(user)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      fontSize: 12, padding: "4px 10px",
                      border: "1.5px solid var(--color-border)", borderRadius: 7,
                      background: isExpanded ? "var(--color-surface-overlay)" : "#fff",
                      color: "var(--color-text-secondary)",
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
                    </svg>
                    Permissions
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 150ms" }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                )}
                {saving === user.id && (
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Saving…</span>
                )}
              </div>

              {/* Permissions panel */}
              {isExpanded && user.companyRole === "admin" && (
                <div style={{
                  marginBottom: 10, padding: "16px 20px",
                  background: "var(--color-surface-subtle, #F9FAFB)",
                  border: "1px solid var(--color-border-light)",
                  borderTop: "none", borderRadius: "0 0 10px 10px",
                }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "16px 28px" }}>
                    {PERM_GROUPS.map((group) => (
                      <div key={group.label}>
                        <div style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                          color: "var(--color-text-subtle)", textTransform: "uppercase", marginBottom: 8,
                        }}>
                          {group.label}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          {group.keys.map((key) => {
                            const alwaysOn = ALWAYS_ON.has(key);
                            return (
                              <label key={key} style={{
                                display: "flex", alignItems: "center", gap: 8,
                                cursor: alwaysOn ? "default" : "pointer",
                                opacity: alwaysOn ? 0.45 : 1,
                              }}>
                                <input
                                  type="checkbox"
                                  checked={perms[key] ?? false}
                                  disabled={alwaysOn || savingPerms === user.id}
                                  onChange={(e) => handlePermToggle(user.id, key, e.target.checked)}
                                  style={{ width: 14, height: 14, accentColor: "#2563EB", cursor: alwaysOn ? "default" : "pointer", flexShrink: 0 }}
                                />
                                <span style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.3 }}>
                                  {PERM_LABELS[key]}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--color-border-light)" }}>
                    <button
                      onClick={() => handlePermsSave(user.id)}
                      disabled={savingPerms === user.id}
                      style={{
                        fontSize: 12, fontWeight: 600, padding: "6px 14px",
                        background: "#2563EB", color: "#fff", border: "none", borderRadius: 7,
                        cursor: savingPerms === user.id ? "not-allowed" : "pointer",
                        fontFamily: "inherit", opacity: savingPerms === user.id ? 0.6 : 1,
                      }}
                    >
                      {savingPerms === user.id ? "Saving…" : "Save Permissions"}
                    </button>
                    <button
                      onClick={() => handlePermsReset(user.id)}
                      disabled={savingPerms === user.id}
                      style={{
                        fontSize: 12, fontWeight: 500, padding: "6px 14px",
                        background: "transparent", color: "var(--color-text-muted)",
                        border: "1.5px solid var(--color-border)", borderRadius: 7,
                        cursor: savingPerms === user.id ? "not-allowed" : "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Reset All
                    </button>
                    {hasUnsavedChanges && (
                      <span style={{ fontSize: 11, color: "#D97706" }}>Unsaved changes</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sidebar nav link ──────────────────────────────────────────────────────────
function SidebarLink({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        padding: "7px 12px",
        background: active
          ? "var(--color-surface-overlay)"
          : hovered
          ? "var(--color-border-light)"
          : "transparent",
        border: "none",
        borderRadius: 7,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? "var(--color-text-primary)" : hovered ? "var(--color-text-primary)" : "var(--color-text-secondary)",
        textAlign: "left",
        fontFamily: "inherit",
        transition: "background 120ms ease, color 120ms ease",
        position: "relative",
      }}
    >
      {active && (
        <span style={{
          position: "absolute",
          left: 0,
          top: "20%",
          height: "60%",
          width: 3,
          borderRadius: 2,
          background: "var(--color-accent-gradient)",
        }} />
      )}
      <span style={{
        color: active ? "var(--color-text-secondary)" : "var(--color-text-muted)",
        flexShrink: 0,
      }}>
        {icon}
      </span>
      {label}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SettingsPage({
  company,
  focusAreas,
  shiftCodes,
  shiftCategories,
  indicatorTypes,
  certifications,
  companyRoles,
  onCompanySave,
  onFocusAreasChange,
  onShiftCodesChange,
  onShiftCategoriesChange,
  onIndicatorTypesChange,
  onCertificationsChange,
  onCompanyRolesChange,
  canManageCompany,
}: SettingsPageProps) {
  const { isGridmaster, isSuperAdmin } = usePermissions();
  const [activeSection, setActiveSection] = useState<string>(
    canManageCompany ? "company" : "impersonation"
  );

  const focusAreaLabel = company.focusAreaLabel || "Focus Areas";
  const certificationLabel = company.certificationLabel || "Certifications";
  const roleLabel = company.roleLabel || "Roles";

  const iconBuilding = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
  const iconCalendar = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  const iconDesignations = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>;
  const iconUsers = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  const iconImpersonate = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;

  const iconIndicator = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/></svg>;
  const iconTag = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;

  const companyLinks = canManageCompany ? [
    { id: "company", label: "Company", icon: iconBuilding },
    { id: "shift-categories", label: "Shift Categories", icon: iconTag },
    { id: "shift-codes", label: "Shift Codes", icon: iconCalendar },
    { id: "indicators", label: "Indicators", icon: iconIndicator },
    { id: "staff-config", label: "Designations", icon: iconDesignations },
    ...(isSuperAdmin ? [{ id: "users", label: "User Management", icon: iconUsers }] : []),
  ] : [];

  const gridmasterLinks = isGridmaster ? [
    { id: "impersonation", label: "Impersonation", icon: iconImpersonate },
  ] : [];

  const allLinks = [...companyLinks, ...gridmasterLinks];

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", overflow: "hidden" }}>

      {/* Sidebar */}
      <aside style={{
        width: 220,
        flexShrink: 0,
        height: "100%",
        borderRight: "1px solid var(--color-border)",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        padding: "32px 12px",
        gap: 2,
        overflowY: "auto",
      }}>
        {allLinks.map((link) => (
          <SidebarLink
            key={link.id}
            label={link.label}
            icon={link.icon}
            active={activeSection === link.id}
            onClick={() => setActiveSection(link.id)}
          />
        ))}
      </aside>

      {/* Content */}
      <div style={{ flex: 1, height: "100%", overflowY: "auto", padding: "32px 40px" }}>

        {activeSection === "company" && canManageCompany && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Section title="Company Details">
              <CompanySettings company={company} onSave={onCompanySave} />
            </Section>
            <Section title={focusAreaLabel}>
              <FocusAreasSettings
                focusAreas={focusAreas}
                companyId={company.id}
                label={focusAreaLabel.replace(/s$/, "")}
                onChange={onFocusAreasChange}
              />
            </Section>
          </div>
        )}

        {activeSection === "shift-categories" && canManageCompany && (
          <Section title="Shift Categories">
            <ShiftCategoriesSettings
              shiftCategories={shiftCategories}
              focusAreas={focusAreas}
              companyId={company.id}
              onChange={onShiftCategoriesChange}
            />
          </Section>
        )}

        {activeSection === "shift-codes" && canManageCompany && (
          <Section title="Shift Codes & Off Days">
            <ShiftCodesSettings
              shiftCodes={shiftCodes}
              focusAreas={focusAreas}
              shiftCategories={shiftCategories}
              companyId={company.id}
              certifications={certifications}
              certificationLabel={certificationLabel}
              focusAreaLabel={focusAreaLabel}
              onChange={onShiftCodesChange}
            />
          </Section>
        )}

        {activeSection === "indicators" && canManageCompany && (
          <Section title="Indicators">
            <IndicatorTypesSettings
              indicatorTypes={indicatorTypes}
              companyId={company.id}
              onChange={onIndicatorTypesChange}
            />
          </Section>
        )}

        {activeSection === "staff-config" && canManageCompany && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Section title={certificationLabel}>
              <StringListSettings
                label={`Define the ${certificationLabel.toLowerCase()} available when adding or editing staff. These also determine the order in which they appear in dropdowns.`}
                items={certifications}
                placeholder="e.g. RN"
                onSave={async (updated) => {
                  try {
                    const saved = await db.saveCertifications(company.id, updated, certifications);
                    onCertificationsChange(saved);
                    toast.success("Certifications saved");
                  } catch (err) {
                    toast.error("Failed to save certifications");
                    throw err;
                  }
                }}
              />
            </Section>
            <Section title={roleLabel}>
              <StringListSettings
                label={`Define the ${roleLabel.toLowerCase()} available when adding or editing staff. These also determine the order in which they appear in dropdowns.`}
                items={companyRoles}
                placeholder="e.g. Charge Nurse"
                onSave={async (updated) => {
                  try {
                    const saved = await db.saveCompanyRoles(company.id, updated, companyRoles);
                    onCompanyRolesChange(saved);
                    toast.success("Roles saved");
                  } catch (err) {
                    toast.error("Failed to save roles");
                    throw err;
                  }
                }}
              />
            </Section>
          </div>
        )}

        {activeSection === "users" && isSuperAdmin && (
          <Section title="User Management">
            <UserManagementSettings companyId={company.id} isSuperAdmin={isSuperAdmin} />
          </Section>
        )}

        {activeSection === "impersonation" && isGridmaster && (
          <Section title="Gridmaster Impersonation">
            <ImpersonationPanel />
          </Section>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Organization, FocusArea, ShiftCategory, ShiftCode, IndicatorType, OrganizationUser, OrganizationRole, AdminPermissions, NamedItem, CoverageRequirement, AbsenceType } from "@/types";
import * as db from "@/lib/db";
import { parseTo12h, to24h, fmt12h, calcTimeDuration, calcNetDuration, resolveEffectiveBreak } from "@/lib/utils";
import { PREDEFINED_COLORS, getPresetByBg, TRANSPARENT_BORDER, PredefinedColor, borderColor } from "@/lib/colors";
import { sectionStyle, sectionHeaderStyle, labelStyle as sharedLabelStyle } from "@/lib/styles";
import ImpersonationPanel from "@/components/ImpersonationPanel";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import CustomSelect from "@/components/CustomSelect";
import { useAuth } from "@/components/AuthProvider";
import { useMediaQuery, MOBILE, TABLET } from "@/hooks";
import { useSetMobileSubNav, SubNavItem } from "@/components/MobileSubNavContext";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

function PresetColorPicker({ valueBg, onChange, disabled }: { valueBg: string; onChange: (c: PredefinedColor) => void; disabled?: boolean }) {
  const active = getPresetByBg(valueBg);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {PREDEFINED_COLORS.map(c => (
        <button
          key={c.id}
          type="button"
          onClick={() => !disabled && onChange(c)}
          disabled={disabled}
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: c.bg,
            border: active.id === c.id ? `2px solid ${c.text}` : "1px solid var(--color-border)",
            cursor: disabled ? "not-allowed" : "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: disabled ? 0.5 : 1,
          }}
          title={c.name}
        >
          {active.id === c.id && <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.text }} />}
        </button>
      ))}
    </div>
  );
}

interface SettingsPageProps {
  organization: Organization;
  focusAreas: FocusArea[];
  shiftCodes: ShiftCode[];
  shiftCategories: ShiftCategory[];
  indicatorTypes: IndicatorType[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  onOrganizationSave: (organization: Organization) => void;
  onFocusAreasChange: (focusAreas: FocusArea[]) => void;
  onShiftCodesChange: (codes: ShiftCode[]) => void;
  onShiftCategoriesChange: (categories: ShiftCategory[]) => void;
  onIndicatorTypesChange: (types: IndicatorType[]) => void;
  onCertificationsChange: (items: NamedItem[]) => void;
  onOrgRolesChange: (items: NamedItem[]) => void;
  canManageOrg: boolean;
  isSuperAdmin: boolean;
  isGridmaster: boolean;
  canManageOrgLabels: boolean;
  canManageFocusAreas: boolean;
  canManageShiftCodes: boolean;
  canManageIndicatorTypes: boolean;
  canManageOrgSettings: boolean;
  coverageRequirements: CoverageRequirement[];
  onCoverageRequirementsChange: (reqs: CoverageRequirement[]) => void;
  canManageCoverageRequirements: boolean;
  absenceTypes: AbsenceType[];
  onAbsenceTypesChange: (types: AbsenceType[]) => void;
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({
  title,
  children,
  maxWidth = 860,
  noPadding = false,
}: {
  title: string;
  children: React.ReactNode;
  maxWidth?: number;
  noPadding?: boolean;
}) {
  return (
    <div
      style={{
        ...sectionStyle,
        width: "100%",
        maxWidth,
        flexShrink: 0,
      }}
    >
      <div
        style={sectionHeaderStyle}
      >
        {title}
      </div>
      {noPadding ? children : <div style={{ padding: "20px" }}>{children}</div>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  fontSize: "var(--dg-fs-label)",
  outline: "none",
  background: "var(--color-surface)",
};

const labelStyle = sharedLabelStyle;

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
function TimeInput12h({ value, onChange, disabled }: { value: string | null | undefined; onChange: (v: string | null) => void; disabled?: boolean }) {
  const { hour, minute, period } = parseTo12h(value);

  const hourOptions = [
    { value: "", label: "--" },
    ...[1,2,3,4,5,6,7,8,9,10,11,12].map((h) => ({ value: String(h), label: String(h) })),
  ];
  const minuteOptions = ["00","05","10","15","20","25","30","35","40","45","50","55"].map((m) => ({ value: m, label: m }));
  const periodOptions = [{ value: "AM" as const, label: "AM" }, { value: "PM" as const, label: "PM" }];

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <CustomSelect
        value={hour}
        options={hourOptions}
        onChange={(val) => onChange(to24h(val, minute, period))}
        disabled={disabled}
        fontSize={13}
        style={{ width: 68 }}
      />
      <span style={{ fontWeight: 700, color: "var(--color-text-muted)" }}>:</span>
      <CustomSelect
        value={minute}
        options={minuteOptions}
        onChange={(val) => onChange(to24h(hour, val, period))}
        disabled={disabled}
        fontSize={13}
        style={{ width: 68 }}
      />
      <CustomSelect
        value={period}
        options={periodOptions}
        onChange={(val) => onChange(to24h(hour, minute, val as "AM" | "PM"))}
        disabled={disabled}
        fontSize={13}
        style={{ width: 72 }}
      />
    </div>
  );
}

// ── Organization Details (super_admin only) ──────────────────────────────────
function OrganizationDetailsSettings({
  organization,
  onSave,
  canManageOrgSettings,
}: {
  organization: Organization;
  onSave: (o: Organization) => void;
  canManageOrgSettings: boolean;
}) {
  const isMobile = useMediaQuery(MOBILE);
  const [form, setForm] = useState({
    name: organization.name,
    address: organization.address,
    phone: organization.phone,
    employeeCount: organization.employeeCount?.toString() ?? "",
    timezone: organization.timezone ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isModified =
    form.name !== organization.name ||
    form.address !== organization.address ||
    form.phone !== organization.phone ||
    (form.employeeCount || "") !== (organization.employeeCount?.toString() ?? "") ||
    form.timezone !== (organization.timezone ?? "");

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    if (!isModified) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isModified]);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const updated: Organization = {
        ...organization,
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        employeeCount: form.employeeCount ? Math.max(0, Math.round(parseInt(form.employeeCount))) || null : null,
        timezone: form.timezone || null,
      };
      await db.updateOrganization(updated);
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
  }, [form, organization, onSave]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <div>
          <label style={labelStyle}>ORGANIZATION NAME</label>
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            maxLength={60}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>PHONE</label>
          <input
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            placeholder="(415) 555-0100"
            maxLength={20}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>ADDRESS</label>
          <input
            value={form.address}
            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            placeholder="123 Main St, City, State ZIP"
            maxLength={120}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>NUMBER OF EMPLOYEES</label>
          <input
            type="number"
            min="0"
            step="1"
            value={form.employeeCount}
            onChange={(e) => {
              const v = e.target.value;
              // Allow empty, otherwise clamp to non-negative integer
              if (v === "") setForm((p) => ({ ...p, employeeCount: "" }));
              else {
                const n = Math.max(0, Math.round(Number(v)));
                setForm((p) => ({ ...p, employeeCount: isNaN(n) ? "" : String(n) }));
              }
            }}
            placeholder="e.g. 28"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Timezone */}
      <div>
        <label style={labelStyle}>TIME ZONE</label>
        <CustomSelect
          value={form.timezone}
          options={[
            { value: "", label: "— Select a time zone —" },
            ...TIMEZONES.map((tz) => ({ value: tz.value, label: tz.label })),
          ]}
          onChange={(v) => setForm((p) => ({ ...p, timezone: v }))}
          style={{ width: "100%", maxWidth: 340 }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={handleSave}
          disabled={!isModified || saving}
          style={{
            background: isModified ? "var(--color-brand)" : "var(--color-border)",
            border: "none",
            color: "var(--color-text-inverse)",
            borderRadius: 8,
            padding: "9px 20px",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 700,
            cursor: isModified ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-brand)", fontWeight: 600 }}>
            Saved!
          </span>
        )}
      </div>
    </div>
  );
}

// ── Custom Labels (delegatable to admin) ─────────────────────────────────────
function OrganizationLabelsSettings({
  organization,
  onSave,
  canManageOrgLabels,
}: {
  organization: Organization;
  onSave: (o: Organization) => void;
  canManageOrgLabels: boolean;
}) {
  const isMobile = useMediaQuery(MOBILE);
  const [form, setForm] = useState({
    focusAreaLabel: organization.focusAreaLabel,
    certificationLabel: organization.certificationLabel,
    roleLabel: organization.roleLabel,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isModified =
    form.focusAreaLabel !== organization.focusAreaLabel ||
    form.certificationLabel !== organization.certificationLabel ||
    form.roleLabel !== organization.roleLabel;

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    if (!isModified) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isModified]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updated: Organization = {
        ...organization,
        focusAreaLabel: form.focusAreaLabel.trim() || "Focus Areas",
        certificationLabel: form.certificationLabel.trim() || "Certifications",
        roleLabel: form.roleLabel.trim() || "Roles",
      };
      await db.updateOrganization(updated);
      onSave(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success("Labels saved");
    } catch (err) {
      toast.error("Failed to save labels");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [form, organization, onSave]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", margin: 0 }}>
        Customize what your organization calls each feature. These labels appear throughout the app.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
        <div>
          <label style={labelStyle}>FOCUS AREAS LABEL</label>
          <input
            value={form.focusAreaLabel}
            onChange={(e) => setForm((p) => ({ ...p, focusAreaLabel: e.target.value }))}
            placeholder="Focus Areas"
            maxLength={30}
            style={inputStyle}
          />
          <p style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", margin: "4px 0 0" }}>
            e.g. Focus Areas, Departments, Units
          </p>
        </div>
        <div>
          <label style={labelStyle}>CERTIFICATIONS LABEL</label>
          <input
            value={form.certificationLabel}
            onChange={(e) => setForm((p) => ({ ...p, certificationLabel: e.target.value }))}
            placeholder="Certifications"
            maxLength={30}
            style={inputStyle}
          />
          <p style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", margin: "4px 0 0" }}>
            e.g. Certifications, Designations
          </p>
        </div>
        <div>
          <label style={labelStyle}>ROLES LABEL</label>
          <input
            value={form.roleLabel}
            onChange={(e) => setForm((p) => ({ ...p, roleLabel: e.target.value }))}
            placeholder="Roles"
            maxLength={30}
            style={inputStyle}
          />
          <p style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", margin: "4px 0 0" }}>
            e.g. Responsibilities, Positions
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={handleSave}
          disabled={!isModified || saving}
          style={{
            background: isModified ? "var(--color-brand)" : "var(--color-border)",
            border: "none",
            color: "var(--color-text-inverse)",
            borderRadius: 8,
            padding: "9px 20px",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 700,
            cursor: isModified ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-brand)", fontWeight: 600 }}>
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
  onDeleted,
  onFormChange,
  isDragging,
  isDropTarget,
  isReordering,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  canManageFocusAreas,
}: {
  focusArea: FocusArea & { isNew?: boolean };
  onDeleted: (id: number) => void;
  onFormChange: (id: number, patch: { name: string; colorBg: string; colorText: string; breakMinutes: number | null }) => void;
  canManageFocusAreas: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  isReordering: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const [form, setForm] = useState({
    name: focusArea.name,
    colorBg: focusArea.colorBg,
    colorText: focusArea.colorText,
    breakMinutes: focusArea.breakMinutes ?? null as number | null,
  });
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Propagate form edits to parent for batch save
  useEffect(() => {
    if (isReordering) {
      onFormChange(focusArea.id, form);
    }
  }, [form, isReordering, focusArea.id, onFormChange]);

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

  // Read-only display mode
  if (!isReordering) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "11px 12px",
          borderBottom: "1px solid var(--color-border-light)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 12px",
            borderRadius: 20,
            background: "var(--color-bg-secondary)",
            border: "1px solid var(--color-border-light)",
            color: "var(--color-text-secondary)",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: focusArea.colorBg, flexShrink: 0 }} />
          {focusArea.name || <span style={{ fontStyle: "italic", opacity: 0.6 }}>Unnamed</span>}
        </span>
        {focusArea.breakMinutes != null && focusArea.breakMinutes > 0 && (
          <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
            {focusArea.breakMinutes}m break
          </span>
        )}
      </div>
    );
  }

  // Edit / reorder mode — drag handle + inline editing
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={isReordering ? onDragOver : undefined}
      onDrop={isReordering ? onDrop : undefined}
      onDragEnd={isReordering ? onDragEnd : undefined}
      style={{
        padding: "12px 12px",
        borderTop: isDropTarget ? "2px solid var(--color-brand)" : undefined,
        borderBottom: "1px solid var(--color-border-light)",
        cursor: "grab",
        opacity: isDragging ? 0.5 : 1,
        userSelect: isReordering ? "none" : undefined,
        transition: "opacity 150ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        {/* Drag handle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-faint)", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="3" y="2" width="2" height="2" rx="1"/>
            <rect x="9" y="2" width="2" height="2" rx="1"/>
            <rect x="3" y="6" width="2" height="2" rx="1"/>
            <rect x="9" y="6" width="2" height="2" rx="1"/>
            <rect x="3" y="10" width="2" height="2" rx="1"/>
            <rect x="9" y="10" width="2" height="2" rx="1"/>
          </svg>
        </div>

        {/* Live preview badge */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 12px",
            borderRadius: 20,
            background: "var(--color-bg-secondary)",
            border: "1px solid var(--color-border-light)",
            color: "var(--color-text-secondary)",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: form.colorBg, flexShrink: 0 }} />
          {form.name || "Preview"}
        </span>

        <div style={{ flex: 1 }} />

        {/* Delete */}
        {!focusArea.isNew && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
            disabled={deleting}
            style={{
              background: "none",
              border: "1px solid var(--color-danger-border)",
              borderRadius: 8,
              color: "var(--color-danger)",
              padding: "5px 10px",
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {deleting ? "…" : "Delete"}
          </button>
        )}
      </div>

      {/* Name */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, paddingLeft: 24 }}>
        <label style={{ ...labelStyle, marginBottom: 0, minWidth: 48 }}>NAME</label>
        <input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          draggable={false}
          placeholder="Area name"
          maxLength={50}
          style={{ ...inputStyle, flex: 1 }}
        />
      </div>

      {/* Color */}
      <div style={{ paddingLeft: 24 }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <label style={labelStyle}>COLOR</label>
        <PresetColorPicker
          valueBg={form.colorBg}
          onChange={(c) => setForm((p) => ({ ...p, colorBg: c.bg, colorText: c.text }))}
        />
      </div>

      {/* Break Duration */}
      <div style={{ paddingLeft: 24, marginTop: 8 }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <label style={labelStyle}>BREAK (MIN)</label>
        <input
          type="number"
          min={0}
          max={480}
          value={form.breakMinutes ?? ""}
          onChange={(e) => {
            const val = e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10) || 0);
            setForm((p) => ({ ...p, breakMinutes: val }));
          }}
          placeholder="No break"
          draggable={false}
          style={{ ...inputStyle, width: 120 }}
        />
      </div>

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
  orgId,
  label,
  onChange,
  canManageFocusAreas,
}: {
  focusAreas: FocusArea[];
  orgId: string;
  label: string;
  onChange: (focusAreas: FocusArea[]) => void;
  canManageFocusAreas: boolean;
}) {
  const [localFocusAreas, setLocalFocusAreas] =
    useState<(FocusArea & { isNew?: boolean })[]>(focusAreas);
  const [isEditing, setIsEditing] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const nextTmpId = useRef(-1);

  const isDirty = JSON.stringify(localFocusAreas.map((fa) => ({ id: fa.id, sortOrder: fa.sortOrder, name: fa.name, colorBg: fa.colorBg, colorText: fa.colorText, breakMinutes: fa.breakMinutes ?? null })))
    !== JSON.stringify(focusAreas.map((fa) => ({ id: fa.id, sortOrder: fa.sortOrder, name: fa.name, colorBg: fa.colorBg, colorText: fa.colorText, breakMinutes: fa.breakMinutes ?? null })));

  // Live preview: show items in dragged order without committing
  const displayList = useMemo(() => {
    if (!isEditing || draggedIdx === null || dragOverIdx === null) return localFocusAreas;
    const list = [...localFocusAreas];
    const [item] = list.splice(draggedIdx, 1);
    list.splice(dragOverIdx, 0, item);
    return list;
  }, [isEditing, localFocusAreas, draggedIdx, dragOverIdx]);

  const handleEnterEdit = () => {
    setLocalFocusAreas([...focusAreas]);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setLocalFocusAreas([...focusAreas]);
    setIsEditing(false);
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const withOrder = localFocusAreas.map((fa, i) => ({ ...fa, sortOrder: i }));
      const saved = await Promise.all(
        withOrder.map((fa) =>
          db.upsertFocusArea({
            id: fa.isNew ? undefined : fa.id,
            orgId,
            name: fa.name,
            colorBg: fa.colorBg,
            colorText: fa.colorText,
            sortOrder: fa.sortOrder,
            breakMinutes: fa.breakMinutes ?? null,
          }),
        ),
      );
      setLocalFocusAreas(saved);
      onChange(saved);
      setIsEditing(false);
      toast.success("Focus areas saved");
    } catch {
      toast.error("Failed to save focus areas");
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () => {
    const tmp: FocusArea & { isNew: boolean } = {
      id: nextTmpId.current--,
      orgId: orgId,
      name: "",
      colorBg: PREDEFINED_COLORS[0].bg,
      colorText: PREDEFINED_COLORS[0].text,
      sortOrder: localFocusAreas.length,
      isNew: true,
    };
    setLocalFocusAreas((prev) => [...prev, tmp]);
    setIsEditing(true);
  };

  const handleFormChange = useCallback((id: number, patch: { name: string; colorBg: string; colorText: string; breakMinutes: number | null }) => {
    setLocalFocusAreas((prev) =>
      prev.map((fa) => (fa.id === id ? { ...fa, ...patch } : fa)),
    );
  }, []);

  const handleDeleted = (id: number) => {
    const updated = localFocusAreas.filter((w) => w.id !== id);
    setLocalFocusAreas(updated);
    // Only propagate to parent when not in edit mode (batch save handles it)
    if (!isEditing) onChange(updated);
  };

  // Drag handlers
  const handleDragStart = (idx: number) => {
    setDraggedIdx(idx);
    setDragOverIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(targetIdx);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIdx !== null && dragOverIdx !== null && draggedIdx !== dragOverIdx) {
      const list = [...localFocusAreas];
      const [item] = list.splice(draggedIdx, 1);
      list.splice(dragOverIdx, 0, item);
      setLocalFocusAreas(list);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  return (
    <div>
      {/* Controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "16px 16px 8px" }}>
        {!isEditing && (
          <button
            onClick={handleEnterEdit}
            className="dg-btn dg-btn-secondary"
            style={{ padding: "7px 12px", fontSize: "var(--dg-fs-caption)", display: "flex", alignItems: "center", gap: 5 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
          </button>
        )}
        {isEditing && isDirty && (
          <button onClick={handleSaveAll} disabled={saving} className="dg-btn dg-btn-primary" style={{ padding: "7px 14px" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        )}
        {isEditing && (
          <button onClick={handleCancel} className="dg-btn dg-btn-secondary" style={{ padding: "7px 14px" }}>
            Cancel
          </button>
        )}
      </div>

      {displayList.length === 0 ? (
        <div style={{
          border: "1px dashed var(--color-border)", borderRadius: 12,
          padding: "40px 20px", textAlign: "center", color: "var(--color-text-muted)",
          fontSize: "var(--dg-fs-label)", display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          margin: "0 16px 16px",
        }}>
          <span>No {label.toLowerCase()} defined yet</span>
          {canManageFocusAreas && (
            <button onClick={handleAdd} className="dg-btn dg-btn-secondary" style={{ padding: "7px 16px", fontSize: "var(--dg-fs-caption)" }}>
              + Add {label}
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ overflow: "hidden" }}>
            {displayList.map((focusArea, i) => {
              const realIdx = localFocusAreas.findIndex((fa) => fa.id === focusArea.id);
              return (
                <FocusAreaRow
                  key={focusArea.id}
                  focusArea={focusArea}
                  onDeleted={handleDeleted}
                  onFormChange={handleFormChange}
                  isReordering={isEditing}
                  isDragging={isEditing && draggedIdx !== null && localFocusAreas[draggedIdx]?.id === focusArea.id}
                  isDropTarget={isEditing && dragOverIdx === i && draggedIdx !== null && draggedIdx !== i}
                  onDragStart={() => handleDragStart(realIdx)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  canManageFocusAreas={canManageFocusAreas}
                />
              );
            })}
          </div>
          <div style={{ padding: "8px 16px 16px" }}>
            <button
              onClick={handleAdd}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-text-muted)",
                padding: "6px 0",
                fontSize: "var(--dg-fs-label)",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              + Add {label}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Shift Code row ────────────────────────────────────────────────────────────
function ShiftCodeRow({
  st,
  focusAreas,
  shiftCategories,
  orgId,
  certifications,
  certificationLabel,
  focusAreaLabel = "Focus Area",
  hideFocusAreaSelect,
  onSaved,
  onDeleted,
  canManageShiftCodes,
}: {
  st: ShiftCode & { isNew?: boolean };
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  orgId: string;
  certifications: NamedItem[];
  certificationLabel: string;
  focusAreaLabel?: string;
  hideFocusAreaSelect?: boolean;
  onSaved: (s: ShiftCode, prevId: number) => void;
  onDeleted: (id: number) => void;
  canManageShiftCodes: boolean;
}) {
  const isMobile = useMediaQuery(MOBILE);
  const [form, setForm] = useState({
    label: st.label,
    name: st.name,
    color: st.color === "transparent" ? PREDEFINED_COLORS[0].bg : st.color,
    border: st.border === "transparent" ? TRANSPARENT_BORDER : st.border,
    text: st.text === "transparent" ? PREDEFINED_COLORS[0].text : st.text,
    categoryId: st.categoryId ?? null as number | null,
    focusAreaId: st.focusAreaId ?? null as number | null,
    requiredCertificationIds: st.requiredCertificationIds ?? [],
    defaultStartTime: st.defaultStartTime ?? null as string | null,
    defaultEndTime: st.defaultEndTime ?? null as string | null,
    defaultDurationHours: st.defaultDurationHours ?? null as number | null,
    defaultDurationMinutes: st.defaultDurationMinutes ?? null as number | null,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(!!st.isNew);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Re-sync form from prop when the parent data changes (e.g. fresh fetch
  // after cert deletion trigger cleans up IDs).
  const certIdsKey = JSON.stringify(st.requiredCertificationIds ?? []);
  const prevStIdRef = useRef(st.id);
  const prevCertIdsKeyRef = useRef(certIdsKey);
  useEffect(() => {
    if (st.id === prevStIdRef.current && certIdsKey === prevCertIdsKeyRef.current) return;
    prevStIdRef.current = st.id;
    prevCertIdsKeyRef.current = certIdsKey;
    setForm({
      label: st.label,
      name: st.name,
      color: st.color === "transparent" ? PREDEFINED_COLORS[0].bg : st.color,
      border: st.border === "transparent" ? TRANSPARENT_BORDER : st.border,
      text: st.text === "transparent" ? PREDEFINED_COLORS[0].text : st.text,
      categoryId: st.categoryId ?? null,
      focusAreaId: st.focusAreaId ?? null,
      requiredCertificationIds: st.requiredCertificationIds ?? [],
      defaultStartTime: st.defaultStartTime ?? null,
      defaultEndTime: st.defaultEndTime ?? null,
      defaultDurationHours: st.defaultDurationHours ?? null,
      defaultDurationMinutes: st.defaultDurationMinutes ?? null,
    });
  }, [st.id, st.label, st.name, st.color, st.border, st.text, st.categoryId, st.focusAreaId, certIdsKey, st.defaultStartTime, st.defaultEndTime, st.defaultDurationHours, st.defaultDurationMinutes]);

  const isDirty = st.isNew ||
    form.label !== st.label ||
    form.name !== st.name ||
    form.color !== (st.color === "transparent" ? PREDEFINED_COLORS[0].bg : st.color) ||
    form.border !== (st.border === "transparent" ? TRANSPARENT_BORDER : st.border) ||
    form.text !== (st.text === "transparent" ? PREDEFINED_COLORS[0].text : st.text) ||
    form.categoryId !== (st.categoryId ?? null) ||
    form.focusAreaId !== (st.focusAreaId ?? null) ||
    JSON.stringify(form.requiredCertificationIds) !== JSON.stringify(st.requiredCertificationIds ?? []) ||
    form.defaultStartTime !== (st.defaultStartTime ?? null) ||
    form.defaultEndTime !== (st.defaultEndTime ?? null) ||
    form.defaultDurationHours !== (st.defaultDurationHours ?? null) ||
    form.defaultDurationMinutes !== (st.defaultDurationMinutes ?? null);

  const canSave = isDirty && !!form.label.trim() && !!form.name.trim();

  const handleSave = useCallback(async () => {
    if (!form.label.trim() || !form.name.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await db.upsertShiftCode({
        id: st.isNew ? undefined : st.id,
        orgId: orgId,
        label: form.label.trim(),
        name: form.name.trim(),
        color: form.color,
        border: form.border,
        text: form.text,
        categoryId: form.categoryId,
        isGeneral: form.focusAreaId == null,
        focusAreaId: form.focusAreaId,
        sortOrder: st.sortOrder,
        requiredCertificationIds: form.requiredCertificationIds,
        defaultStartTime: form.defaultStartTime,
        defaultEndTime: form.defaultEndTime,
        defaultDurationHours: form.defaultDurationHours,
        defaultDurationMinutes: form.defaultDurationMinutes,
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
  }, [form, st, orgId, onSaved]);

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
            border: `1px solid ${borderColor(form.text)}`,
            color: form.text,
            borderRadius: 8,
            fontSize: "var(--dg-fs-caption)",
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          {form.label || "…"}
        </span>
        <span
          style={{
            fontSize: "var(--dg-fs-label)",
            color: "var(--color-text-secondary)",
            flex: 1,
          }}
        >
          {form.name || "—"}
        </span>
        {!hideFocusAreaSelect && form.focusAreaId != null && (
          <span style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)" }}>
            {focusAreas.find((w) => w.id === form.focusAreaId)?.name}
          </span>
        )}
        {form.categoryId !== null && (
          <span style={{
            fontSize: "var(--dg-fs-footnote)",
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
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--color-text-faint)",
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 150ms ease",
          }}
        >
          ▾
        </span>
      </div>

      {/* Expanded edit form */}
      {expanded && (
        <div
          style={{
            background: "var(--color-bg)",
            borderTop: "1px solid var(--color-border-light)",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "120px 1fr",
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
                maxLength={6}
                style={inputStyle}
                disabled={!canManageShiftCodes}
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
                maxLength={50}
                style={inputStyle}
                disabled={!canManageShiftCodes}
              />
            </div>
          </div>

          {/* Focus area — single select (hidden when section pre-assigns it) */}
          {!hideFocusAreaSelect && (
            <div>
              <label style={labelStyle}>
                {focusAreaLabel.toUpperCase()} (leave blank for global)
              </label>
              <CustomSelect
                value={form.focusAreaId != null ? String(form.focusAreaId) : ""}
                options={[
                  { value: "", label: `— Global (no ${focusAreaLabel.toLowerCase()}) —` },
                  ...focusAreas.map((w) => ({ value: String(w.id), label: w.name })),
                ]}
                onChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    focusAreaId: v ? Number(v) : null,
                  }))
                }
                style={{ width: "100%", marginTop: 4 }}
                disabled={!canManageShiftCodes}
              />
            </div>
          )}

          {/* Shift Category */}
          <div>
              <label style={labelStyle}>SHIFT CATEGORY</label>
              <CustomSelect
                value={form.categoryId != null ? String(form.categoryId) : ""}
                options={[
                  { value: "", label: "— Generic (No Category) —" },
                  ...shiftCategories
                    .filter(c => form.focusAreaId == null || c.focusAreaId == null || c.focusAreaId === form.focusAreaId)
                    .map((c) => ({
                      value: String(c.id),
                      label: `${c.name} ${c.focusAreaId ? `(${focusAreas.find(w => w.id === c.focusAreaId)?.name})` : "(Global)"}`
                    })),
                ]}
                onChange={(v) => setForm((p) => ({ ...p, categoryId: v ? Number(v) : null }))}
                style={{ width: "100%", marginTop: 4 }}
                disabled={!canManageShiftCodes}
              />
            </div>

          {/* Default Times vs Duration — mutually exclusive, duration only for general codes */}
          {(() => {
            const hasTimes = form.defaultStartTime != null || form.defaultEndTime != null;
            const hasDuration = form.defaultDurationHours != null || form.defaultDurationMinutes != null;
            const isGeneral = form.focusAreaId == null;
            const showTimes = !isGeneral || !hasDuration;
            const showDuration = isGeneral && !hasTimes;

            return (
              <>
                {showTimes ? (
                  <div>
                    <label style={labelStyle}>CUSTOM TIMES</label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                      <TimeInput12h
                        value={form.defaultStartTime}
                        onChange={(v) => setForm((p) => ({ ...p, defaultStartTime: v }))}
                        disabled={!canManageShiftCodes}
                      />
                      <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)" }}>to</span>
                      <TimeInput12h
                        value={form.defaultEndTime}
                        onChange={(v) => setForm((p) => ({ ...p, defaultEndTime: v }))}
                        disabled={!canManageShiftCodes}
                      />
                    </div>
                    {isGeneral && !hasTimes && (
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, defaultStartTime: null, defaultEndTime: null, defaultDurationHours: 0, defaultDurationMinutes: 0 }))}
                        style={{ marginTop: 6, background: "none", border: "none", color: "var(--color-brand)", fontSize: "var(--dg-fs-caption)", cursor: "pointer", padding: 0 }}
                        disabled={!canManageShiftCodes}
                      >
                        Set duration instead
                      </button>
                    )}
                    {isGeneral && hasTimes && (
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, defaultStartTime: null, defaultEndTime: null, defaultDurationHours: 0, defaultDurationMinutes: 0 }))}
                        style={{ marginTop: 6, background: "none", border: "none", color: "var(--color-brand)", fontSize: "var(--dg-fs-caption)", cursor: "pointer", padding: 0 }}
                        disabled={!canManageShiftCodes}
                      >
                        Use duration instead
                      </button>
                    )}
                  </div>
                ) : null}

                {showDuration && hasDuration ? (
                  <div>
                    <label style={labelStyle}>DEFAULT DURATION</label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={form.defaultDurationHours ?? ""}
                        onChange={(e) => {
                          const v = e.target.value === "" ? null : Math.max(0, Math.min(23, Number(e.target.value)));
                          setForm((p) => ({ ...p, defaultDurationHours: v }));
                        }}
                        placeholder="0"
                        style={{ ...inputStyle, width: 64, textAlign: "center" }}
                        disabled={!canManageShiftCodes}
                      />
                      <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)" }}>h</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={form.defaultDurationMinutes ?? ""}
                        onChange={(e) => {
                          const v = e.target.value === "" ? null : Math.max(0, Math.min(59, Number(e.target.value)));
                          setForm((p) => ({ ...p, defaultDurationMinutes: v }));
                        }}
                        placeholder="0"
                        style={{ ...inputStyle, width: 64, textAlign: "center" }}
                        disabled={!canManageShiftCodes}
                      />
                      <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)" }}>m</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, defaultDurationHours: null, defaultDurationMinutes: null }))}
                      style={{ marginTop: 6, background: "none", border: "none", color: "var(--color-brand)", fontSize: "var(--dg-fs-caption)", cursor: "pointer", padding: 0 }}
                      disabled={!canManageShiftCodes}
                    >
                      Set actual times instead
                    </button>
                  </div>
                ) : null}
              </>
            );
          })()}

          {/* Colors */}
          <div>
            <label style={labelStyle}>COLOR PRESET</label>
            <PresetColorPicker
              valueBg={form.color}
              onChange={c => setForm(p => ({ ...p, color: c.bg, text: c.text, border: TRANSPARENT_BORDER }))}
              disabled={!canManageShiftCodes}
            />
          </div>

          {/* Required Certifications — only for recurring shifts */}
          {certifications.length > 0 && (
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
                        fontSize: "var(--dg-fs-label)",
                        cursor: canManageShiftCodes ? "pointer" : "default",
                        padding: "4px 10px",
                        borderRadius: 20,
                        border: `1.5px solid ${
                          checked ? "var(--color-brand)" : "var(--color-border)"
                        }`,
                        background: checked ? "var(--color-info-bg)" : "transparent",
                        transition: "border-color 150ms ease, background 150ms ease",
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
                        disabled={!canManageShiftCodes}
                      />
                      <span
                        style={{
                          fontWeight: checked ? 700 : 500,
                          color: checked
                            ? "var(--color-brand)"
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
                <p style={{ margin: "6px 0 0", fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)" }}>
                  Only {form.requiredCertificationIds.map(id => certifications.find(s => s.id === id)?.name).filter(Boolean).join(", ")} can be assigned this shift.
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          {saveError && (
            <p style={{ color: "var(--color-danger)", fontSize: "var(--dg-fs-caption)", margin: "0 0 8px" }}>
              <strong>Error:</strong> {saveError}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={handleSave}
              disabled={saving || !canSave || !canManageShiftCodes}
              style={{
                background: canSave && canManageShiftCodes ? "var(--color-brand)" : "var(--color-border-light)",
                border: "none",
                color: canSave && canManageShiftCodes ? "var(--color-text-inverse)" : "var(--color-text-muted)",
                borderRadius: 8,
                padding: "8px 18px",
                fontSize: "var(--dg-fs-label)",
                fontWeight: 700,
                cursor: canSave && canManageShiftCodes ? "pointer" : "default",
                opacity: canSave && canManageShiftCodes ? 1 : 0.6,
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => {
                if (st.isNew) {
                  onDeleted(st.id);
                } else {
                  setForm({
                    label: st.label,
                    name: st.name,
                    color: st.color === "transparent" ? PREDEFINED_COLORS[0].bg : st.color,
                    border: st.border === "transparent" ? TRANSPARENT_BORDER : st.border,
                    text: st.text === "transparent" ? PREDEFINED_COLORS[0].text : st.text,
                    categoryId: st.categoryId ?? null,
                    focusAreaId: st.focusAreaId ?? null,
                    requiredCertificationIds: st.requiredCertificationIds ?? [],
                    defaultStartTime: st.defaultStartTime ?? null,
                    defaultEndTime: st.defaultEndTime ?? null,
                    defaultDurationHours: st.defaultDurationHours ?? null,
                    defaultDurationMinutes: st.defaultDurationMinutes ?? null,
                  });
                  setExpanded(false);
                }
              }}
              style={{
                background: "var(--color-border-light)",
                border: "none",
                borderRadius: 8,
                color: "var(--color-text-muted)",
                padding: "8px 14px",
                fontSize: "var(--dg-fs-label)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <div style={{ flex: 1 }} />
            {canManageShiftCodes && !st.isNew && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleting}
                style={{
                  background: "none",
                  border: "1px solid var(--color-danger-border)",
                  borderRadius: 8,
                  color: "var(--color-danger)",
                  padding: "8px 14px",
                  fontSize: "var(--dg-fs-label)",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {deleting ? "…" : "Delete"}
              </button>
            )}
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

// ── Absence Type Row ─────────────────────────────────────────────────────────
function AbsenceTypeRow({
  at,
  orgId,
  onSaved,
  onDeleted,
  canEdit,
  allAbsenceTypes,
}: {
  at: AbsenceType & { isNew?: boolean };
  orgId: string;
  onSaved: (saved: AbsenceType, prevId: number) => void;
  onDeleted: (id: number) => void;
  canEdit: boolean;
  allAbsenceTypes: (AbsenceType & { isNew?: boolean })[];
}) {
  const isMobile = useMediaQuery(MOBILE);
  const resolveForm = useCallback((src: AbsenceType) => ({
    label: src.label,
    name: src.name,
    color: src.color === "transparent" ? PREDEFINED_COLORS[0].bg : src.color,
    border: src.border === "transparent" ? TRANSPARENT_BORDER : src.border,
    text: src.text === "transparent" ? PREDEFINED_COLORS[0].text : src.text,
  }), []);
  const [form, setForm] = useState(() => resolveForm(at));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(!!at.isNew);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // M3: Re-sync form when parent prop changes (e.g., concurrent update)
  useEffect(() => {
    if (!at.isNew) setForm(resolveForm(at));
  }, [at.id, at.label, at.name, at.color, at.border, at.text, at.isNew, resolveForm]);

  const isDirty = at.isNew ||
    form.label !== at.label ||
    form.name !== at.name ||
    form.color !== (at.color === "transparent" ? PREDEFINED_COLORS[0].bg : at.color) ||
    form.border !== (at.border === "transparent" ? TRANSPARENT_BORDER : at.border) ||
    form.text !== (at.text === "transparent" ? PREDEFINED_COLORS[0].text : at.text);

  // M2: Duplicate label check
  const trimmedLabel = form.label.trim().toUpperCase();
  const isDuplicateLabel = trimmedLabel !== "" && allAbsenceTypes.some(
    (other) => other.id !== at.id && other.label.trim().toUpperCase() === trimmedLabel,
  );

  const canSave = isDirty && !!form.label.trim() && !!form.name.trim() && !isDuplicateLabel;

  const handleSave = useCallback(async () => {
    if (!form.label.trim() || !form.name.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await db.upsertAbsenceType({
        id: at.isNew ? undefined : at.id,
        orgId,
        label: form.label.trim(),
        name: form.name.trim(),
        color: form.color,
        border: form.border,
        text: form.text,
        sortOrder: at.sortOrder,
      });
      onSaved(saved, at.id);
      setExpanded(false);
      toast.success("Off day type saved");
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      console.error("Save absence type error:", msg, err);
      setSaveError(msg);
      toast.error("Failed to save off day type");
    } finally {
      setSaving(false);
    }
  }, [form, at, orgId, onSaved]);

  const handleDelete = useCallback(async () => {
    if (at.isNew) { onDeleted(at.id); return; }
    setDeleting(true);
    try {
      await db.deleteAbsenceType(at.id);
      onDeleted(at.id);
      toast.success("Off day type deleted");
    } catch (err) {
      toast.error("Failed to delete off day type");
      console.error(err);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [at, onDeleted]);

  return (
    <div style={{ borderBottom: "1px solid var(--color-border-light)" }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", cursor: "pointer" }}
        onClick={() => setExpanded((e) => !e)}
      >
        <span style={{ display: "inline-block", minWidth: 44, padding: "3px 8px", background: form.color, border: `1px solid ${borderColor(form.text)}`, color: form.text, borderRadius: 8, fontSize: "var(--dg-fs-caption)", fontWeight: 700, textAlign: "center" }}>
          {form.label || "…"}
        </span>
        <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)", flex: 1 }}>
          {form.name || "—"}
        </span>
        <span style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-faint)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}>▾</span>
      </div>

      {expanded && (
        <div style={{ background: "var(--color-bg)", borderTop: "1px solid var(--color-border-light)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "120px 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>CODE / LABEL</label>
              <input value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} placeholder="e.g. X" maxLength={6} style={inputStyle} disabled={!canEdit} />
            </div>
            <div>
              <label style={labelStyle}>FULL NAME</label>
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Sick Leave" maxLength={50} style={inputStyle} disabled={!canEdit} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>COLOR PRESET</label>
            <PresetColorPicker valueBg={form.color} onChange={c => setForm(p => ({ ...p, color: c.bg, text: c.text, border: TRANSPARENT_BORDER }))} disabled={!canEdit} />
          </div>
          {isDuplicateLabel && (
            <p style={{ color: "var(--color-danger)", fontSize: "var(--dg-fs-caption)", margin: "0 0 4px" }}>
              A type with label &ldquo;{form.label.trim()}&rdquo; already exists.
            </p>
          )}
          {saveError && (
            <p style={{ color: "var(--color-danger)", fontSize: "var(--dg-fs-caption)", margin: "0 0 8px" }}>
              <strong>Error:</strong> {saveError}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={handleSave} disabled={saving || !canSave || !canEdit} style={{ background: canSave && canEdit ? "var(--color-brand)" : "var(--color-border-light)", border: "none", color: canSave && canEdit ? "var(--color-text-inverse)" : "var(--color-text-muted)", borderRadius: 8, padding: "8px 18px", fontSize: "var(--dg-fs-label)", fontWeight: 700, cursor: canSave && canEdit ? "pointer" : "default", opacity: canSave && canEdit ? 1 : 0.6 }}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => { if (at.isNew) { onDeleted(at.id); } else { setForm(resolveForm(at)); setSaveError(null); setExpanded(false); } }} style={{ background: "var(--color-border-light)", border: "none", borderRadius: 8, color: "var(--color-text-muted)", padding: "8px 14px", fontSize: "var(--dg-fs-label)", cursor: "pointer" }}>
              Cancel
            </button>
            <div style={{ flex: 1 }} />
            {canEdit && !at.isNew && (
              <button onClick={() => setShowDeleteConfirm(true)} disabled={deleting} style={{ background: "none", border: "1px solid var(--color-danger-border)", borderRadius: 8, color: "var(--color-danger)", padding: "8px 14px", fontSize: "var(--dg-fs-label)", fontWeight: 600, cursor: "pointer" }}>
                {deleting ? "…" : "Delete"}
              </button>
            )}
          </div>
        </div>
      )}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Off Day Type?"
          message={<>Delete <strong>{form.label}</strong>? This type will be removed from future schedules.</>}
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

// ── Absence Types Settings ───────────────────────────────────────────────────
function AbsenceTypesSettings({
  absenceTypes,
  orgId,
  onChange,
  canManageShiftCodes,
}: {
  absenceTypes: AbsenceType[];
  orgId: string;
  onChange: (types: AbsenceType[]) => void;
  canManageShiftCodes: boolean;
}) {
  const [local, setLocal] = useState<(AbsenceType & { isNew?: boolean })[]>(absenceTypes);
  const nextTmpId = useRef(-1);

  useEffect(() => {
    setLocal((prev) => {
      const newItems = prev.filter((s) => (s as { isNew?: boolean }).isNew);
      return [...absenceTypes, ...newItems];
    });
  }, [absenceTypes]);

  const handleAdd = () => {
    const tmp: AbsenceType & { isNew: boolean } = {
      id: nextTmpId.current--,
      orgId,
      label: "",
      name: "",
      color: "#EEEFEC",
      border: "#9EB4D4",
      text: "#3E433B",
      sortOrder: local.length,
      isNew: true,
    };
    setLocal((prev) => [...prev, tmp]);
  };

  const handleSaved = (saved: AbsenceType, prevId: number) => {
    const updated = local.map((s) => (s.id === prevId ? saved : s));
    setLocal(updated);
    onChange(updated.filter(s => !(s as { isNew?: boolean }).isNew));
  };

  const handleDeleted = (id: number) => {
    const updated = local.filter((s) => s.id !== id);
    setLocal(updated);
    onChange(updated.filter(s => !(s as { isNew?: boolean }).isNew));
  };

  return (
    <div style={{ background: "var(--color-surface)", borderRadius: 12, border: "1px solid var(--color-border)", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--color-border-light)", fontWeight: 700, fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)" }}>
        Off Days
      </div>
      <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", margin: 0, padding: "8px 16px 4px" }}>
        Off days (scheduled off, sick leave, vacation) do not count toward shift totals.
      </p>
      {local.length > 0 ? (
        <div style={{ padding: "0 16px" }}>
          {local.map((at) => (
            <AbsenceTypeRow key={at.id} at={at} orgId={orgId} onSaved={handleSaved} onDeleted={handleDeleted} canEdit={canManageShiftCodes} allAbsenceTypes={local} />
          ))}
        </div>
      ) : (
        <div style={{ border: "1px dashed var(--color-border)", borderRadius: 10, padding: "28px 16px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--dg-fs-label)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, margin: "12px 16px" }}>
          <span>No off day types yet</span>
          {canManageShiftCodes && (
            <button onClick={handleAdd} className="dg-btn dg-btn-secondary" style={{ padding: "6px 14px", fontSize: "var(--dg-fs-caption)" }}>
              + Add Off Day Type
            </button>
          )}
        </div>
      )}
      {local.length > 0 && canManageShiftCodes && (
        <div style={{ padding: "8px 16px 12px" }}>
          <button onClick={handleAdd} style={{ background: "none", border: "none", color: "var(--color-text-muted)", padding: "6px 0", fontSize: "var(--dg-fs-caption)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            + Add Off Day Type
          </button>
        </div>
      )}
    </div>
  );
}

// ── Shift Codes Settings ──────────────────────────────────────────────────────
function ShiftCodesSettings({
  shiftCodes,
  focusAreas,
  shiftCategories,
  orgId,
  certifications,
  certificationLabel,
  focusAreaLabel,
  onChange,
  canManageShiftCodes,
  absenceTypes,
  onAbsenceTypesChange,
}: {
  shiftCodes: ShiftCode[];
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  orgId: string;
  certifications: NamedItem[];
  certificationLabel: string;
  focusAreaLabel: string;
  onChange: (types: ShiftCode[]) => void;
  canManageShiftCodes: boolean;
  absenceTypes: AbsenceType[];
  onAbsenceTypesChange: (types: AbsenceType[]) => void;
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

  const handleAdd = (focusAreaId: number | null) => {
    const tmp: ShiftCode & { isNew: boolean } = {
      id: nextTmpId.current--,
      orgId: orgId,
      label: "",
      name: "",
      color: "#F7F8F5",
      border: "#9EB4D4",
      text:"#3E433B",
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
    background: "none",
    border: "none",
    color: "var(--color-text-muted)",
    padding: "6px 0",
    fontSize: "var(--dg-fs-caption)",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  const renderRows = (codes: (ShiftCode & { isNew?: boolean })[], hideAreaSelect = false) =>
    codes.map((st) => (
      <ShiftCodeRow
        key={st.id}
        st={st}
        focusAreas={focusAreas}
        shiftCategories={shiftCategories}
        orgId={orgId}
        certifications={certifications}
        certificationLabel={certificationLabel}
        focusAreaLabel={focusAreaLabel}
        hideFocusAreaSelect={hideAreaSelect}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
        canManageShiftCodes={canManageShiftCodes}
      />
    ));

  const sectionHeader = (label: string, colorBg?: string, _colorText?: string) => (
    <div style={{
      padding: "10px 20px",
      background: "var(--color-bg)",
      color: "var(--color-text-secondary)",
      fontWeight: 700,
      fontSize: "var(--dg-fs-label)",
      borderTop: "1px solid var(--color-border-light)",
      borderBottom: "1px solid var(--color-border-light)",
      display: "flex",
      alignItems: "center",
      gap: 8,
    }}>
      {colorBg && <span style={{ width: 10, height: 10, borderRadius: "50%", background: colorBg, flexShrink: 0 }} />}
      {label}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", margin: 0 }}>
        Click any row to expand and edit. The label (code) is used in the schedule grid.
      </p>

      {/* Per-focus-area sections */}
      {focusAreas.map((focusArea) => {
        const areaCodes = local.filter(
          (s) => s.focusAreaId === focusArea.id,
        );
        return (
          <div key={focusArea.id} style={{ background: "var(--color-surface)", borderRadius: 12, border: "1px solid var(--color-border)", overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--color-border-light)", display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: focusArea.colorBg, flexShrink: 0 }} />
              {focusArea.name}
            </div>
            {areaCodes.length > 0 ? (
              <div style={{ padding: "0 16px" }}>
                {renderRows(areaCodes, true)}
              </div>
            ) : (
              <div style={{
                border: "1px dashed var(--color-border)", borderRadius: 10,
                padding: "28px 16px", textAlign: "center", color: "var(--color-text-muted)",
                fontSize: "var(--dg-fs-label)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                margin: "12px 16px",
              }}>
                <span>No shift codes yet</span>
                {canManageShiftCodes && (
                  <button onClick={() => handleAdd(focusArea.id)} className="dg-btn dg-btn-secondary" style={{ padding: "6px 14px", fontSize: "var(--dg-fs-caption)" }}>
                    + Add Shift Code
                  </button>
                )}
              </div>
            )}
            {areaCodes.length > 0 && canManageShiftCodes && (
              <div style={{ padding: "8px 16px 12px" }}>
                <button onClick={() => handleAdd(focusArea.id)} style={addBtnStyle}>
                  + Add Shift Code
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* General / cross-area codes */}
      {(() => {
        const generalCodes = local.filter(
          (s) => s.focusAreaId == null,
        );
        return (
          <div style={{ background: "var(--color-surface)", borderRadius: 12, border: "1px solid var(--color-border)", overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--color-border-light)", fontWeight: 700, fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)" }}>
              General / Cross-Area
            </div>
            {generalCodes.length > 0 ? (
              <div style={{ padding: "0 16px" }}>
                {renderRows(generalCodes, true)}
              </div>
            ) : (
              <div style={{
                border: "1px dashed var(--color-border)", borderRadius: 10,
                padding: "28px 16px", textAlign: "center", color: "var(--color-text-muted)",
                fontSize: "var(--dg-fs-label)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                margin: "12px 16px",
              }}>
                <span>No general codes yet</span>
                {canManageShiftCodes && (
                  <button onClick={() => handleAdd(null)} className="dg-btn dg-btn-secondary" style={{ padding: "6px 14px", fontSize: "var(--dg-fs-caption)" }}>
                    + Add General Code
                  </button>
                )}
              </div>
            )}
            {generalCodes.length > 0 && canManageShiftCodes && (
              <div style={{ padding: "8px 16px 12px" }}>
                <button onClick={() => handleAdd(null)} style={addBtnStyle}>
                  + Add General Code
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Off Days (Absence Types) */}
      <AbsenceTypesSettings
        absenceTypes={absenceTypes}
        orgId={orgId}
        onChange={onAbsenceTypesChange}
        canManageShiftCodes={canManageShiftCodes}
      />
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
  canEdit = true,
}: {
  label: string;
  items: NamedItem[];
  onSave: (items: NamedItem[]) => Promise<void>;
  placeholder: string;
  canEdit?: boolean;
}) {
  const isMobile = useMediaQuery(MOBILE);
  const [isEditing, setIsEditing] = useState(false);
  const [local, setLocal] = useState<NamedItem[]>(items);
  const [newName, setNewName] = useState("");
  const [newAbbr, setNewAbbr] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nextTmpId = useRef(-1);

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
    // Validate no duplicate names
    const names = local.map((it) => it.name.trim().toLowerCase());
    const dupes = names.filter((n, i) => n && names.indexOf(n) !== i);
    if (dupes.length > 0) {
      setError(`Duplicate name: "${dupes[0]}"`);
      return;
    }
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
    setLocal((prev) => [...prev, { id: nextTmpId.current--, orgId: "", name: trimmedName, abbr: trimmedAbbr, sortOrder: prev.length }]);
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
    if (draggedIdx !== null && dragOverIdx !== null && draggedIdx !== dragOverIdx
        && draggedIdx >= 0 && draggedIdx < local.length
        && dragOverIdx >= 0 && dragOverIdx <= local.length) {
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

  const gridCols = isMobile
    ? (isEditing ? "24px 32px 1fr 100px 28px" : "32px 1fr 100px")
    : (isEditing ? "24px 32px 1fr 200px 28px" : "32px 1fr 200px");

  return (
    <div style={{ padding: "16px" }}>
      <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", marginTop: 0, marginBottom: 12 }}>
        {label}
      </p>

      {/* Controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        {!isEditing && (
          <button
            onClick={handleEnterEdit}
            className="dg-btn dg-btn-secondary"
            style={{ padding: "7px 12px", fontSize: "var(--dg-fs-caption)", display: "flex", alignItems: "center", gap: 5 }}
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
          <button onClick={handleCancel} className="dg-btn dg-btn-secondary" style={{ padding: "7px 14px" }}>
            Cancel
          </button>
        )}
        {saved && (
          <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-brand)", fontWeight: 600 }}>Saved!</span>
        )}
      </div>

      {/* Table */}
      {displayList.length === 0 && !isEditing ? (
        <div style={{
          border: "1px dashed var(--color-border)", borderRadius: 12,
          padding: "40px 20px", textAlign: "center", color: "var(--color-text-muted)",
          fontSize: "var(--dg-fs-label)", display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        }}>
          <span>No items defined yet</span>
          {canEdit && (
            <button onClick={handleEnterEdit} className="dg-btn dg-btn-secondary" style={{ padding: "7px 16px", fontSize: "var(--dg-fs-caption)" }}>
              + Add New
            </button>
          )}
        </div>
      ) : (
      <div
        style={{
          overflow: "hidden",
          transition: "border-color 150ms ease, box-shadow 150ms ease",
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridCols,
            padding: "10px 16px",
            borderBottom: "1px solid var(--color-border-light)",
            background: isEditing ? "var(--color-info-bg)" : undefined,
          }}
        >
          {(isEditing
            ? ["", "#", "Full Name", "Abbreviation", ""]
            : ["#", "Full Name", "Abbreviation"]
          ).map((h, i) => (
            <div
              key={i}
              style={{
                fontSize: "var(--dg-fs-footnote)",
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
          const isDragging = isEditing && draggedIdx !== null && local[draggedIdx]?.id === item.id;
          const isDropTarget = isEditing && dragOverIdx === i && draggedIdx !== null && draggedIdx !== i;
          return (
            <div
              key={item.id}
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
                  ? "2px solid var(--color-brand)"
                  : i === 0
                    ? "none"
                    : "1px solid var(--color-border-light)",
                alignItems: "center",
                background: i % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)",
                cursor: isEditing ? "grab" : "default",
                transition: "background 150ms ease, opacity 150ms ease",
                opacity: isDragging ? 0.5 : 1,
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

              <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 700, color: "var(--color-text-faint)" }}>
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
                  style={{ ...inputStyle, fontSize: "var(--dg-fs-label)", fontWeight: 500 }}
                />
              ) : (
                <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 500, color: "var(--color-text-secondary)" }}>
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
                  style={{ ...inputStyle, fontSize: "var(--dg-fs-label)", fontWeight: 600 }}
                />
              ) : (
                <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-text-muted)" }}>
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
                    fontSize: "var(--dg-fs-body)",
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
              background: "var(--color-bg)",
            }}
          >
            <div />
            <div />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder={placeholder}
              style={{ ...inputStyle, fontSize: "var(--dg-fs-label)" }}
            />
            <input
              value={newAbbr}
              onChange={(e) => setNewAbbr(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Abbreviation"
              style={{ ...inputStyle, fontSize: "var(--dg-fs-label)" }}
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              style={{
                background: "none",
                border: "none",
                cursor: newName.trim() ? "pointer" : "not-allowed",
                color: newName.trim() ? "var(--color-brand)" : "var(--color-text-faint)",
                fontSize: "var(--dg-fs-heading)",
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
      )}

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "var(--color-danger-bg)",
            border: "1px solid var(--color-danger-border)",
            borderRadius: 8,
            color: "var(--color-danger-text)",
            fontSize: "var(--dg-fs-label)",
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
  orgId,
  onChange,
  canManageIndicatorTypes,
}: {
  indicatorTypes: IndicatorType[];
  orgId: string;
  onChange: (types: IndicatorType[]) => void;
  canManageIndicatorTypes: boolean;
}) {
  const isMobile = useMediaQuery(MOBILE);
  const [local, setLocal] = useState<(IndicatorType & { isNew?: boolean })[]>(indicatorTypes);
  const [saving, setSaving] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const nextTmpId = useRef(-1);

  const handleAdd = () => {
    const tmp: IndicatorType & { isNew: boolean } = {
      id: nextTmpId.current--,
      orgId: orgId,
      name: "",
      color: "var(--color-brand)",
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
        orgId: orgId,
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
      <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", margin: "0 0 14px" }}>
        Indicators appear as colored dots on shift cells. Add, rename, or recolor them here.
      </p>
      {local.length === 0 && (
        <div style={{
          border: "1px dashed var(--color-border)",
          borderRadius: 12,
          padding: "40px 20px",
          textAlign: "center",
          color: "var(--color-text-muted)",
          fontSize: "var(--dg-fs-label)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}>
          <span>No indicators defined yet</span>
          {canManageIndicatorTypes && (
            <button
              onClick={handleAdd}
              className="dg-btn dg-btn-secondary"
              style={{ padding: "7px 16px", fontSize: "var(--dg-fs-caption)" }}
            >
              + Add Indicator
            </button>
          )}
        </div>
      )}
      {local.map((indicator) => {
        const isSavingThis = saving === indicator.id;
        const isDeletingThis = deleting === indicator.id;
        return (
          <div
            key={indicator.id}
            style={{
              display: isMobile ? "flex" : "grid",
              flexWrap: isMobile ? "wrap" as const : undefined,
              gridTemplateColumns: isMobile ? undefined : "1fr 80px auto auto",
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
              maxLength={50}
              style={{ ...inputStyle, ...(isMobile ? { width: "100%" } : {}) }}
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
            {canManageIndicatorTypes && (
              <button
                onClick={() => handleSave(indicator)}
                disabled={isSavingThis || !indicator.name.trim()}
                className="dg-btn dg-btn-primary"
                style={{
                  padding: "7px 14px",
                  fontSize: "var(--dg-fs-caption)",
                  opacity: indicator.name.trim() ? 1 : 0.5,
                  cursor: indicator.name.trim() ? "pointer" : "not-allowed",
                }}
              >
                {isSavingThis ? "…" : "Save"}
              </button>
            )}
            {canManageIndicatorTypes && (
              <button
                onClick={() => indicator.isNew ? handleDelete(indicator) : setConfirmDeleteId(indicator.id)}
                disabled={isDeletingThis}
                className="dg-btn dg-btn-danger"
                style={{
                  padding: "7px 12px",
                  fontSize: "var(--dg-fs-caption)",
                }}
              >
                {isDeletingThis ? "…" : "Delete"}
              </button>
            )}
          </div>
        );
      })}
      {local.length > 0 && canManageIndicatorTypes && (
        <button
          onClick={handleAdd}
          style={{
            marginTop: 8,
            background: "none",
            border: "none",
            color: "var(--color-text-muted)",
            padding: "6px 0",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          + Add Indicator
        </button>
      )}
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
  orgId,
  onChange,
  canManageShiftCodes,
}: {
  shiftCategories: ShiftCategory[];
  focusAreas: FocusArea[];
  orgId: string;
  onChange: (categories: ShiftCategory[]) => void;
  canManageShiftCodes: boolean;
}) {
  const [local, setLocal] = useState<(ShiftCategory & { isNew?: boolean })[]>(shiftCategories);
  const [saving, setSaving] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const originalRef = useRef<Map<number, ShiftCategory>>(
    new Map(shiftCategories.map((c) => [c.id, c]))
  );
  // Keep originalRef in sync when props update (e.g. concurrent edits)
  useEffect(() => {
    originalRef.current = new Map(shiftCategories.map((c) => [c.id, c]));
  }, [shiftCategories]);
  const nextTmpId = useRef(-1);

  const handleAdd = (focusAreaId: number | null) => {
    const tmpId = nextTmpId.current--;
    const tmp: ShiftCategory & { isNew: boolean } = {
      id: tmpId,
      orgId: orgId,
      name: "",
      color: "var(--color-info-bg)",
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
        orgId: orgId,
        name: cat.name.trim(),
        color: cat.color,
        startTime: cat.startTime || null,
        endTime: cat.endTime || null,
        sortOrder: cat.sortOrder,
        focusAreaId: cat.focusAreaId ?? null,
        breakMinutes: cat.breakMinutes ?? null,
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
    background: "none",
    border: "none",
    color: "var(--color-text-muted)",
    padding: "6px 0",
    fontSize: "var(--dg-fs-caption)",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  const renderCategoryRow = (cat: ShiftCategory & { isNew?: boolean }) => {
    const isEditing = editingId === cat.id;
    const isSavingThis = saving === cat.id;
    const isDeletingThis = deleting === cat.id;
    const orig = originalRef.current.get(cat.id);
    const isDirty = cat.isNew || !orig ||
      cat.name !== orig.name ||
      (cat.startTime ?? null) !== (orig.startTime ?? null) ||
      (cat.endTime ?? null) !== (orig.endTime ?? null) ||
      (cat.breakMinutes ?? null) !== (orig.breakMinutes ?? null);

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
            <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-text-primary)" }}>
              {cat.name || <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>Untitled</span>}
            </span>
            {(cat.startTime || cat.endTime) && (
              <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                {fmt12h(cat.startTime)} – {fmt12h(cat.endTime)}
                {calcNetDuration(cat.startTime, cat.endTime, cat.breakMinutes, cat.focusAreaId, focusAreas) && (
                  <span style={{ marginLeft: 8, fontWeight: 600, color: "var(--color-text-secondary)" }}>
                    ({calcNetDuration(cat.startTime, cat.endTime, cat.breakMinutes, cat.focusAreaId, focusAreas)})
                  </span>
                )}
                {resolveEffectiveBreak(cat.breakMinutes, cat.focusAreaId, focusAreas) > 0 && (
                  <span style={{ marginLeft: 6, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-faint)" }}>
                    incl. {resolveEffectiveBreak(cat.breakMinutes, cat.focusAreaId, focusAreas)}m break
                  </span>
                )}
              </span>
            )}
          </div>
          {canManageShiftCodes && (
            <button
              onClick={() => setEditingId(cat.id)}
              style={{
                background: "none",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                color: "var(--color-text-primary)",
                padding: "6px 12px",
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Edit
            </button>
          )}
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
              maxLength={50}
              style={{ ...inputStyle }}
              autoFocus
              disabled={!canManageShiftCodes}
            />
          </div>
          <div>
            <label style={labelStyle}>START</label>
            <TimeInput12h
              value={cat.startTime}
              onChange={(v) => handleChange(cat.id, "startTime", v)}
              disabled={!canManageShiftCodes}
            />
          </div>
          <div>
            <label style={labelStyle}>END</label>
            <TimeInput12h
              value={cat.endTime}
              onChange={(v) => handleChange(cat.id, "endTime", v)}
              disabled={!canManageShiftCodes}
            />
          </div>
        </div>
        {/* Break Duration */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>BREAK (MIN)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number"
              min={0}
              max={480}
              value={cat.breakMinutes ?? ""}
              onChange={(e) => {
                const val = e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10) || 0);
                handleChange(cat.id, "breakMinutes", val);
              }}
              placeholder={(() => {
                if (!cat.focusAreaId) return "No break";
                const fa = focusAreas.find((f) => f.id === cat.focusAreaId);
                return fa?.breakMinutes ? `Inherits ${fa.breakMinutes}m` : "No break";
              })()}
              style={{ ...inputStyle, width: 140 }}
              disabled={!canManageShiftCodes}
            />
            {cat.breakMinutes == null && cat.focusAreaId != null && (() => {
              const fa = focusAreas.find((f) => f.id === cat.focusAreaId);
              return fa?.breakMinutes ? (
                <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                  Inherits {fa.breakMinutes}m from {fa.name}
                </span>
              ) : null;
            })()}
          </div>
        </div>
        {calcTimeDuration(cat.startTime, cat.endTime) && (
          <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", marginBottom: 10 }}>
            {(() => {
              const effectiveBreak = resolveEffectiveBreak(cat.breakMinutes, cat.focusAreaId, focusAreas);
              const gross = calcTimeDuration(cat.startTime, cat.endTime);
              const net = calcNetDuration(cat.startTime, cat.endTime, cat.breakMinutes, cat.focusAreaId, focusAreas);
              if (effectiveBreak > 0) {
                return <>Gross: {gross} · Break: {effectiveBreak}m · Net: <span style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}>{net}</span></>;
              }
              return <>Duration: <span style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}>{gross}</span></>;
            })()}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => handleSave(cat)}
            disabled={isSavingThis || !cat.name.trim() || !isDirty || !canManageShiftCodes}
            style={{
              background: cat.name.trim() && isDirty && canManageShiftCodes ? "var(--color-brand)" : "var(--color-border)",
              border: "none",
              color: "var(--color-text-inverse)",
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 700,
              cursor: cat.name.trim() && isDirty && canManageShiftCodes ? "pointer" : "not-allowed",
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
              borderRadius: 8,
              color: "var(--color-text-primary)",
              padding: "7px 12px",
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Cancel
          </button>
          {canManageShiftCodes && (
            <button
              onClick={() => cat.isNew ? handleDelete(cat) : setConfirmDeleteId(cat.id)}
              disabled={isDeletingThis}
              style={{
                background: "none",
                border: "1px solid var(--color-danger-border)",
                borderRadius: 8,
                color: "var(--color-danger)",
                padding: "7px 12px",
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                marginLeft: "auto",
              }}
            >
              {isDeletingThis ? "…" : "Delete"}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", margin: 0 }}>
        Define the tally categories for each focus area (e.g. Day, Evening, Night).
      </p>

      {focusAreas.map((focusArea) => {
        const areaCats = local.filter((c) => c.focusAreaId === focusArea.id);
        return (
          <div
            key={focusArea.id}
            style={{
              background: "var(--color-surface)",
              borderRadius: 12,
              border: "1px solid var(--color-border)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--color-border-light)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 700,
                fontSize: "var(--dg-fs-label)",
                color: "var(--color-text-secondary)",
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: focusArea.colorBg || "var(--color-border)", flexShrink: 0 }} />
              {focusArea.name}
            </div>
            {areaCats.length > 0 ? (
              <div style={{ padding: "0 16px" }}>
                {areaCats.map(renderCategoryRow)}
              </div>
            ) : (
              <div style={{
                border: "1px dashed var(--color-border)", borderRadius: 10,
                padding: "28px 16px", textAlign: "center", color: "var(--color-text-muted)",
                fontSize: "var(--dg-fs-label)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                margin: "12px 16px",
              }}>
                <span>No categories yet</span>
                {canManageShiftCodes && (
                  <button onClick={() => handleAdd(focusArea.id)} className="dg-btn dg-btn-secondary" style={{ padding: "6px 14px", fontSize: "var(--dg-fs-caption)" }}>
                    + Add Category
                  </button>
                )}
              </div>
            )}
            {areaCats.length > 0 && canManageShiftCodes && (
              <div style={{ padding: "8px 16px 12px" }}>
                <button onClick={() => handleAdd(focusArea.id)} style={addBtnStyle}>
                  + Add Category
                </button>
              </div>
            )}
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
  { label: "Schedule", keys: ["canEditShifts", "canPublishSchedule", "canApplyRecurringSchedule", "canApproveShiftRequests"] },
  { label: "Notes", keys: ["canEditNotes"] },
  { label: "Recurring", keys: ["canManageRecurringShifts", "canManageShiftSeries"] },
  { label: "Staff", keys: ["canManageEmployees"] },
  { label: "Configuration", keys: ["canManageFocusAreas", "canManageShiftCodes", "canManageIndicatorTypes", "canManageOrgSettings", "canManageOrgLabels", "canManageCoverageRequirements"] },
];

const PERM_LABELS: Record<keyof AdminPermissions, string> = {
  canViewSchedule: "View Schedule",
  canEditShifts: "Edit Shifts",
  canPublishSchedule: "Publish Schedule",
  canApplyRecurringSchedule: "Apply Recurring Schedule",
  canEditNotes: "Edit Notes / Indicators",
  canManageRecurringShifts: "Manage Recurring Shifts",
  canManageShiftSeries: "Manage Shift Series",
  canViewStaff: "View Staff",
  canManageEmployees: "Manage Employees",
  canManageFocusAreas: "Manage Focus Areas",
  canManageShiftCodes: "Manage Shift Codes",
  canManageIndicatorTypes: "Manage Indicator Types",
  canManageOrgSettings: "Manage Organization Settings",
  canManageOrgLabels: "Manage Custom Labels",
  canManageCoverageRequirements: "Manage Coverage Requirements",
  canApproveShiftRequests: "Approve Shift Requests",
};

/** Permissions that are always on and cannot be toggled off. */
const ALWAYS_ON = new Set<keyof AdminPermissions>(["canViewSchedule"]);

/** Permissions that only super_admin can hold — hidden from admin permissions editor. */
const SUPER_ADMIN_ONLY = new Set<keyof AdminPermissions>(["canManageOrgSettings"]);

function emptyAdminPerms(): AdminPermissions {
  return {
    canViewSchedule: true,
    canEditShifts: false,
    canPublishSchedule: false,
    canApplyRecurringSchedule: false,
    canEditNotes: false,
    canManageRecurringShifts: false,
    canManageShiftSeries: false,
    canViewStaff: true,
    canManageEmployees: false,
    canManageFocusAreas: false,
    canManageShiftCodes: false,
    canManageIndicatorTypes: false,
    canManageOrgSettings: false,
    canManageOrgLabels: false,
    canManageCoverageRequirements: false,
    canApproveShiftRequests: false,
  };
}

// ── Coverage Requirements Settings ────────────────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function CoverageRequirementsSettings({
  orgId,
  focusAreas,
  shiftCategories,
  shiftCodes,
  coverageRequirements,
  onCoverageRequirementsChange,
  canEdit,
}: {
  orgId: string;
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  shiftCodes: ShiftCode[];
  coverageRequirements: CoverageRequirement[];
  onCoverageRequirementsChange: (reqs: CoverageRequirement[]) => void;
  canEdit: boolean;
}) {
  // Expand key = "focusAreaId-categoryId"
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Draft edits keyed by "focusAreaId-categoryId"
  type CodeReq = { shiftCodeId: number; minStaff: number };
  type DraftRow = { dayOfWeek: number | null; codeRequirements: CodeReq[] };
  type DraftEntry = { everyDay: boolean; rows: DraftRow[] };
  const [drafts, setDrafts] = useState<Record<string, DraftEntry>>({});

  // Get the shift codes belonging to a (focusArea, category) group
  const getCodesForGroup = useCallback(
    (focusAreaId: number, categoryId: number): ShiftCode[] => {
      return shiftCodes.filter(
        (sc) =>
          !sc.archivedAt &&
          sc.categoryId === categoryId &&
          sc.focusAreaId === focusAreaId,
      );
    },
    [shiftCodes],
  );

  const getDraft = useCallback(
    (focusAreaId: number, categoryId: number): DraftEntry => {
      const key = `${focusAreaId}-${categoryId}`;
      if (drafts[key]) return drafts[key];

      const codes = getCodesForGroup(focusAreaId, categoryId);
      const makeEmptyCodeReqs = (): CodeReq[] =>
        codes.map((sc) => ({ shiftCodeId: sc.id, minStaff: 0 }));

      // Build from existing requirements for codes in this group
      const codeIds = new Set(codes.map((sc) => sc.id));
      const existing = coverageRequirements.filter(
        (r) => r.focusAreaId === focusAreaId && codeIds.has(r.shiftCodeId),
      );

      if (existing.length === 0) {
        return { everyDay: true, rows: [{ dayOfWeek: null, codeRequirements: makeEmptyCodeReqs() }] };
      }

      const hasEveryDay = existing.some((r) => r.dayOfWeek === null);
      if (hasEveryDay) {
        const codeReqs = codes.map((sc) => {
          const match = existing.find((r) => r.shiftCodeId === sc.id && r.dayOfWeek === null);
          return { shiftCodeId: sc.id, minStaff: match?.minStaff ?? 0 };
        });
        return { everyDay: true, rows: [{ dayOfWeek: null, codeRequirements: codeReqs }] };
      }

      // Per-day mode: fill all 7 days
      const rows: DraftRow[] = [];
      for (let d = 0; d < 7; d++) {
        const codeReqs = codes.map((sc) => {
          const match = existing.find((r) => r.shiftCodeId === sc.id && r.dayOfWeek === d);
          return { shiftCodeId: sc.id, minStaff: match?.minStaff ?? 0 };
        });
        rows.push({ dayOfWeek: d, codeRequirements: codeReqs });
      }
      return { everyDay: false, rows };
    },
    [coverageRequirements, drafts, getCodesForGroup],
  );

  const setDraft = useCallback((focusAreaId: number, categoryId: number, entry: DraftEntry) => {
    setDrafts((prev) => ({ ...prev, [`${focusAreaId}-${categoryId}`]: entry }));
  }, []);

  const handleToggleEveryDay = useCallback(
    (focusAreaId: number, categoryId: number) => {
      const current = getDraft(focusAreaId, categoryId);
      if (current.everyDay) {
        // Switch to per-day: duplicate current every-day row to all 7 days
        const val = current.rows[0]?.codeRequirements ?? [];
        const rows: DraftRow[] = [];
        for (let d = 0; d < 7; d++) {
          rows.push({ dayOfWeek: d, codeRequirements: val.map((c) => ({ ...c })) });
        }
        setDraft(focusAreaId, categoryId, { everyDay: false, rows });
      } else {
        // Check if per-day values differ — warn before collapsing
        const allValues = current.rows.map((r) => JSON.stringify(r.codeRequirements.map((c) => c.minStaff)));
        const hasDifferentDays = new Set(allValues).size > 1;
        if (hasDifferentDays && !window.confirm("Per-day values differ. Switching to 'Same every day' will keep only Monday's values. Continue?")) {
          return;
        }
        // Switch to every-day: use Monday's values (index 1)
        const mon = current.rows.find((r) => r.dayOfWeek === 1) ?? current.rows[0];
        const codeReqs = mon?.codeRequirements.map((c) => ({ ...c })) ?? [];
        setDraft(focusAreaId, categoryId, {
          everyDay: true,
          rows: [{ dayOfWeek: null, codeRequirements: codeReqs }],
        });
      }
    },
    [getDraft, setDraft],
  );

  const handleCodeChange = useCallback(
    (focusAreaId: number, categoryId: number, rowIndex: number, codeIndex: number, value: number) => {
      const current = getDraft(focusAreaId, categoryId);
      const rows = current.rows.map((r, ri) => {
        if (ri !== rowIndex) return r;
        const codeRequirements = r.codeRequirements.map((c, ci) => {
          if (ci !== codeIndex) return c;
          return { ...c, minStaff: Math.min(999, Math.max(0, value)) };
        });
        return { ...r, codeRequirements };
      });
      setDraft(focusAreaId, categoryId, { ...current, rows });
    },
    [getDraft, setDraft],
  );

  const handleSave = useCallback(
    async (focusAreaId: number, categoryId: number) => {
      const draft = getDraft(focusAreaId, categoryId);
      const codes = getCodesForGroup(focusAreaId, categoryId);
      const codeIds = new Set(codes.map((sc) => sc.id));
      const key = `${focusAreaId}-${categoryId}`;
      setSavingKey(key);
      try {
        // Save per code — collect all saved results
        const allSaved: CoverageRequirement[] = [];
        for (const code of codes) {
          const rows = draft.rows.map((r) => {
            const cr = r.codeRequirements.find((c) => c.shiftCodeId === code.id);
            return { dayOfWeek: r.dayOfWeek, minStaff: cr?.minStaff ?? 0 };
          });
          const saved = await db.saveCoverageRequirements(orgId, focusAreaId, code.id, rows);
          allSaved.push(...saved);
        }
        // Update parent state: remove old entries for codes in this group, add new ones
        const remaining = coverageRequirements.filter(
          (r) => !(r.focusAreaId === focusAreaId && codeIds.has(r.shiftCodeId)),
        );
        onCoverageRequirementsChange([...remaining, ...allSaved]);
        // Clear draft
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[`${focusAreaId}-${categoryId}`];
          return next;
        });
        toast.success("Coverage requirements saved");
      } catch (e) {
        console.error(e);
        toast.error("Failed to save coverage requirements");
      } finally {
        setSavingKey(null);
      }
    },
    [getDraft, getCodesForGroup, orgId, coverageRequirements, onCoverageRequirementsChange],
  );

  const activeCategories = shiftCategories.filter((c) => !c.archivedAt);
  const activeFocusAreas = focusAreas.filter((fa) => !fa.archivedAt);

  if (activeFocusAreas.length === 0 || activeCategories.length === 0) {
    return (
      <div style={{
        border: "1px dashed var(--color-border)",
        borderRadius: 12,
        padding: "40px 20px",
        textAlign: "center",
        color: "var(--color-text-muted)",
        fontSize: "var(--dg-fs-label)",
      }}>
        {activeFocusAreas.length === 0
          ? "Create focus areas first to configure coverage requirements."
          : "Create shift categories first to configure coverage requirements."}
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: 48,
    padding: "4px 4px",
    fontSize: "var(--dg-fs-caption)",
    borderRadius: 8,
    border: "1px solid var(--color-border)",
    textAlign: "center",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)", margin: 0 }}>
        Set minimum staffing requirements per focus area and shift code. These will be shown in the schedule grid tally rows and the coverage panel.
      </p>

      {activeFocusAreas.map((fa) => (
        <div
          key={fa.id}
          style={{
            background: "var(--color-surface)",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            overflow: "hidden",
          }}
        >
          {/* Focus Area Header */}
          <div
            style={{
              padding: "10px 16px",
              color: "var(--color-text-secondary)",
              fontWeight: 700,
              fontSize: "var(--dg-fs-label)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderBottom: "1px solid var(--color-border-light)",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: fa.colorBg, flexShrink: 0 }} />
            {fa.name}
          </div>

          {/* Categories */}
          {activeCategories.map((cat) => {
            if (cat.focusAreaId != null && cat.focusAreaId !== fa.id) return null;

            const codes = getCodesForGroup(fa.id, cat.id);
            if (codes.length === 0) return null;

            const key = `${fa.id}-${cat.id}`;
            const isExpanded = expanded === key;
            const draft = getDraft(fa.id, cat.id);
            const hasValues = draft.rows.some((r) =>
              r.codeRequirements.some((c) => c.minStaff > 0),
            );

            return (
              <div key={cat.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                {/* Category row */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "10px 16px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 600,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {cat.name}
                    {hasValues && (
                      <span
                        style={{
                          fontSize: "var(--dg-fs-footnote)",
                          fontWeight: 700,
                          color: "var(--color-brand)",
                          background: "var(--color-info-bg)",
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        configured
                      </span>
                    )}
                  </span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      transition: "transform 150ms ease",
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0)",
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Expanded editor */}
                {isExpanded && (
                  <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Every day toggle */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>Same every day</span>
                      <button
                        disabled={!canEdit}
                        onClick={() => handleToggleEveryDay(fa.id, cat.id)}
                        style={{
                          width: 34,
                          height: 20,
                          borderRadius: 10,
                          background: draft.everyDay ? "var(--color-brand)" : "var(--color-border)",
                          border: "none",
                          cursor: canEdit ? "pointer" : "default",
                          position: "relative",
                          padding: 0,
                          transition: "background 150ms ease",
                        }}
                      >
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            background: "#fff",
                            position: "absolute",
                            top: 2,
                            left: draft.everyDay ? 16 : 2,
                            transition: "left 150ms ease",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                          }}
                        />
                      </button>
                    </div>

                    {/* Per-code vertical list */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {codes.map((sc, ci) => (
                        <div key={sc.id}>
                          {/* Shift code badge */}
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "3px 10px",
                              borderRadius: 8,
                              fontSize: "var(--dg-fs-caption)",
                              fontWeight: 700,
                              color: sc.text || "var(--color-text-secondary)",
                              background: sc.color || "#EEEFEC",
                              marginBottom: 6,
                            }}
                          >
                            {sc.label} — {sc.name}
                          </div>
                          {/* Inputs */}
                          {draft.everyDay ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 4 }}>
                              <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", width: 60 }}>Min staff</span>
                              <input
                                type="number"
                                min={0}
                                max={999}
                                value={draft.rows[0]?.codeRequirements[ci]?.minStaff ?? 0}
                                onChange={(e) => handleCodeChange(fa.id, cat.id, 0, ci, parseInt(e.target.value) || 0)}
                                disabled={!canEdit}
                                style={inputStyle}
                              />
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 4 }}>
                              {draft.rows.map((row, ri) => (
                                <div key={ri} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", width: 28 }}>
                                    {DAY_NAMES[row.dayOfWeek ?? 0]}
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={999}
                                    value={row.codeRequirements[ci]?.minStaff ?? 0}
                                    onChange={(e) => handleCodeChange(fa.id, cat.id, ri, ci, parseInt(e.target.value) || 0)}
                                    disabled={!canEdit}
                                    style={{ ...inputStyle, width: 42 }}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Save button */}
                    {canEdit && (
                      <button
                        onClick={() => handleSave(fa.id, cat.id)}
                        disabled={savingKey === key}
                        style={{
                          alignSelf: "flex-start",
                          padding: "7px 16px",
                          fontSize: "var(--dg-fs-caption)",
                          fontWeight: 600,
                          borderRadius: 8,
                          border: "none",
                          background: "var(--color-brand)",
                          color: "var(--color-text-inverse)",
                          cursor: savingKey === key ? "not-allowed" : "pointer",
                          opacity: savingKey === key ? 0.7 : 1,
                        }}
                      >
                        {savingKey === key ? "Saving..." : "Save"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── User Management Settings ──────────────────────────────────────────────────
function UserManagementSettings({ orgId, isSuperAdmin }: { orgId: string; isSuperAdmin: boolean }) {
  const { user: currentUser } = useAuth();
  const isMobile = useMediaQuery(MOBILE);
  const myRole = isSuperAdmin ? "super_admin" : "user";
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [editingPerms, setEditingPerms] = useState<Record<string, AdminPermissions>>({});
  const [savingPerms, setSavingPerms] = useState<string | null>(null);
  const [roleChangeConfirm, setRoleChangeConfirm] = useState<{
    userId: string; userName: string; from: OrganizationRole; to: OrganizationRole;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    db.fetchOrganizationUsers(orgId)
      .then((u) => { if (mounted) { setUsers(u); setLoading(false); } })
      .catch((e) => { if (mounted) { setError(e.message); setLoading(false); } });
    return () => { mounted = false; };
  }, [orgId]);

  const handleRoleChange = async (userId: string, newRole: OrganizationRole) => {
    setSaving(userId);
    setError(null);
    try {
      await db.changeOrganizationUserRole(userId, newRole);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, orgRole: newRole } : u));
      if (newRole === "user") setExpandedUserId((prev) => prev === userId ? null : prev);
      toast.success("Role updated");
    } catch (e) {
      toast.error("Failed to change role");
      setError(e instanceof Error ? e.message : "Failed to change role");
    } finally {
      setSaving(null);
    }
  };

  const requestRoleChange = (user: OrganizationUser, newRole: OrganizationRole) => {
    if (newRole === user.orgRole) return;
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "User";
    setRoleChangeConfirm({ userId: user.id, userName: displayName, from: user.orgRole, to: newRole });
  };

  const confirmRoleChange = () => {
    if (!roleChangeConfirm) return;
    handleRoleChange(roleChangeConfirm.userId, roleChangeConfirm.to);
    setRoleChangeConfirm(null);
  };

  const openPermissions = (user: OrganizationUser) => {
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
      await db.updateAdminPermissions(userId, editingPerms[userId], orgId);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, adminPermissions: editingPerms[userId] } : u));
      toast.success("Permissions saved");
    } catch (e) {
      toast.error("Failed to save permissions");
      setError(e instanceof Error ? e.message : "Failed to save permissions");
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
    super_admin: { bg: "var(--color-info-bg)", text: "var(--color-brand)" },
    admin: { bg: "var(--color-info-bg)", text: "var(--color-brand)" },
    user: { bg: "var(--color-border-light)", text: "var(--color-text-muted)" },
  };

  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const ROLE_ORDER: Record<string, number> = { super_admin: 0, admin: 1, user: 2 };

  const sortedUsers = [...users]
    .filter((u) => {
      if (roleFilter !== "all" && u.orgRole !== roleFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = [u.firstName, u.lastName].filter(Boolean).join(" ").toLowerCase();
        const email = (u.email ?? "").toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Pin logged-in user to the top
      const aIsYou = !!(currentUser && a.id === currentUser.id);
      const bIsYou = !!(currentUser && b.id === currentUser.id);
      if (aIsYou !== bIsYou) return aIsYou ? -1 : 1;

      const ra = ROLE_ORDER[a.orgRole] ?? 3;
      const rb = ROLE_ORDER[b.orgRole] ?? 3;
      if (ra !== rb) return ra - rb;
      const nameA = [a.firstName, a.lastName].filter(Boolean).join(" ") || a.email || "";
      const nameB = [b.firstName, b.lastName].filter(Boolean).join(" ") || b.email || "";
      return nameA.localeCompare(nameB);
    });

  if (loading) {
    return <p style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>Loading users…</p>;
  }

  const roleChangeMessage = roleChangeConfirm ? (() => {
    const toLabel = ROLE_LABELS[roleChangeConfirm.to] ?? roleChangeConfirm.to;
    const fromLabel = ROLE_LABELS[roleChangeConfirm.from] ?? roleChangeConfirm.from;
    if (roleChangeConfirm.to === "super_admin") {
      return `Promote "${roleChangeConfirm.userName}" to Super Admin? They will have full control over this organization.`;
    }
    if (roleChangeConfirm.to === "admin") {
      return `Promote "${roleChangeConfirm.userName}" from ${fromLabel} to Admin? You can configure their permissions afterward.`;
    }
    return `Change "${roleChangeConfirm.userName}" from ${fromLabel} to ${toLabel}? They will lose any admin permissions.`;
  })() : "";

  const roleChangeVariant: "danger" | "warning" | "info" = roleChangeConfirm
    ? roleChangeConfirm.to === "super_admin" ? "warning"
      : roleChangeConfirm.to === "user" && roleChangeConfirm.from !== "user" ? "warning"
      : "info"
    : "info";

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div>
      {error && (
        <div style={{ marginBottom: 12, padding: 10, background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", borderRadius: 8, color: "var(--color-danger-text)", fontSize: "var(--dg-fs-label)" }}>
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        {/* Left group: filter */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 700, color: "var(--color-text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>Filter</span>
          <CustomSelect
            value={roleFilter}
            options={[
              { value: "all", label: "All Roles" },
              { value: "super_admin", label: "Super Admin" },
              { value: "admin", label: "Admin" },
              { value: "user", label: "User" },
            ]}
            onChange={setRoleFilter}
            style={{ width: "auto", minWidth: 140 }}
            fontSize={12}
          />
          {(search || roleFilter !== "all") && (
            <button
              onClick={() => { setSearch(""); setRoleFilter("all"); }}
              style={{
                background: "none", border: "none", color: "var(--color-today-text)", fontSize: "var(--dg-fs-caption)",
                fontWeight: 600, cursor: "pointer", padding: "4px 8px",
              }}
            >
              Clear
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Right group: count + search */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
            {sortedUsers.length} of {users.length}
          </span>
          <div style={{ position: "relative", minWidth: 180, maxWidth: 240 }}>
            <svg
              width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-faint)" }}
            >
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="dg-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              style={{ paddingLeft: 32, fontSize: "var(--dg-fs-caption)", background: "var(--color-surface)", border: "1px solid var(--color-border-light)" }}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4 text-[11px] tracking-wide uppercase text-muted-foreground">Name</TableHead>
              <TableHead className="text-[11px] tracking-wide uppercase text-muted-foreground">Role</TableHead>
              <TableHead className="hidden md:table-cell text-[11px] tracking-wide uppercase text-muted-foreground">Joined</TableHead>
              <TableHead className="hidden md:table-cell text-[11px] tracking-wide uppercase text-muted-foreground">Last Login</TableHead>
              <TableHead className="w-10 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedUsers.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-10 text-center text-[13px] text-muted-foreground">
                  {search || roleFilter !== "all" ? "No users match your filters" : "No users found"}
                </TableCell>
              </TableRow>
            )}

            {sortedUsers.map((user) => {
              const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "—";
              const roleColor = ROLE_COLORS[user.orgRole] ?? ROLE_COLORS.user;
              const isSuperAdminUser = user.orgRole === "super_admin";
              const isExpanded = expandedUserId === user.id;
              const savedPerms = { ...emptyAdminPerms(), ...(user.adminPermissions ?? {}) };
              const perms = editingPerms[user.id] ?? savedPerms;
              const allPermKeys = PERM_GROUPS.flatMap((g) => g.keys);
              const hasUnsavedChanges = isExpanded && editingPerms[user.id] != null &&
                allPermKeys.some((key) => editingPerms[user.id][key] !== savedPerms[key]);

              return (
                <React.Fragment key={user.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => openPermissions(user)}
                  >
                    {/* Name + Email */}
                    <TableCell className="pl-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold text-white" style={{ background: "var(--color-brand)" }}>
                          {(displayName !== "—" ? displayName : "?")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[13px] font-medium text-foreground truncate">
                            {displayName}
                            {currentUser && user.id === currentUser.id && (
                              <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-blue-50 text-blue-600 shrink-0">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {user.email ?? "—"}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Role */}
                    <TableCell className="py-3">
                      <span
                        className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap"
                        style={{ background: roleColor.bg, color: roleColor.text }}
                      >
                        {ROLE_LABELS[user.orgRole] ?? user.orgRole}
                      </span>
                    </TableCell>

                    {/* Joined */}
                    <TableCell className="hidden md:table-cell py-3 text-[12px] text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </TableCell>

                    {/* Last Login */}
                    <TableCell className="hidden md:table-cell py-3 text-[12px] text-muted-foreground">
                      {formatDate(user.lastSignInAt)}
                    </TableCell>

                    {/* Chevron */}
                    <TableCell className="pr-4 py-3">
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className="text-muted-foreground/50 transition-transform duration-150"
                        style={{ transform: isExpanded ? "rotate(180deg)" : "none" }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </TableCell>
                  </TableRow>

                  {/* Expanded permissions panel */}
                  {isExpanded && (
                    <TableRow className="hover:bg-transparent border-0">
                      <TableCell colSpan={5} className="p-0">
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            padding: isMobile ? "12px 12px 12px 16px" : "12px 16px 16px 52px",
                            display: "flex", flexDirection: "column", gap: 12,
                          }}
                        >
                          {/* Role selector */}
                          {myRole === "super_admin" && !isSuperAdminUser && (
                            <div>
                              <label style={labelStyle}>ROLE</label>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <CustomSelect
                                  value={user.orgRole}
                                  options={[
                                    { value: "user", label: "User" },
                                    { value: "admin", label: "Admin" },
                                    { value: "super_admin", label: "Super Admin" },
                                  ]}
                                  onChange={(v) => requestRoleChange(user, v as OrganizationRole)}
                                  disabled={saving === user.id}
                                  style={{ width: 160 }}
                                  fontSize={12}
                                />
                                {saving === user.id && (
                                  <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>Saving…</span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Permissions (admin only) */}
                          {user.orgRole === "admin" && myRole === "super_admin" && (
                            <>
                              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                {PERM_GROUPS.map((group) => {
                                  const keys = group.keys.filter((k) => !SUPER_ADMIN_ONLY.has(k));
                                  if (keys.length === 0) return null;
                                  return (
                                  <div key={group.label}>
                                    <label style={labelStyle}>{group.label}</label>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                      {keys.map((key) => {
                                        const alwaysOn = ALWAYS_ON.has(key);
                                        const isOn = perms[key] ?? false;
                                        const toggleDisabled = alwaysOn || savingPerms === user.id;
                                        return (
                                          <div
                                            key={key}
                                            role="button"
                                            tabIndex={toggleDisabled ? -1 : 0}
                                            onClick={() => { if (!toggleDisabled) handlePermToggle(user.id, key, !isOn); }}
                                            onKeyDown={(e) => { if (!toggleDisabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); handlePermToggle(user.id, key, !isOn); } }}
                                            style={{
                                              display: "flex", alignItems: "center", justifyContent: "space-between",
                                              padding: "7px 10px", borderRadius: 8,
                                              cursor: toggleDisabled ? "default" : "pointer",
                                              opacity: alwaysOn ? 0.5 : 1,
                                              transition: "background 150ms ease",
                                            }}
                                            onMouseEnter={(e) => { if (!toggleDisabled) e.currentTarget.style.background = "var(--color-border-light)"; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                                          >
                                            <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-secondary)", lineHeight: 1.3 }}>
                                              {PERM_LABELS[key]}
                                            </span>
                                            <div style={{
                                              position: "relative", width: 34, height: 20, borderRadius: 10, flexShrink: 0,
                                              background: isOn ? "var(--color-brand)" : "var(--color-border)",
                                              transition: "background 150ms ease",
                                            }}>
                                              <div style={{
                                                position: "absolute",
                                                top: 2, left: isOn ? 16 : 2,
                                                width: 16, height: 16, borderRadius: "50%",
                                                background: "#fff",
                                                boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                                                transition: "left 150ms ease",
                                              }} />
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  );
                                })}
                              </div>

                              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 14, borderTop: "1px solid var(--color-border-light)" }}>
                                <button
                                  onClick={() => {
                                    if (hasUnsavedChanges) {
                                      setEditingPerms((prev) => ({ ...prev, [user.id]: { ...savedPerms } }));
                                    } else {
                                      setExpandedUserId(null);
                                    }
                                  }}
                                  disabled={savingPerms === user.id}
                                  className="dg-btn dg-btn-secondary"
                                  style={{ padding: "7px 14px" }}
                                >
                                  {hasUnsavedChanges ? "Undo" : "Cancel"}
                                </button>
                                <button
                                  onClick={() => handlePermsSave(user.id)}
                                  disabled={savingPerms === user.id || !hasUnsavedChanges}
                                  className="dg-btn dg-btn-primary"
                                  style={{ padding: "7px 14px" }}
                                >
                                  {savingPerms === user.id ? "Saving…" : "Save"}
                                </button>
                              </div>
                            </>
                          )}

                          {/* Info for super_admin users */}
                          {isSuperAdminUser && (
                            <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", margin: 0 }}>
                              Super Admins have full access to all organization features.
                            </p>
                          )}

                          {/* Info for regular users */}
                          {user.orgRole === "user" && myRole === "super_admin" && (
                            <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", margin: 0 }}>
                              Users have read-only access. Promote to Admin to configure permissions.
                            </p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Role change confirmation */}
      {roleChangeConfirm && (
        <ConfirmDialog
          title="Change Role"
          message={roleChangeMessage}
          confirmLabel="Confirm"
          variant={roleChangeVariant}
          isLoading={saving === roleChangeConfirm.userId}
          onConfirm={confirmRoleChange}
          onCancel={() => setRoleChangeConfirm(null)}
        />
      )}

    </div>
  );
}

// ── Sidebar nav link ──────────────────────────────────────────────────────────
function SidebarLink({
  label,
  icon,
  active,
  href,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  href: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href={href}
      replace
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        padding: "7px 12px",
        background: active
          ? "var(--color-bg-secondary)"
          : hovered
          ? "var(--color-border-light)"
          : "transparent",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: "var(--dg-fs-label)",
        fontWeight: active ? 600 : 500,
        color: active ? "var(--color-text-primary)" : hovered ? "var(--color-text-primary)" : "var(--color-text-secondary)",
        textAlign: "left",
        fontFamily: "inherit",
        textDecoration: "none",
        transition: "background 150ms ease, color 150ms ease",
        position: "relative",
      }}
    >
      <span style={{
        color: active ? "var(--color-text-secondary)" : "var(--color-text-muted)",
        flexShrink: 0,
      }}>
        {icon}
      </span>
      {label}
    </Link>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SettingsPage({
  organization,
  focusAreas,
  shiftCodes,
  shiftCategories,
  indicatorTypes,
  certifications,
  orgRoles,
  onOrganizationSave,
  onFocusAreasChange,
  onShiftCodesChange,
  onShiftCategoriesChange,
  onIndicatorTypesChange,
  onCertificationsChange,
  onOrgRolesChange,
  canManageOrg,
  isSuperAdmin,
  isGridmaster,
  canManageOrgLabels,
  canManageFocusAreas,
  canManageShiftCodes,
  canManageIndicatorTypes,
  canManageOrgSettings,
  coverageRequirements,
  onCoverageRequirementsChange,
  canManageCoverageRequirements,
  absenceTypes,
  onAbsenceTypesChange,
}: SettingsPageProps) {
  const pathname = usePathname();
  const VALID_SECTIONS = ["organization", "shift-categories", "shift-codes", "coverage", "indicators", "staff-config", "users", "impersonation"];
  const sectionFromPath = pathname.split("/")[2];
  const isMobile = useMediaQuery(MOBILE);
  const isTablet = useMediaQuery(TABLET);
  const defaultSection = canManageOrg ? "organization" : "impersonation";
  const activeSection = sectionFromPath && VALID_SECTIONS.includes(sectionFromPath) ? sectionFromPath : defaultSection;

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("dg-sidebar-manual-collapse") !== "true";
  });

  const handleSidebarOpenChange = useCallback((open: boolean) => {
    setSidebarOpen(open);
    localStorage.setItem("dg-sidebar-manual-collapse", String(!open));
  }, []);

  const focusAreaLabel = organization.focusAreaLabel || "Focus Areas";
  const certificationLabel = organization.certificationLabel || "Certifications";
  const roleLabel = organization.roleLabel || "Roles";

  const iconBuilding = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
  const iconCalendar = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  const iconDesignations = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>;
  const iconUsers = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  const iconImpersonate = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;

  const iconIndicator = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/></svg>;
  const iconTag = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
  const iconCoverage = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;

  const orgLinks = canManageOrg ? [
    { id: "organization", label: "Organization", icon: iconBuilding },
    { id: "shift-categories", label: "Shift Categories", icon: iconTag },
    { id: "shift-codes", label: "Schedule Codes", icon: iconCalendar },
    { id: "coverage", label: "Coverage", icon: iconCoverage },
    { id: "indicators", label: "Indicators", icon: iconIndicator },
    { id: "staff-config", label: "Designations", icon: iconDesignations },
    ...(isSuperAdmin ? [{ id: "users", label: "User Management", icon: iconUsers }] : []),
  ] : [];

  const gridmasterLinks = isGridmaster ? [
    { id: "impersonation", label: "Impersonation", icon: iconImpersonate },
  ] : [];

  const allLinks = [...orgLinks, ...gridmasterLinks];

  // Register sub-nav items for the mobile bottom sheet
  const subNavItems: SubNavItem[] = useMemo(
    () =>
      allLinks.map((link) => ({
        id: link.id,
        label: link.label,
        icon: link.icon,
        href: link.id === defaultSection ? "/settings" : `/settings/${link.id}`,
        active: activeSection === link.id,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSection, canManageOrg, isSuperAdmin, isGridmaster],
  );
  useSetMobileSubNav(subNavItems);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={handleSidebarOpenChange}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", height: "calc(100dvh - 56px)", width: "100%", overflow: "hidden", position: "relative" }}>
        {/* Sidebar — hidden on mobile (shown in bottom sheet), visible on desktop/tablet */}
        {!isMobile && (
          <Sidebar collapsible="icon" className="border-r border-[var(--color-border)] bg-[var(--color-surface)]" style={{ top: 56, height: "calc(100dvh - 56px)" }}>
            <SidebarContent className="pt-4">
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {allLinks.map((link) => (
                      <SidebarMenuItem key={link.id}>
                        <SidebarMenuButton
                          render={<Link href={link.id === defaultSection ? "/settings" : `/settings/${link.id}`} replace />}
                          isActive={activeSection === link.id}
                          tooltip={link.label}
                          className="h-9 data-[active=true]:bg-[var(--color-info-bg)] data-[active=true]:text-[var(--color-brand)] hover:bg-[var(--color-bg-secondary)] transition-all ease-in-out duration-150"
                        >
                          <span className={activeSection === link.id ? "text-[var(--color-today-text)] flex shrink-0 items-center justify-center transition-colors" : "text-[var(--color-text-faint)] flex shrink-0 items-center justify-center transition-colors"}>
                            {link.icon}
                          </span>
                          <span className="font-semibold">{link.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleSidebarOpenChange(!sidebarOpen)}
                    tooltip={sidebarOpen ? "Collapse Menu" : "Expand Menu"}
                    className="h-9 text-[var(--color-text-faint)] hover:text-black hover:bg-[var(--color-bg-secondary)] transition-all ease-in-out duration-150"
                  >
                    <span className="flex shrink-0 items-center justify-center">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: sidebarOpen ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}>
                        <polyline points="13 17 18 12 13 7" />
                        <polyline points="6 17 11 12 6 7" />
                      </svg>
                    </span>
                    <span className="font-semibold ml-2">Collapse Menu</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
          </Sidebar>
        )}

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0, height: "100%", overflowY: "auto", padding: isMobile ? "16px" : isTablet ? "24px" : "32px 40px", display: "flex", flexDirection: "column" as const, alignItems: "center" }}>

        {(() => {
          const title = allLinks.find(l => l.id === activeSection)?.label;
          return title ? (
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 20px", width: "100%", maxWidth: activeSection === "users" ? 1100 : 860 }}>
              {title}
            </h1>
          ) : null;
        })()}

        {activeSection === "organization" && canManageOrg && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%", maxWidth: 860 }}>
            {isSuperAdmin && (
              <Section title="Organization Details">
                <OrganizationDetailsSettings
                  organization={organization}
                  onSave={onOrganizationSave}
                  canManageOrgSettings={canManageOrgSettings}
                />
              </Section>
            )}
            {(isSuperAdmin || canManageOrgLabels) && (
              <Section title="Custom Labels">
                <OrganizationLabelsSettings
                  organization={organization}
                  onSave={onOrganizationSave}
                  canManageOrgLabels={canManageOrgLabels}
                />
              </Section>
            )}
            <Section title={focusAreaLabel} noPadding>
              <FocusAreasSettings
                focusAreas={focusAreas}
                orgId={organization.id}
                label={focusAreaLabel.replace(/s$/, "")}
                onChange={onFocusAreasChange}
                canManageFocusAreas={canManageFocusAreas}
              />
            </Section>
          </div>
        )}

        {activeSection === "shift-categories" && canManageOrg && (
          <div style={{ width: "100%", maxWidth: 860 }}>
            <ShiftCategoriesSettings
              shiftCategories={shiftCategories}
              focusAreas={focusAreas}
              orgId={organization.id}
              onChange={onShiftCategoriesChange}
              canManageShiftCodes={canManageShiftCodes}
            />
          </div>
        )}

        {activeSection === "shift-codes" && canManageOrg && (
          <div style={{ width: "100%", maxWidth: 860 }}>
            <ShiftCodesSettings
              shiftCodes={shiftCodes}
              focusAreas={focusAreas}
              shiftCategories={shiftCategories}
              orgId={organization.id}
              certifications={certifications}
              certificationLabel={certificationLabel}
              focusAreaLabel={focusAreaLabel}
              onChange={onShiftCodesChange}
              canManageShiftCodes={canManageShiftCodes}
              absenceTypes={absenceTypes}
              onAbsenceTypesChange={onAbsenceTypesChange}
            />
          </div>
        )}

        {activeSection === "coverage" && canManageOrg && (
          <div style={{ width: "100%", maxWidth: 860 }}>
            <CoverageRequirementsSettings
              orgId={organization.id}
              focusAreas={focusAreas}
              shiftCategories={shiftCategories}
              shiftCodes={shiftCodes}
              coverageRequirements={coverageRequirements}
              onCoverageRequirementsChange={onCoverageRequirementsChange}
              canEdit={canManageCoverageRequirements}
            />
          </div>
        )}

        {activeSection === "indicators" && canManageOrg && (
          <div style={{ width: "100%", maxWidth: 860 }}>
            <IndicatorTypesSettings
              indicatorTypes={indicatorTypes}
              orgId={organization.id}
              onChange={onIndicatorTypesChange}
              canManageIndicatorTypes={canManageIndicatorTypes}
            />
          </div>
        )}

        {activeSection === "staff-config" && canManageOrg && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%", maxWidth: 860 }}>
            <Section title={certificationLabel} noPadding>
              <StringListSettings
                label={`Define the ${certificationLabel.toLowerCase()} available when adding or editing staff. These also determine the order in which they appear in dropdowns.`}
                items={certifications}
                placeholder="e.g. RN"
                onSave={async (updated) => {
                  try {
                    const saved = await db.saveCertifications(organization.id, updated, certifications);
                    onCertificationsChange(saved);
                    toast.success("Certifications saved");
                  } catch (err) {
                    toast.error("Failed to save certifications");
                    throw err;
                  }
                }}
                canEdit={canManageOrgLabels}
              />
            </Section>
            <Section title={roleLabel} noPadding>
              <StringListSettings
                label={`Define the ${roleLabel.toLowerCase()} available when adding or editing staff. These also determine the order in which they appear in dropdowns.`}
                items={orgRoles}
                placeholder="e.g. Charge Nurse"
                onSave={async (updated) => {
                  try {
                    const saved = await db.saveOrganizationRoles(organization.id, updated, orgRoles);
                    onOrgRolesChange(saved);
                    toast.success("Roles saved");
                  } catch (err) {
                    toast.error("Failed to save roles");
                    throw err;
                  }
                }}
                canEdit={canManageOrgLabels}
              />
            </Section>
          </div>
        )}

        {activeSection === "users" && isSuperAdmin && (
          <div style={{ width: "100%", maxWidth: 1100 }}>
            <UserManagementSettings orgId={organization.id} isSuperAdmin={isSuperAdmin} />
          </div>
        )}

        {activeSection === "impersonation" && isGridmaster && (
          <div style={{ width: "100%", maxWidth: 860 }}>
            <ImpersonationPanel />
          </div>
        )}

        {allLinks.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "60px 20px", color: "var(--color-text-muted)", fontSize: "var(--dg-fs-label)", textAlign: "center", gap: 12,
          }}>
            <span style={{ fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-secondary)" }}>No access</span>
            <span>You don't have permission to view settings. Contact your organization admin for access.</span>
          </div>
        )}
      </div>
    </div>
    </SidebarProvider>
  );
}

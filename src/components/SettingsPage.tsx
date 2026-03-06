"use client";

import { useState, useCallback } from "react";
import { Organization, Wing, ShiftType } from "@/types";
import * as db from "@/lib/db";

interface SettingsPageProps {
  organization: Organization;
  wings: Wing[];
  shiftTypes: ShiftType[];
  onOrgSave: (org: Organization) => void;
  onWingsChange: (wings: Wing[]) => void;
  onShiftTypesChange: (types: ShiftType[]) => void;
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid var(--color-border)",
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
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

// ── Organization Settings ─────────────────────────────────────────────────────
function OrgSettings({ organization, onSave }: { organization: Organization; onSave: (o: Organization) => void }) {
  const [form, setForm] = useState({
    name: organization.name,
    address: organization.address,
    phone: organization.phone,
    employeeCount: organization.employeeCount?.toString() ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isModified =
    form.name !== organization.name ||
    form.address !== organization.address ||
    form.phone !== organization.phone ||
    (form.employeeCount || "") !== (organization.employeeCount?.toString() ?? "");

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const updated: Organization = {
        ...organization,
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        employeeCount: form.employeeCount ? parseInt(form.employeeCount) : null,
      };
      await db.updateOrganization(updated);
      onSave(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [form, organization, onSave]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div>
        <label style={labelStyle}>ORGANIZATION NAME</label>
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
          onChange={(e) => setForm((p) => ({ ...p, employeeCount: e.target.value }))}
          placeholder="e.g. 28"
          style={inputStyle}
        />
      </div>
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={handleSave}
          disabled={!isModified || saving}
          style={{
            background: isModified ? "var(--color-accent-gradient)" : "#ccc",
            border: "none", color: "#fff", borderRadius: 8,
            padding: "9px 20px", fontSize: 13, fontWeight: 700,
            cursor: isModified ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span style={{ fontSize: 13, color: "#16A34A", fontWeight: 600 }}>Saved!</span>
        )}
      </div>
    </div>
  );
}

// ── Wing row ──────────────────────────────────────────────────────────────────
function WingRow({
  wing,
  orgId,
  onSaved,
  onDeleted,
}: {
  wing: Wing & { isNew?: boolean };
  orgId: string;
  onSaved: (w: Wing) => void;
  onDeleted: (id: number) => void;
}) {
  const [form, setForm] = useState({
    name: wing.name,
    colorBg: wing.colorBg,
    colorText: wing.colorText,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isModified =
    form.name !== wing.name ||
    form.colorBg !== wing.colorBg ||
    form.colorText !== wing.colorText;

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const saved = await db.upsertWing({
        id: wing.isNew ? undefined : wing.id,
        orgId,
        name: form.name.trim(),
        colorBg: form.colorBg,
        colorText: form.colorText,
        sortOrder: wing.sortOrder,
      });
      onSaved(saved);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [form, wing, orgId, onSaved]);

  const handleDelete = useCallback(async () => {
    if (wing.isNew) { onDeleted(wing.id); return; }
    setDeleting(true);
    try {
      await db.deleteWing(wing.id);
      onDeleted(wing.id);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  }, [wing, onDeleted]);

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
        placeholder="Wing name"
        style={{ ...inputStyle }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <label style={{ ...labelStyle, marginBottom: 2 }}>BG COLOR</label>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="color"
            value={form.colorBg}
            onChange={(e) => setForm((p) => ({ ...p, colorBg: e.target.value }))}
            style={{ width: 32, height: 28, border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer", padding: 2 }}
          />
          <span
            style={{
              display: "inline-block", padding: "2px 8px", borderRadius: 20,
              background: form.colorBg, color: form.colorText, fontSize: 11, fontWeight: 600,
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
          onChange={(e) => setForm((p) => ({ ...p, colorText: e.target.value }))}
          style={{ width: 32, height: 28, border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer", padding: 2 }}
        />
      </div>
      <button
        onClick={handleSave}
        disabled={!isModified || saving}
        style={{
          background: isModified ? "var(--color-accent-gradient)" : "#ccc",
          border: "none", color: "#fff", borderRadius: 7,
          padding: "7px 14px", fontSize: 12, fontWeight: 700,
          cursor: isModified ? "pointer" : "not-allowed", whiteSpace: "nowrap",
        }}
      >
        {saving ? "…" : "Save"}
      </button>
      <button
        onClick={handleDelete}
        disabled={deleting}
        style={{
          background: "none", border: "1px solid #FEE2E2", borderRadius: 7,
          color: "#EF4444", padding: "7px 12px", fontSize: 12, fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {deleting ? "…" : "Delete"}
      </button>
    </div>
  );
}

// ── Wings Settings ────────────────────────────────────────────────────────────
function WingsSettings({
  wings,
  orgId,
  onChange,
}: {
  wings: Wing[];
  orgId: string;
  onChange: (wings: Wing[]) => void;
}) {
  const [localWings, setLocalWings] = useState<(Wing & { isNew?: boolean })[]>(wings);
  let nextTmpId = -1;

  const handleAdd = () => {
    const tmp: Wing & { isNew: boolean } = {
      id: nextTmpId--,
      orgId,
      name: "",
      colorBg: "#F1F5F9",
      colorText: "#475569",
      sortOrder: localWings.length,
      isNew: true,
    };
    setLocalWings((prev) => [...prev, tmp]);
  };

  const handleSaved = (saved: Wing) => {
    setLocalWings((prev) => prev.map((w) => (w.name === saved.name || w.id === saved.id ? saved : w)));
    onChange(localWings.map((w) => (w.name === saved.name || w.id === saved.id ? saved : w)));
  };

  const handleDeleted = (id: number) => {
    const updated = localWings.filter((w) => w.id !== id);
    setLocalWings(updated);
    onChange(updated);
  };

  return (
    <div>
      <div style={{ marginBottom: 4 }}>
        {localWings.map((wing) => (
          <WingRow
            key={wing.id}
            wing={wing}
            orgId={orgId}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        ))}
      </div>
      <button
        onClick={handleAdd}
        style={{
          marginTop: 12, background: "none", border: "1.5px dashed var(--color-border)",
          borderRadius: 8, color: "var(--color-text-muted)", padding: "8px 16px",
          fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%",
        }}
      >
        + Add Wing
      </button>
    </div>
  );
}

// ── Shift Type row ────────────────────────────────────────────────────────────
function ShiftTypeRow({
  st,
  wings,
  orgId,
  onSaved,
  onDeleted,
}: {
  st: ShiftType & { isNew?: boolean };
  wings: Wing[];
  orgId: string;
  onSaved: (s: ShiftType) => void;
  onDeleted: (id: number) => void;
}) {
  const [form, setForm] = useState({
    label: st.label,
    name: st.name,
    color: st.color === "transparent" ? "#F8FAFC" : st.color,
    border: st.border === "transparent" ? "#CBD5E1" : st.border,
    text: st.text === "transparent" ? "#64748B" : st.text,
    countsTowardDay: st.countsTowardDay ?? false,
    countsTowardEve: st.countsTowardEve ?? false,
    countsTowardNight: st.countsTowardNight ?? false,
    isOrientation: st.isOrientation ?? false,
    isGeneral: st.isGeneral ?? false,
    wingName: st.wingName ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(!!st.isNew);

  const handleSave = useCallback(async () => {
    if (!form.label.trim() || !form.name.trim()) return;
    setSaving(true);
    try {
      const saved = await db.upsertShiftType({
        id: st.isNew ? undefined : st.id,
        orgId,
        label: form.label.trim(),
        name: form.name.trim(),
        color: form.color,
        border: form.border,
        text: form.text,
        countsTowardDay: form.countsTowardDay,
        countsTowardEve: form.countsTowardEve,
        countsTowardNight: form.countsTowardNight,
        isOrientation: form.isOrientation,
        isGeneral: form.isGeneral,
        wingName: form.wingName || null,
        sortOrder: st.sortOrder,
      });
      onSaved(saved);
      setExpanded(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [form, st, orgId, onSaved]);

  const handleDelete = useCallback(async () => {
    if (st.isNew) { onDeleted(st.id); return; }
    setDeleting(true);
    try {
      await db.deleteShiftType(st.id);
      onDeleted(st.id);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  }, [st, onDeleted]);

  return (
    <div style={{ borderBottom: "1px solid var(--color-border-light)" }}>
      {/* Collapsed row */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 0", cursor: "pointer",
        }}
        onClick={() => setExpanded((e) => !e)}
      >
        <span
          style={{
            display: "inline-block", minWidth: 44, padding: "3px 8px",
            background: form.color, border: `1.5px solid ${form.border}`,
            color: form.text, borderRadius: 6, fontSize: 12, fontWeight: 700, textAlign: "center",
          }}
        >
          {form.label || "…"}
        </span>
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)", flex: 1 }}>
          {form.name || "—"}
        </span>
        {form.wingName && (
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{form.wingName}</span>
        )}
        {form.isGeneral && (
          <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>General</span>
        )}
        <span style={{ fontSize: 14, color: "var(--color-text-faint)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
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
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>CODE / LABEL</label>
              <input
                value={form.label}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                placeholder="e.g. D"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>FULL NAME</label>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Day Shift"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Colors */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>BACKGROUND</label>
              <input type="color" value={form.color}
                onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                style={{ width: "100%", height: 34, border: "1px solid var(--color-border)", borderRadius: 7, cursor: "pointer", padding: 2 }}
              />
            </div>
            <div>
              <label style={labelStyle}>BORDER</label>
              <input type="color" value={form.border}
                onChange={(e) => setForm((p) => ({ ...p, border: e.target.value }))}
                style={{ width: "100%", height: 34, border: "1px solid var(--color-border)", borderRadius: 7, cursor: "pointer", padding: 2 }}
              />
            </div>
            <div>
              <label style={labelStyle}>TEXT</label>
              <input type="color" value={form.text}
                onChange={(e) => setForm((p) => ({ ...p, text: e.target.value }))}
                style={{ width: "100%", height: 34, border: "1px solid var(--color-border)", borderRadius: 7, cursor: "pointer", padding: 2 }}
              />
            </div>
          </div>

          {/* Preview */}
          <div>
            <label style={labelStyle}>PREVIEW</label>
            <span
              style={{
                display: "inline-block", padding: "5px 12px",
                background: form.color, border: `1.5px solid ${form.border}`,
                color: form.text, borderRadius: 8, fontSize: 13, fontWeight: 700,
              }}
            >
              {form.label || "Label"} — {form.name || "Name"}
            </span>
          </div>

          {/* Wing association */}
          <div>
            <label style={labelStyle}>ASSOCIATED WING (leave blank for general)</label>
            <select
              value={form.wingName}
              onChange={(e) => setForm((p) => ({ ...p, wingName: e.target.value }))}
              style={{ ...inputStyle }}
            >
              <option value="">— General shift —</option>
              {wings.map((w) => (
                <option key={w.id} value={w.name}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* Flags */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {([
              ["countsTowardDay", "Counts toward Day"],
              ["countsTowardEve", "Counts toward Eve"],
              ["countsTowardNight", "Counts toward Night"],
              ["isOrientation", "Orientation shift"],
              ["isGeneral", "Show in General section"],
            ] as const).map(([key, label]) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                background: "var(--color-accent-gradient)", border: "none", color: "#fff",
                borderRadius: 7, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setExpanded(false)}
              style={{
                background: "var(--color-border-light)", border: "none", borderRadius: 7,
                color: "var(--color-text-muted)", padding: "8px 14px", fontSize: 13, cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                background: "none", border: "1px solid #FEE2E2", borderRadius: 7,
                color: "#EF4444", padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              {deleting ? "…" : "Delete"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shift Types Settings ──────────────────────────────────────────────────────
function ShiftTypesSettings({
  shiftTypes,
  wings,
  orgId,
  onChange,
}: {
  shiftTypes: ShiftType[];
  wings: Wing[];
  orgId: string;
  onChange: (types: ShiftType[]) => void;
}) {
  const [local, setLocal] = useState<(ShiftType & { isNew?: boolean })[]>(shiftTypes);
  let nextTmpId = -1;

  const handleAdd = () => {
    const tmp: ShiftType & { isNew: boolean } = {
      id: nextTmpId--,
      orgId,
      label: "",
      name: "",
      color: "#F8FAFC",
      border: "#CBD5E1",
      text: "#64748B",
      sortOrder: local.length,
      isNew: true,
    };
    setLocal((prev) => [...prev, tmp]);
  };

  const handleSaved = (saved: ShiftType) => {
    const updated = local.map((s) =>
      s.label === saved.label || s.id === saved.id ? saved : s
    );
    setLocal(updated);
    onChange(updated);
  };

  const handleDeleted = (id: number) => {
    const updated = local.filter((s) => s.id !== id);
    setLocal(updated);
    onChange(updated);
  };

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 0, marginBottom: 12 }}>
        Click any row to expand and edit. The label (code) is used in the schedule grid.
      </p>
      {local.map((st) => (
        <ShiftTypeRow
          key={st.id}
          st={st}
          wings={wings}
          orgId={orgId}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      ))}
      <button
        onClick={handleAdd}
        style={{
          marginTop: 12, background: "none", border: "1.5px dashed var(--color-border)",
          borderRadius: 8, color: "var(--color-text-muted)", padding: "8px 16px",
          fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%",
        }}
      >
        + Add Shift Type
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SettingsPage({
  organization,
  wings,
  shiftTypes,
  onOrgSave,
  onWingsChange,
  onShiftTypesChange,
}: SettingsPageProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <Section title="Organization Details">
        <OrgSettings organization={organization} onSave={onOrgSave} />
      </Section>

      <Section title="Wings">
        <WingsSettings wings={wings} orgId={organization.id} onChange={onWingsChange} />
      </Section>

      <Section title="Shift Types">
        <ShiftTypesSettings
          shiftTypes={shiftTypes}
          wings={wings}
          orgId={organization.id}
          onChange={onShiftTypesChange}
        />
      </Section>
    </div>
  );
}

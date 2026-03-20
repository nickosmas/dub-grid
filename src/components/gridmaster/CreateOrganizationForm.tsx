"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createOrganization, assignOrgRoleByEmail } from "@/lib/db";
import type { Organization } from "@/types";
import CustomSelect from "@/components/CustomSelect";
import { BOX_SHADOW_CARD } from "@/lib/constants";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Phoenix",
  "America/Indiana/Indianapolis",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--color-text-subtle)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 6,
  display: "block",
};

const sectionStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  overflow: "hidden",
  boxShadow: BOX_SHADOW_CARD,
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: "14px 20px",
  borderBottom: "1px solid var(--color-border-light)",
  fontWeight: 700,
  fontSize: 14,
  color: "var(--color-text-secondary)",
};

const sectionBodyStyle: React.CSSProperties = { padding: 20 };

export default function CreateOrganizationForm({
  onCreated,
  onCancel,
}: {
  onCreated: (organization: Organization) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("");
  const [focusAreaLabel, setFocusAreaLabel] = useState("Focus Areas");
  const [certificationLabel, setCertificationLabel] = useState("Certifications");
  const [roleLabel, setRoleLabel] = useState("Roles");
  const [superAdminEmail, setSuperAdminEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);

  function handleNameChange(val: string) {
    setName(val);
    if (!slugTouched) setSlug(slugify(val));
  }

  async function validateSlug(s: string): Promise<boolean> {
    if (!s) return false;
    try {
      const res = await fetch(`/api/validate-domain?slug=${encodeURIComponent(s)}`);
      const json = await res.json();
      return json.valid === true;
    } catch {
      return false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setSlugError(null);

    try {
      // Validate slug if provided
      if (slug.trim()) {
        const valid = await validateSlug(slug.trim());
        if (!valid) {
          setSlugError("This slug is already taken or invalid");
          setSaving(false);
          return;
        }
      }

      const organization = await createOrganization({
        name: name.trim(),
        slug: slug.trim() || null,
        address: address.trim(),
        phone: phone.trim(),
        employeeCount: null,
        focusAreaLabel: focusAreaLabel.trim() || "Focus Areas",
        certificationLabel: certificationLabel.trim() || "Certifications",
        roleLabel: roleLabel.trim() || "Roles",
        timezone: timezone || null,
      });

      // Seed super admin if email provided
      if (superAdminEmail.trim()) {
        try {
          await assignOrgRoleByEmail(organization.id, superAdminEmail.trim(), "super_admin");
          toast.success(`Organization created and ${superAdminEmail.trim()} assigned as super admin`);
        } catch (err: any) {
          toast.success("Organization created");
          toast.error(`Failed to assign super admin: ${err.message}`);
        }
      } else {
        toast.success("Organization created");
      }

      onCreated(organization);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create organization");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 680 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-primary)" }}>
          Create Organization
        </h2>
        <button type="button" className="dg-btn dg-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {/* Organization Details */}
      <div style={{ ...sectionStyle, marginBottom: 20 }}>
        <div style={sectionHeaderStyle}>Organization Details</div>
        <div style={sectionBodyStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>Organization Name *</label>
              <input
                className="dg-input"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Acme Healthcare"
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Slug</label>
              <input
                className={`dg-input${slugError ? " dg-input-error" : ""}`}
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); setSlugError(null); }}
                placeholder="acme-healthcare"
              />
              {slugError && (
                <span style={{ fontSize: 11, color: "var(--color-danger)", marginTop: 4, display: "block" }}>
                  {slugError}
                </span>
              )}
            </div>
            <div>
              <label style={labelStyle}>Address</label>
              <input
                className="dg-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St, City, ST"
              />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input
                className="dg-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Timezone</label>
              <CustomSelect
                value={timezone}
                options={[
                  { value: "", label: "Select timezone…" },
                  ...TIMEZONES.map((tz) => ({ value: tz, label: tz })),
                ]}
                onChange={setTimezone}
                style={{ width: "100%" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Custom Labels */}
      <div style={{ ...sectionStyle, marginBottom: 20 }}>
        <div style={sectionHeaderStyle}>Custom Labels</div>
        <div style={sectionBodyStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>Focus Areas Label</label>
              <input
                className="dg-input"
                value={focusAreaLabel}
                onChange={(e) => setFocusAreaLabel(e.target.value)}
                placeholder="Focus Areas"
              />
            </div>
            <div>
              <label style={labelStyle}>Certifications Label</label>
              <input
                className="dg-input"
                value={certificationLabel}
                onChange={(e) => setCertificationLabel(e.target.value)}
                placeholder="Certifications"
              />
            </div>
            <div>
              <label style={labelStyle}>Roles Label</label>
              <input
                className="dg-input"
                value={roleLabel}
                onChange={(e) => setRoleLabel(e.target.value)}
                placeholder="Roles"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Seed Super Admin */}
      <div style={{ ...sectionStyle, marginBottom: 24 }}>
        <div style={sectionHeaderStyle}>Seed Super Admin (Optional)</div>
        <div style={sectionBodyStyle}>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--color-text-muted)" }}>
            Assign an existing user as the organization super admin. The user must already have a Supabase account.
          </p>
          <label style={labelStyle}>Super Admin Email</label>
          <input
            className="dg-input"
            type="email"
            value={superAdminEmail}
            onChange={(e) => setSuperAdminEmail(e.target.value)}
            placeholder="admin@example.com"
            style={{ maxWidth: 400 }}
          />
        </div>
      </div>

      {/* Submit */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="submit"
          className="dg-btn dg-btn-primary"
          disabled={saving || !name.trim()}
        >
          {saving ? "Creating…" : "Create Organization"}
        </button>
        <button type="button" className="dg-btn dg-btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

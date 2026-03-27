"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  createOrganization,
  assignOrgRoleByEmail,
  sendInvitation,
  insertEmployee,
  upsertFocusArea,
  saveCertifications,
  saveOrganizationRoles,
} from "@/lib/db";
import type { Organization, AssignableOrganizationRole } from "@/types";
import CustomSelect from "@/components/CustomSelect";
import { sectionStyle, sectionHeaderStyle, sectionBodyStyle, labelStyle } from "@/lib/styles";
import { RESERVED_SUBDOMAINS } from "@/lib/subdomain";

// ── Constants ─────────────────────────────────────────────────────────────────

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

const STEPS = [
  { key: "details", label: "Details" },
  { key: "super-admin", label: "Super Admin" },
  { key: "decision", label: "" },
  { key: "config", label: "Config" },
  { key: "employees", label: "Employees" },
  { key: "invitations", label: "Invitations" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

const COLOR_PRESETS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
  "#14B8A6", "#E11D48", "#0EA5E9", "#A855F7", "#22C55E",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface FocusAreaRow {
  name: string;
  colorBg: string;
}

interface NamedItemRow {
  name: string;
  abbr: string;
}

interface EmployeeRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface CreatedEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface InvitationRow {
  employeeId: string;
  name: string;
  email: string;
  selected: boolean;
  role: AssignableOrganizationRole;
}

// ── Stepper Bar ───────────────────────────────────────────────────────────────

function WizardStepper({ currentStep, orgCreated }: { currentStep: StepKey; orgCreated: boolean }) {
  const visibleSteps = STEPS.filter((s) => s.key !== "decision");
  const currentIdx = visibleSteps.findIndex((s) => s.key === currentStep);
  // Decision step maps to between super-admin and config
  const effectiveIdx = currentStep === "decision" ? 2 : currentIdx;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24 }}>
      {visibleSteps.map((step, idx) => {
        const isPhase2 = idx >= 2;
        const isActive = idx === effectiveIdx;
        const isComplete = idx < effectiveIdx;
        const isDimmed = isPhase2 && !orgCreated && !isActive;

        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center", flex: idx < visibleSteps.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  fontSize: "var(--dg-fs-footnote)",
                  fontWeight: 700,
                  background: isActive
                    ? "var(--color-primary)"
                    : isComplete
                      ? "var(--color-success)"
                      : "var(--color-bg-secondary)",
                  color: isActive || isComplete ? "#fff" : "var(--color-text-muted)",
                  opacity: isDimmed ? 0.4 : 1,
                  transition: "all 200ms ease",
                }}
              >
                {isComplete ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
              <span
                style={{
                  fontSize: "var(--dg-fs-label)",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  opacity: isDimmed ? 0.4 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {step.label}
              </span>
            </div>
            {idx < visibleSteps.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: isComplete ? "var(--color-success)" : "var(--color-border-light)",
                  margin: "0 12px",
                  opacity: isDimmed ? 0.3 : 1,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────

export default function OrganizationSetupWizard({
  onCreated,
  onCancel,
}: {
  onCreated: (organization: Organization) => void;
  onCancel: () => void;
}) {
  // ── Wizard state ──────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState<StepKey>("details");
  const [saving, setSaving] = useState(false);
  const [createdOrg, setCreatedOrg] = useState<Organization | null>(null);

  // ── Step 1: Org Details ───────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [focusAreaLabel, setFocusAreaLabel] = useState("Focus Areas");
  const [certificationLabel, setCertificationLabel] = useState("Certifications");
  const [roleLabel, setRoleLabel] = useState("Roles");
  const [slugError, setSlugError] = useState<string | null>(null);

  // ── Step 2: Super Admin ───────────────────────────────────────────────────
  const [superAdminFirstName, setSuperAdminFirstName] = useState("");
  const [superAdminLastName, setSuperAdminLastName] = useState("");
  const [superAdminEmail, setSuperAdminEmail] = useState("");
  const [superAdminPhone, setSuperAdminPhone] = useState("");
  const [pendingInvite, setPendingInvite] = useState<{ token: string; email: string; name: string } | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  // ── Step 3: Config ────────────────────────────────────────────────────────
  const [focusAreas, setFocusAreas] = useState<FocusAreaRow[]>([{ name: "", colorBg: COLOR_PRESETS[0] }]);
  const [certifications, setCertifications] = useState<NamedItemRow[]>([{ name: "", abbr: "" }]);
  const [orgRoles, setOrgRoles] = useState<NamedItemRow[]>([{ name: "", abbr: "" }]);

  // ── Step 4: Employees ─────────────────────────────────────────────────────
  const [employeeRows, setEmployeeRows] = useState<EmployeeRow[]>(
    Array.from({ length: 5 }, () => ({ firstName: "", lastName: "", email: "", phone: "" })),
  );
  // ── Step 5: Invitations ───────────────────────────────────────────────────
  const [invitationRows, setInvitationRows] = useState<InvitationRow[]>([]);

  // ── Slug helpers ──────────────────────────────────────────────────────────

  function handleNameChange(val: string) {
    setName(val);
    if (!slugTouched) setSlug(slugify(val));
  }

  async function validateSlug(s: string): Promise<boolean> {
    if (!s) return false;
    if (RESERVED_SUBDOMAINS.has(s) || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(s)) return false;
    try {
      const res = await fetch(`/api/validate-domain?slug=${encodeURIComponent(s)}`);
      const json = await res.json();
      return json.valid === false;
    } catch {
      return false;
    }
  }

  // ── Step 1 → Step 2 ──────────────────────────────────────────────────────

  const handleDetailsNext = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    setSlugError(null);

    try {
      if (slug.trim()) {
        const valid = await validateSlug(slug.trim());
        if (!valid) {
          setSlugError("This slug is already taken or invalid");
          setSaving(false);
          return;
        }
      }
      setCurrentStep("super-admin");
    } finally {
      setSaving(false);
    }
  }, [name, slug]);

  // ── Step 2 → Create org + Decision ────────────────────────────────────────

  const handleSuperAdminNext = useCallback(async () => {
    setSaving(true);
    try {
      const org = await createOrganization({
        name: name.trim(),
        slug: slug.trim() || null,
        address: address.trim(),
        phone: phone.trim(),
        employeeCount: employeeCount ? parseInt(employeeCount, 10) : null,
        focusAreaLabel: focusAreaLabel.trim() || "Focus Areas",
        certificationLabel: certificationLabel.trim() || "Certifications",
        roleLabel: roleLabel.trim() || "Roles",
        timezone: timezone || null,
      });

      setCreatedOrg(org);

      // Assign or invite super admin
      if (superAdminEmail.trim() && superAdminFirstName.trim() && superAdminLastName.trim()) {
        const email = superAdminEmail.trim();
        const firstName = superAdminFirstName.trim();
        const lastName = superAdminLastName.trim();
        const saPhone = superAdminPhone.trim();
        const displayName = `${firstName} ${lastName}`;

        // Create employee record for the super admin
        let employeeId: string | undefined;
        try {
          const emp = await insertEmployee({
            firstName,
            lastName,
            email,
            phone: saPhone,
            seniority: 0,
            certificationId: null,
            roleIds: [],
            focusAreaIds: [],
            contactNotes: "",
            status: "active",
            statusChangedAt: null,
            statusNote: "",
            userId: null,
          }, org.id);
          employeeId = emp.id;
        } catch (empErr: unknown) {
          console.error("Failed to create employee for super admin:", empErr);
          // Non-blocking — continue with assignment/invitation without employee link
        }

        let assigned = false;

        // Try direct assignment (works if user already has a Supabase account)
        try {
          await assignOrgRoleByEmail(org.id, email, "super_admin");
          assigned = true;
          toast.success(`Organization created & ${displayName} assigned as super admin`);
        } catch {
          // User doesn't exist yet — fall through to invitation
        }

        // If direct assignment failed, create an invitation record (email not sent yet)
        if (!assigned) {
          try {
            const invResult = await sendInvitation(email, "admin", org.id, employeeId);
            setPendingInvite({ token: invResult.token, email, name: displayName });
            toast.success("Organization created & invitation ready");
            toast.info("Send the invitation email from the next screen.");
          } catch (invErr: unknown) {
            toast.success("Organization created");
            toast.error(`Failed to create invitation: ${invErr instanceof Error ? invErr.message : "Unknown error"}`);
          }
        }
      } else {
        toast.success("Organization created");
      }

      setCurrentStep("decision");
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) ?? "Failed to create organization");
    } finally {
      setSaving(false);
    }
  }, [name, slug, address, phone, employeeCount, focusAreaLabel, certificationLabel, roleLabel, timezone, superAdminFirstName, superAdminLastName, superAdminEmail, superAdminPhone]);

  // ── Step 3: Save config ───────────────────────────────────────────────────

  const handleConfigNext = useCallback(async () => {
    if (!createdOrg) return;
    setSaving(true);
    try {
      // Save focus areas
      const validFocusAreas = focusAreas.filter((fa) => fa.name.trim());
      for (let i = 0; i < validFocusAreas.length; i++) {
        const fa = validFocusAreas[i];
        await upsertFocusArea({
          orgId: createdOrg.id,
          name: fa.name.trim(),
          colorBg: fa.colorBg,
          colorText: "#FFFFFF",
          sortOrder: i,
          breakMinutes: 0,
        });
      }

      // Save certifications
      const validCerts = certifications.filter((c) => c.name.trim());
      if (validCerts.length > 0) {
        await saveCertifications(
          createdOrg.id,
          validCerts.map((c, i) => ({
            id: 0,
            orgId: createdOrg.id,
            name: c.name.trim(),
            abbr: c.abbr.trim() || c.name.trim().slice(0, 4).toUpperCase(),
            sortOrder: i,
          })),
          [],
        );
      }

      // Save org roles
      const validRoles = orgRoles.filter((r) => r.name.trim());
      if (validRoles.length > 0) {
        await saveOrganizationRoles(
          createdOrg.id,
          validRoles.map((r, i) => ({
            id: 0,
            orgId: createdOrg.id,
            name: r.name.trim(),
            abbr: r.abbr.trim() || r.name.trim().slice(0, 4).toUpperCase(),
            sortOrder: i,
          })),
          [],
        );
      }

      const savedCount = validFocusAreas.length + validCerts.length + validRoles.length;
      if (savedCount > 0) toast.success(`Saved ${savedCount} configuration items`);
      setCurrentStep("employees");
    } catch (err: unknown) {
      toast.error(`Failed to save configuration: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }, [createdOrg, focusAreas, certifications, orgRoles]);

  // ── Step 4: Save employees ────────────────────────────────────────────────

  const handleEmployeesNext = useCallback(async () => {
    if (!createdOrg) return;
    setSaving(true);
    try {
      const validRows = employeeRows.filter((r) => r.firstName.trim());
      const created: CreatedEmployee[] = [];

      for (const row of validRows) {
        const emp = await insertEmployee(
          {
            firstName: row.firstName.trim(),
            lastName: row.lastName.trim(),
            email: row.email.trim(),
            phone: row.phone.trim(),
            seniority: created.length + 1,
            certificationId: null,
            roleIds: [],
            focusAreaIds: [],
            contactNotes: "",
            status: "active" as const,
            statusChangedAt: null,
            statusNote: "",
            userId: null,
          },
          createdOrg.id,
        );
        created.push({
          id: emp.id,
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: emp.email,
        });
      }

      // Build invitation rows for employees with emails
      const withEmail = created.filter((e) => e.email);
      setInvitationRows(
        withEmail.map((e) => ({
          employeeId: e.id,
          name: `${e.firstName} ${e.lastName}`.trim(),
          email: e.email,
          selected: true,
          role: "user" as AssignableOrganizationRole,
        })),
      );

      if (created.length > 0) toast.success(`Created ${created.length} employee${created.length !== 1 ? "s" : ""}`);

      if (withEmail.length > 0) {
        setCurrentStep("invitations");
      } else {
        // No employees with emails — finish
        toast.success("Setup complete");
        onCreated(createdOrg);
      }
    } catch (err: unknown) {
      toast.error(`Failed to create employees: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }, [createdOrg, employeeRows, onCreated]);

  // ── Step 5: Send invitations ──────────────────────────────────────────────

  const handleInvitationsFinish = useCallback(async () => {
    if (!createdOrg) return;
    const selected = invitationRows.filter((r) => r.selected);
    if (selected.length === 0) {
      onCreated(createdOrg);
      return;
    }

    setSaving(true);
    let sentCount = 0;
    let failCount = 0;

    try {
      for (const inv of selected) {
        try {
          const result = await sendInvitation(inv.email, inv.role, createdOrg.id, inv.employeeId);
          // Send email
          try {
            await fetch("/api/send-invite-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token: result.token,
                email: inv.email,
                orgName: createdOrg.name,
              }),
            });
          } catch {
            // Invitation created but email failed — still count as sent
          }
          sentCount++;
        } catch {
          failCount++;
        }
      }

      if (sentCount > 0) toast.success(`Sent ${sentCount} invitation${sentCount !== 1 ? "s" : ""}`);
      if (failCount > 0) toast.error(`${failCount} invitation${failCount !== 1 ? "s" : ""} failed`);

      onCreated(createdOrg);
    } finally {
      setSaving(false);
    }
  }, [createdOrg, invitationRows, onCreated]);

  // ── Row helpers ───────────────────────────────────────────────────────────

  function addFocusAreaRow() {
    setFocusAreas((prev) => [...prev, { name: "", colorBg: COLOR_PRESETS[prev.length % COLOR_PRESETS.length] }]);
  }

  function updateFocusArea(idx: number, updates: Partial<FocusAreaRow>) {
    setFocusAreas((prev) => prev.map((fa, i) => (i === idx ? { ...fa, ...updates } : fa)));
  }

  function removeFocusArea(idx: number) {
    setFocusAreas((prev) => prev.filter((_, i) => i !== idx));
  }

  function addNamedItemRow(setter: React.Dispatch<React.SetStateAction<NamedItemRow[]>>) {
    setter((prev) => [...prev, { name: "", abbr: "" }]);
  }

  function updateNamedItem(setter: React.Dispatch<React.SetStateAction<NamedItemRow[]>>, idx: number, updates: Partial<NamedItemRow>) {
    setter((prev) => prev.map((item, i) => (i === idx ? { ...item, ...updates } : item)));
  }

  function removeNamedItem(setter: React.Dispatch<React.SetStateAction<NamedItemRow[]>>, idx: number) {
    setter((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateEmployeeRow(idx: number, updates: Partial<EmployeeRow>) {
    setEmployeeRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...updates } : r)));
  }

  function removeEmployeeRow(idx: number) {
    setEmployeeRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function addEmployeeRows(count: number) {
    setEmployeeRows((prev) => [
      ...prev,
      ...Array.from({ length: count }, () => ({ firstName: "", lastName: "", email: "", phone: "" })),
    ]);
  }

  // ── Action bar ────────────────────────────────────────────────────────────

  function ActionBar({ children }: { children: React.ReactNode }) {
    return (
      <div style={{ display: "flex", gap: 8, marginTop: 24, justifyContent: "flex-end" }}>
        {children}
      </div>
    );
  }

  // ── Render: Step 1 — Details ──────────────────────────────────────────────

  function renderDetails() {
    return (
      <>
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
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setSlugTouched(true);
                    setSlugError(null);
                  }}
                  placeholder="acme-healthcare"
                />
                {slugError && (
                  <span style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-danger)", marginTop: 4, display: "block" }}>
                    {slugError}
                  </span>
                )}
              </div>
              <div>
                <label style={labelStyle}>Address</label>
                <input className="dg-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, City, ST" />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input className="dg-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
              </div>
              <div>
                <label style={labelStyle}>Timezone</label>
                <CustomSelect
                  value={timezone}
                  options={[{ value: "", label: "Select timezone…" }, ...TIMEZONES.map((tz) => ({ value: tz, label: tz }))]}
                  onChange={setTimezone}
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label style={labelStyle}>Employee Count</label>
                <input
                  className="dg-input"
                  type="number"
                  min={0}
                  value={employeeCount}
                  onChange={(e) => setEmployeeCount(e.target.value)}
                  placeholder="e.g. 50"
                />
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>Custom Labels</div>
          <div style={sectionBodyStyle}>
            <p style={{ margin: "0 0 12px", fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
              Customize terminology used throughout the app for this organization.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>Focus Areas Label</label>
                <input className="dg-input" value={focusAreaLabel} onChange={(e) => setFocusAreaLabel(e.target.value)} placeholder="Focus Areas" />
              </div>
              <div>
                <label style={labelStyle}>Certifications Label</label>
                <input className="dg-input" value={certificationLabel} onChange={(e) => setCertificationLabel(e.target.value)} placeholder="Certifications" />
              </div>
              <div>
                <label style={labelStyle}>Roles Label</label>
                <input className="dg-input" value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} placeholder="Roles" />
              </div>
            </div>
          </div>
        </div>

        <ActionBar>
          <button type="button" className="dg-btn dg-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="dg-btn dg-btn-primary"
            disabled={saving || !name.trim()}
            onClick={handleDetailsNext}
          >
            {saving ? "Validating…" : "Next"}
          </button>
        </ActionBar>
      </>
    );
  }

  // ── Render: Step 2 — Super Admin ──────────────────────────────────────────

  function renderSuperAdmin() {
    return (
      <>
        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>Super Admin Setup</div>
          <div style={sectionBodyStyle}>
            <p style={{ margin: "0 0 16px", fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
              Assign a super admin who will own this organization. They will have full control over settings, users, and configuration.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 500 }}>
              <div>
                <label style={labelStyle}>First Name *</label>
                <input
                  className="dg-input"
                  value={superAdminFirstName}
                  onChange={(e) => setSuperAdminFirstName(e.target.value)}
                  placeholder="Jane"
                />
              </div>
              <div>
                <label style={labelStyle}>Last Name *</label>
                <input
                  className="dg-input"
                  value={superAdminLastName}
                  onChange={(e) => setSuperAdminLastName(e.target.value)}
                  placeholder="Doe"
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Email *</label>
                <input
                  className="dg-input"
                  type="email"
                  value={superAdminEmail}
                  onChange={(e) => setSuperAdminEmail(e.target.value)}
                  placeholder="jane@example.com"
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Phone</label>
                <input
                  className="dg-input"
                  type="tel"
                  value={superAdminPhone}
                  onChange={(e) => setSuperAdminPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
            {superAdminEmail.trim() && (
              <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)", marginTop: 8, display: "block", maxWidth: 500 }}>
                If this user doesn&apos;t have an account yet, an invitation will be created. You can send the email on the next screen.
              </span>
            )}
          </div>
        </div>

        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>Summary</div>
          <div style={sectionBodyStyle}>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: "var(--dg-fs-label)" }}>
              <span style={{ fontWeight: 600, color: "var(--color-text-muted)" }}>Organization</span>
              <span style={{ color: "var(--color-text-primary)" }}>{name}</span>
              {slug && (
                <>
                  <span style={{ fontWeight: 600, color: "var(--color-text-muted)" }}>Slug</span>
                  <span style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-dm-mono), monospace" }}>{slug}</span>
                </>
              )}
              {timezone && (
                <>
                  <span style={{ fontWeight: 600, color: "var(--color-text-muted)" }}>Timezone</span>
                  <span style={{ color: "var(--color-text-primary)" }}>{timezone}</span>
                </>
              )}
              {superAdminFirstName.trim() && superAdminLastName.trim() && (
                <>
                  <span style={{ fontWeight: 600, color: "var(--color-text-muted)" }}>Super Admin</span>
                  <span style={{ color: "var(--color-text-primary)" }}>{superAdminFirstName.trim()} {superAdminLastName.trim()}</span>
                </>
              )}
              {superAdminEmail.trim() && (
                <>
                  <span style={{ fontWeight: 600, color: "var(--color-text-muted)" }}>Email</span>
                  <span style={{ color: "var(--color-text-primary)" }}>{superAdminEmail}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <ActionBar>
          <button type="button" className="dg-btn dg-btn-ghost" onClick={() => setCurrentStep("details")}>
            Back
          </button>
          <button
            type="button"
            className="dg-btn dg-btn-primary"
            disabled={saving || !superAdminFirstName.trim() || !superAdminLastName.trim() || !superAdminEmail.trim()}
            onClick={handleSuperAdminNext}
          >
            {saving ? "Creating…" : "Create Organization"}
          </button>
        </ActionBar>
      </>
    );
  }

  // ── Render: Decision Point ────────────────────────────────────────────────

  async function handleSendPendingEmail() {
    if (!pendingInvite || !createdOrg) return;
    setSendingEmail(true);
    try {
      const res = await fetch("/api/send-invite-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: pendingInvite.token,
          email: pendingInvite.email,
          orgName: createdOrg.name,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? "Failed to send email");
      }
      toast.success(`Invitation email sent to ${pendingInvite.name}`);
      setPendingInvite(null);
    } catch (err: unknown) {
      toast.error(`Failed to send email: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSendingEmail(false);
    }
  }

  function renderDecision() {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 0" }}>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--color-success)",
              display: "grid",
              placeItems: "center",
              margin: "0 auto 20px",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{ margin: "0 0 8px", fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-primary)" }}>
            Organization Created
          </h2>
          <p style={{ margin: "0 0 24px", fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-muted)" }}>
            {createdOrg?.name} is ready.
          </p>
        </div>

        {/* Pending invitation email prompt */}
        {pendingInvite && (
          <div
            style={{
              ...sectionStyle,
              marginBottom: 24,
              border: "1px solid var(--color-warning, #F59E0B)",
            }}
          >
            <div style={{ ...sectionBodyStyle, display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "var(--dg-fs-body-sm)", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>
                  Invitation ready for {pendingInvite.name} ({pendingInvite.email})
                </div>
                <div style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
                  They will join as admin. You can promote them to super admin after they accept.
                </div>
              </div>
              <button
                type="button"
                className="dg-btn dg-btn-primary"
                disabled={sendingEmail}
                onClick={handleSendPendingEmail}
                style={{ whiteSpace: "nowrap" }}
              >
                {sendingEmail ? "Sending…" : "Send Email"}
              </button>
            </div>
          </div>
        )}

        <div style={{ textAlign: "center" }}>
          <p style={{ margin: "0 0 24px", fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-muted)" }}>
            Would you like to continue setting up configuration, employees, and invitations?
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              type="button"
              className="dg-btn dg-btn-secondary"
              style={{ padding: "12px 24px" }}
              onClick={() => createdOrg && onCreated(createdOrg)}
            >
              Finish — Go to Organization
            </button>
            <button
              type="button"
              className="dg-btn dg-btn-primary"
              style={{ padding: "12px 24px" }}
              onClick={() => setCurrentStep("config")}
            >
              Continue Setup
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Step 3 — Configuration ────────────────────────────────────────

  function renderConfig() {
    return (
      <>
        {/* Focus Areas */}
        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>{focusAreaLabel}</div>
          <div style={sectionBodyStyle}>
            <p style={{ margin: "0 0 12px", fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
              Departments, wings, or units that employees are assigned to.
            </p>
            {focusAreas.map((fa, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input
                  type="color"
                  value={fa.colorBg}
                  onChange={(e) => updateFocusArea(idx, { colorBg: e.target.value })}
                  style={{ width: 36, height: 36, border: "1px solid var(--color-border)", borderRadius: 6, cursor: "pointer", padding: 2 }}
                />
                <input
                  className="dg-input"
                  value={fa.name}
                  onChange={(e) => updateFocusArea(idx, { name: e.target.value })}
                  placeholder={`${focusAreaLabel.replace(/s$/, "")} name`}
                  style={{ flex: 1 }}
                />
                {focusAreas.length > 1 && (
                  <button type="button" className="dg-btn dg-btn-ghost" onClick={() => removeFocusArea(idx)} style={{ padding: "6px 8px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="dg-btn dg-btn-ghost" onClick={addFocusAreaRow} style={{ fontSize: "var(--dg-fs-label)" }}>
              + Add {focusAreaLabel.replace(/s$/, "").toLowerCase()}
            </button>
          </div>
        </div>

        {/* Certifications */}
        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>{certificationLabel}</div>
          <div style={sectionBodyStyle}>
            <p style={{ margin: "0 0 12px", fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
              Skill levels or designations that employees can hold.
            </p>
            {certifications.map((cert, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input
                  className="dg-input"
                  value={cert.name}
                  onChange={(e) => updateNamedItem(setCertifications, idx, { name: e.target.value })}
                  placeholder="e.g. Registered Nurse"
                  style={{ flex: 2 }}
                />
                <input
                  className="dg-input"
                  value={cert.abbr}
                  onChange={(e) => updateNamedItem(setCertifications, idx, { abbr: e.target.value })}
                  placeholder="e.g. RN"
                  style={{ flex: 1, maxWidth: 100 }}
                />
                {certifications.length > 1 && (
                  <button type="button" className="dg-btn dg-btn-ghost" onClick={() => removeNamedItem(setCertifications, idx)} style={{ padding: "6px 8px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="dg-btn dg-btn-ghost" onClick={() => addNamedItemRow(setCertifications)} style={{ fontSize: "var(--dg-fs-label)" }}>
              + Add {certificationLabel.replace(/s$/, "").toLowerCase()}
            </button>
          </div>
        </div>

        {/* Org Roles */}
        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>{roleLabel}</div>
          <div style={sectionBodyStyle}>
            <p style={{ margin: "0 0 12px", fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
              Configurable display roles for employees (not to be confused with access roles).
            </p>
            {orgRoles.map((role, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input
                  className="dg-input"
                  value={role.name}
                  onChange={(e) => updateNamedItem(setOrgRoles, idx, { name: e.target.value })}
                  placeholder="e.g. Charge Nurse"
                  style={{ flex: 2 }}
                />
                <input
                  className="dg-input"
                  value={role.abbr}
                  onChange={(e) => updateNamedItem(setOrgRoles, idx, { abbr: e.target.value })}
                  placeholder="e.g. CN"
                  style={{ flex: 1, maxWidth: 100 }}
                />
                {orgRoles.length > 1 && (
                  <button type="button" className="dg-btn dg-btn-ghost" onClick={() => removeNamedItem(setOrgRoles, idx)} style={{ padding: "6px 8px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="dg-btn dg-btn-ghost" onClick={() => addNamedItemRow(setOrgRoles)} style={{ fontSize: "var(--dg-fs-label)" }}>
              + Add {roleLabel.replace(/s$/, "").toLowerCase()}
            </button>
          </div>
        </div>

        <ActionBar>
          <button type="button" className="dg-btn dg-btn-ghost" onClick={() => setCurrentStep("employees")}>
            Skip
          </button>
          <button type="button" className="dg-btn dg-btn-primary" disabled={saving} onClick={handleConfigNext}>
            {saving ? "Saving…" : "Next"}
          </button>
        </ActionBar>
      </>
    );
  }

  // ── Render: Step 4 — Employees ────────────────────────────────────────────

  function renderEmployees() {
    const validCount = employeeRows.filter((r) => r.firstName.trim()).length;

    return (
      <>
        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>
            Add Employees
            {validCount > 0 && (
              <span style={{ fontWeight: 500, color: "var(--color-text-muted)", marginLeft: 8 }}>
                ({validCount} ready)
              </span>
            )}
          </div>
          <div style={sectionBodyStyle}>
            <p style={{ margin: "0 0 16px", fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
              Add your staff members. At minimum, provide a first name. Email is needed if you want to invite them in the next step.
            </p>

            {/* Header */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 32px", gap: 8, marginBottom: 4 }}>
              <span style={{ ...labelStyle, marginBottom: 0 }}>First Name *</span>
              <span style={{ ...labelStyle, marginBottom: 0 }}>Last Name</span>
              <span style={{ ...labelStyle, marginBottom: 0 }}>Email</span>
              <span style={{ ...labelStyle, marginBottom: 0 }}>Phone</span>
              <span />
            </div>

            {/* Rows */}
            {employeeRows.map((row, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 32px", gap: 8, marginBottom: 6 }}>
                <input className="dg-input" value={row.firstName} onChange={(e) => updateEmployeeRow(idx, { firstName: e.target.value })} placeholder="John" />
                <input className="dg-input" value={row.lastName} onChange={(e) => updateEmployeeRow(idx, { lastName: e.target.value })} placeholder="Doe" />
                <input className="dg-input" type="email" value={row.email} onChange={(e) => updateEmployeeRow(idx, { email: e.target.value })} placeholder="john@example.com" />
                <input className="dg-input" value={row.phone} onChange={(e) => updateEmployeeRow(idx, { phone: e.target.value })} placeholder="(555) 123-4567" />
                <button
                  type="button"
                  className="dg-btn dg-btn-ghost"
                  onClick={() => removeEmployeeRow(idx)}
                  style={{ padding: "6px", opacity: employeeRows.length > 1 ? 1 : 0.3 }}
                  disabled={employeeRows.length <= 1}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}

            <button type="button" className="dg-btn dg-btn-ghost" onClick={() => addEmployeeRows(5)} style={{ fontSize: "var(--dg-fs-label)", marginTop: 8 }}>
              + Add 5 more rows
            </button>
          </div>
        </div>

        <ActionBar>
          <button type="button" className="dg-btn dg-btn-ghost" onClick={() => {
            if (createdOrg) { toast.success("Setup complete"); onCreated(createdOrg); }
          }}>
            Skip
          </button>
          <button
            type="button"
            className="dg-btn dg-btn-primary"
            disabled={saving || validCount === 0}
            onClick={handleEmployeesNext}
          >
            {saving ? "Creating…" : `Create ${validCount} Employee${validCount !== 1 ? "s" : ""}`}
          </button>
        </ActionBar>
      </>
    );
  }

  // ── Render: Step 5 — Invitations ──────────────────────────────────────────

  function renderInvitations() {
    const selectedCount = invitationRows.filter((r) => r.selected).length;
    const allSelected = invitationRows.length > 0 && selectedCount === invitationRows.length;

    return (
      <>
        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>
            Send Invitations
            {selectedCount > 0 && (
              <span style={{ fontWeight: 500, color: "var(--color-text-muted)", marginLeft: 8 }}>
                ({selectedCount} selected)
              </span>
            )}
          </div>
          <div style={sectionBodyStyle}>
            <p style={{ margin: "0 0 16px", fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
              Select employees to invite. They will receive an email with a link to set their password and join the organization.
            </p>

            {invitationRows.length === 0 ? (
              <p style={{ color: "var(--color-text-muted)", fontSize: "var(--dg-fs-label)" }}>
                No employees with email addresses to invite.
              </p>
            ) : (
              <>
                {/* Select all */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => {
                      setInvitationRows((prev) => prev.map((r) => ({ ...r, selected: e.target.checked })));
                    }}
                    style={{ accentColor: "var(--color-primary)" }}
                  />
                  Select All
                </label>

                {/* Header */}
                <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 120px", gap: 8, marginBottom: 4 }}>
                  <span />
                  <span style={{ ...labelStyle, marginBottom: 0 }}>Name</span>
                  <span style={{ ...labelStyle, marginBottom: 0 }}>Email</span>
                  <span style={{ ...labelStyle, marginBottom: 0 }}>Role</span>
                </div>

                {invitationRows.map((inv, idx) => (
                  <div
                    key={inv.employeeId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "32px 1fr 1fr 120px",
                      gap: 8,
                      marginBottom: 6,
                      alignItems: "center",
                      padding: "6px 0",
                      opacity: inv.selected ? 1 : 0.5,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={inv.selected}
                      onChange={(e) => {
                        setInvitationRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, selected: e.target.checked } : r)),
                        );
                      }}
                      style={{ accentColor: "var(--color-primary)" }}
                    />
                    <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 500, color: "var(--color-text-primary)" }}>
                      {inv.name}
                    </span>
                    <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
                      {inv.email}
                    </span>
                    <CustomSelect
                      value={inv.role}
                      options={[
                        { value: "user", label: "User" },
                        { value: "admin", label: "Admin" },
                      ]}
                      onChange={(val) => {
                        setInvitationRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, role: val as AssignableOrganizationRole } : r)),
                        );
                      }}
                      style={{ width: "100%" }}
                    />
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <ActionBar>
          <button
            type="button"
            className="dg-btn dg-btn-ghost"
            onClick={() => createdOrg && onCreated(createdOrg)}
          >
            Skip
          </button>
          <button
            type="button"
            className="dg-btn dg-btn-primary"
            disabled={saving || selectedCount === 0}
            onClick={handleInvitationsFinish}
          >
            {saving ? "Sending…" : `Send ${selectedCount} Invitation${selectedCount !== 1 ? "s" : ""} & Finish`}
          </button>
        </ActionBar>
      </>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-primary)" }}>
          {currentStep === "decision" ? "Organization Created" : "Create Organization"}
        </h2>
        {currentStep !== "decision" && (
          <button type="button" className="dg-btn dg-btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>

      <WizardStepper currentStep={currentStep} orgCreated={!!createdOrg} />

      {currentStep === "details" && renderDetails()}
      {currentStep === "super-admin" && renderSuperAdmin()}
      {currentStep === "decision" && renderDecision()}
      {currentStep === "config" && renderConfig()}
      {currentStep === "employees" && renderEmployees()}
      {currentStep === "invitations" && renderInvitations()}
    </div>
  );
}

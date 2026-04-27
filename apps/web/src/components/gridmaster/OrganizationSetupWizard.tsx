"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import type { Organization, AssignableOrganizationRole } from "@/types";
import CustomSelect from "@/components/CustomSelect";
import OrganizationLocationFields from "@/components/organization/OrganizationLocationFields";
import { withComposedOrganizationAddress } from "@/lib/organization-profile";
import {
  sectionStyle,
  sectionHeaderStyle,
  sectionBodyStyle,
  labelStyle,
} from "@/lib/styles";
import { formatTimezoneLabel } from "@/lib/timezones";
import { RESERVED_SUBDOMAINS } from "@/lib/subdomain";
import { ActionBar } from "./organization-setup/ActionBar";
import { COLOR_PRESETS, type StepKey } from "./organization-setup/constants";
import { slugify } from "./organization-setup/helpers";
import {
  createOrganizationEmployees,
  createOrganizationSetup,
  saveOrganizationSetupConfig,
  sendInvitationEmail,
  sendOrganizationInvitations,
  validateOrganizationSlug,
} from "./organization-setup/persistence";
import {
  type DeptRow,
  type EmployeeRow,
  type FocusAreaRow,
  type InvitationRow,
  type JobRow,
  type NamedItemRow,
  type PendingInvite,
  type ShiftCatRow,
} from "./organization-setup/types";
import { WizardStepper } from "./organization-setup/WizardStepper";

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
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("");
  const [focusAreaLabel, setFocusAreaLabel] = useState("Focus Areas");
  const [certificationLabel, setCertificationLabel] =
    useState("Certifications");
  const [roleLabel, setRoleLabel] = useState("Roles");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [createdEmployeeCount, setCreatedEmployeeCount] = useState(0);

  // ── Step 2: Super Admin ───────────────────────────────────────────────────
  const [superAdminFirstName, setSuperAdminFirstName] = useState("");
  const [superAdminLastName, setSuperAdminLastName] = useState("");
  const [superAdminEmail, setSuperAdminEmail] = useState("");
  const [superAdminPhone, setSuperAdminPhone] = useState("");
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  // ── Step 3: Config ────────────────────────────────────────────────────────
  const [shiftDisplayMode, setShiftDisplayMode] = useState<"code" | "name">(
    "code",
  );
  const [departments, setDepartments] = useState<DeptRow[]>([
    { id: crypto.randomUUID(), name: "", abbr: "", type: "scheduled" },
  ]);
  const [focusAreas, setFocusAreas] = useState<FocusAreaRow[]>([
    { id: crypto.randomUUID(), name: "" },
  ]);
  const [certifications, setCertifications] = useState<NamedItemRow[]>([
    { id: crypto.randomUUID(), name: "", abbr: "" },
  ]);
  const [orgRoles, setOrgRoles] = useState<NamedItemRow[]>([
    { id: crypto.randomUUID(), name: "", abbr: "" },
  ]);
  const [shiftCategories, setShiftCategories] = useState<ShiftCatRow[]>([
    {
      id: crypto.randomUUID(),
      name: "",
      startTime: "",
      endTime: "",
    },
  ]);
  const [jobs, setJobs] = useState<JobRow[]>([
    { id: crypto.randomUUID(), label: "", name: "", color: COLOR_PRESETS[0] },
  ]);

  // ── Step 4: Employees ─────────────────────────────────────────────────────
  const [employeeRows, setEmployeeRows] = useState<EmployeeRow[]>(
    Array.from({ length: 5 }, () => ({
      id: crypto.randomUUID(),
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
    })),
  );
  // ── Step 5: Invitations ───────────────────────────────────────────────────
  const [invitationRows, setInvitationRows] = useState<InvitationRow[]>([]);

  // ── Slug helpers ──────────────────────────────────────────────────────────

  function handleNameChange(val: string) {
    setName(val);
    if (!slugTouched) setSlug(slugify(val));
  }

  // ── Step 1 → Step 2 ──────────────────────────────────────────────────────

  const handleDetailsNext = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    setSlugError(null);

    try {
      if (slug.trim()) {
        const normalizedSlug = slug.trim();
        const valid =
          !RESERVED_SUBDOMAINS.has(normalizedSlug) &&
          /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(normalizedSlug) &&
          (await validateOrganizationSlug(normalizedSlug));
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
      const { org, superAdmin } = await createOrganizationSetup({
        name,
        slug,
        addressLine1,
        addressLine2,
        addressCity,
        addressState,
        addressPostalCode,
        addressCountry,
        phone,
        timezone,
        focusAreaLabel,
        certificationLabel,
        roleLabel,
        shiftDisplayMode,
        superAdminFirstName,
        superAdminLastName,
        superAdminEmail,
        superAdminPhone,
      });
      setCreatedOrg(org);
      if (superAdmin.kind === "assigned") {
        toast.success(
          `Organization created & ${superAdmin.displayName} assigned as super admin`,
        );
      } else if (superAdmin.kind === "pending-invite") {
        setPendingInvite(superAdmin.pendingInvite);
        toast.success("Organization created & invitation ready");
        toast.info("Send the invitation email from the next screen.");
      } else if (superAdmin.kind === "invite-error") {
        toast.success("Organization created");
        toast.error(`Failed to create invitation: ${superAdmin.message}`);
      } else {
        toast.success("Organization created");
      }

      setCurrentStep("decision");
    } catch (err: unknown) {
      toast.error(
        (err instanceof Error ? err.message : null) ??
          "Failed to create organization",
      );
    } finally {
      setSaving(false);
    }
  }, [
    name,
    slug,
    addressLine1,
    addressLine2,
    addressCity,
    addressState,
    addressPostalCode,
    addressCountry,
    phone,
    focusAreaLabel,
    certificationLabel,
    roleLabel,
    timezone,
    shiftDisplayMode,
    superAdminFirstName,
    superAdminLastName,
    superAdminEmail,
    superAdminPhone,
  ]);

  // ── Step 3: Save config ───────────────────────────────────────────────────

  const handleConfigNext = useCallback(async () => {
    if (!createdOrg) return;
    setSaving(true);
    try {
      const savedCount = await saveOrganizationSetupConfig({
        createdOrg,
        shiftDisplayMode,
        departments,
        focusAreas,
        certifications,
        orgRoles,
        shiftCategories,
        jobs,
      });

      if (savedCount > 0) {
        toast.success(`Saved ${savedCount} configuration items`);
      }
      setCurrentStep("employees");
    } catch (err: unknown) {
      toast.error(
        `Failed to save configuration: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setSaving(false);
    }
  }, [
    createdOrg,
    shiftDisplayMode,
    departments,
    focusAreas,
    certifications,
    orgRoles,
    shiftCategories,
    jobs,
  ]);

  // ── Step 4: Save employees ────────────────────────────────────────────────

  const handleEmployeesNext = useCallback(async () => {
    if (!createdOrg) return;
    setSaving(true);
    try {
      const created = await createOrganizationEmployees(createdOrg, employeeRows);

      // Build invitation rows for employees with emails
      const withEmail = created.filter((e) => e.email);
      setCreatedEmployeeCount(created.length);
      setInvitationRows(
        withEmail.map((e) => ({
          employeeId: e.id,
          name: `${e.firstName} ${e.lastName}`.trim(),
          email: e.email,
          selected: true,
          role: "user" as AssignableOrganizationRole,
        })),
      );

      if (created.length > 0)
        toast.success(
          `Created ${created.length} employee${created.length !== 1 ? "s" : ""}`,
        );

      if (withEmail.length > 0) {
        setCurrentStep("invitations");
      } else {
        // No employees with emails — finish
        toast.success("Setup complete");
        onCreated(createdOrg);
      }
    } catch (err: unknown) {
      toast.error(
        `Failed to create employees: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
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

    try {
      const { sentCount, failCount } = await sendOrganizationInvitations(
        createdOrg,
        selected,
      );

      if (sentCount > 0)
        toast.success(
          `Sent ${sentCount} invitation${sentCount !== 1 ? "s" : ""}`,
        );
      if (failCount > 0)
        toast.error(
          `${failCount} invitation${failCount !== 1 ? "s" : ""} failed`,
        );

      onCreated(createdOrg);
    } finally {
      setSaving(false);
    }
  }, [createdOrg, invitationRows, onCreated]);

  // ── Row helpers ───────────────────────────────────────────────────────────

  function addFocusAreaRow() {
    setFocusAreas((prev) => [...prev, { id: crypto.randomUUID(), name: "" }]);
  }

  function updateFocusArea(idx: number, updates: Partial<FocusAreaRow>) {
    setFocusAreas((prev) =>
      prev.map((fa, i) => (i === idx ? { ...fa, ...updates } : fa)),
    );
  }

  function removeFocusArea(idx: number) {
    setFocusAreas((prev) => prev.filter((_, i) => i !== idx));
  }

  function addNamedItemRow(
    setter: React.Dispatch<React.SetStateAction<NamedItemRow[]>>,
  ) {
    setter((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", abbr: "" },
    ]);
  }

  function updateNamedItem(
    setter: React.Dispatch<React.SetStateAction<NamedItemRow[]>>,
    idx: number,
    updates: Partial<NamedItemRow>,
  ) {
    setter((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, ...updates } : item)),
    );
  }

  function removeNamedItem(
    setter: React.Dispatch<React.SetStateAction<NamedItemRow[]>>,
    idx: number,
  ) {
    setter((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateEmployeeRow(idx: number, updates: Partial<EmployeeRow>) {
    setEmployeeRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...updates } : r)),
    );
  }

  function removeEmployeeRow(idx: number) {
    setEmployeeRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function addEmployeeRows(count: number) {
    setEmployeeRows((prev) => [
      ...prev,
      ...Array.from({ length: count }, () => ({
        id: crypto.randomUUID(),
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
      })),
    ]);
  }

  // ── Render: Step 1 — Details ──────────────────────────────────────────────

  function renderDetails() {
    return (
      <>
        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>Organization Details</div>
          <div style={sectionBodyStyle}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 16,
              }}
            >
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
                  <span
                    style={{
                      fontSize: "var(--dg-fs-footnote)",
                      color: "var(--color-danger)",
                      marginTop: 4,
                      display: "block",
                    }}
                  >
                    {slugError}
                  </span>
                )}
              </div>
            </div>
            <OrganizationLocationFields
              value={{
                phone,
                timezone,
                addressLine1,
                addressLine2,
                addressCity,
                addressState,
                addressPostalCode,
                addressCountry,
              }}
              onChange={(patch) => {
                if (patch.phone !== undefined) setPhone(patch.phone);
                if (patch.timezone !== undefined) setTimezone(patch.timezone);
                if (patch.addressLine1 !== undefined) setAddressLine1(patch.addressLine1);
                if (patch.addressLine2 !== undefined) setAddressLine2(patch.addressLine2);
                if (patch.addressCity !== undefined) setAddressCity(patch.addressCity);
                if (patch.addressState !== undefined) setAddressState(patch.addressState);
                if (patch.addressPostalCode !== undefined) setAddressPostalCode(patch.addressPostalCode);
                if (patch.addressCountry !== undefined) setAddressCountry(patch.addressCountry);
              }}
              showEmployeeCount={false}
              gridTemplateColumns="1fr 1fr"
            />
          </div>
        </div>

        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>Custom Labels</div>
          <div style={sectionBodyStyle}>
            <p
              style={{
                margin: "0 0 12px",
                fontSize: "var(--dg-fs-label)",
                color: "var(--color-text-muted)",
              }}
            >
              Customize terminology used throughout the app for this
              organization.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 16,
              }}
            >
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

        <ActionBar>
          <button
            type="button"
            className="dg-btn dg-btn-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="dg-btn dg-btn-brand"
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
    const summaryAddress = withComposedOrganizationAddress({
      addressLine1,
      addressLine2,
      addressCity,
      addressState,
      addressPostalCode,
      addressCountry,
    }).address;

    return (
      <>
        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>Super Admin Setup</div>
          <div style={sectionBodyStyle}>
            <p
              style={{
                margin: "0 0 16px",
                fontSize: "var(--dg-fs-label)",
                color: "var(--color-text-muted)",
              }}
            >
              Assign a super admin who will own this organization. They will
              have full control over settings, users, and configuration.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                maxWidth: 500,
              }}
            >
              <div>
                <label style={labelStyle}>
                  First Name <span style={{ color: "var(--color-danger)" }}>*</span>
                </label>
                <input
                  className="dg-input"
                  value={superAdminFirstName}
                  onChange={(e) => setSuperAdminFirstName(e.target.value)}
                  placeholder="Jane"
                />
              </div>
              <div>
                <label style={labelStyle}>
                  Last Name <span style={{ color: "var(--color-danger)" }}>*</span>
                </label>
                <input
                  className="dg-input"
                  value={superAdminLastName}
                  onChange={(e) => setSuperAdminLastName(e.target.value)}
                  placeholder="Doe"
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>
                  Email <span style={{ color: "var(--color-danger)" }}>*</span>
                </label>
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
              <span
                style={{
                  fontSize: "var(--dg-fs-label)",
                  color: "var(--color-text-muted)",
                  marginTop: 8,
                  display: "block",
                  maxWidth: 500,
                }}
              >
                If this user doesn&apos;t have an account yet, an invitation
                will be created. You can send the email on the next screen.
              </span>
            )}
          </div>
        </div>

        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>Summary</div>
          <div style={sectionBodyStyle}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "8px 16px",
                fontSize: "var(--dg-fs-label)",
              }}
            >
              <span
                style={{ fontWeight: 600, color: "var(--color-text-muted)" }}
              >
                Organization
              </span>
              <span style={{ color: "var(--color-text-primary)" }}>{name}</span>
              {slug && (
                <>
                  <span
                    style={{
                      fontWeight: 600,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Slug
                  </span>
                  <span
                    style={{
                      color: "var(--color-text-primary)",
                      fontFamily: "var(--font-dm-mono), monospace",
                    }}
                  >
                    {slug}
                  </span>
                </>
              )}
              {timezone && (
                <>
                  <span
                    style={{
                      fontWeight: 600,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Timezone
                  </span>
                  <span style={{ color: "var(--color-text-primary)" }}>
                    {formatTimezoneLabel(timezone)} · {timezone}
                  </span>
                </>
              )}
              {summaryAddress && (
                <>
                  <span
                    style={{
                      fontWeight: 600,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Address
                  </span>
                  <span style={{ color: "var(--color-text-primary)" }}>
                    {summaryAddress}
                  </span>
                </>
              )}
              {superAdminFirstName.trim() && superAdminLastName.trim() && (
                <>
                  <span
                    style={{
                      fontWeight: 600,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Super Admin
                  </span>
                  <span style={{ color: "var(--color-text-primary)" }}>
                    {superAdminFirstName.trim()} {superAdminLastName.trim()}
                  </span>
                </>
              )}
              {superAdminEmail.trim() && (
                <>
                  <span
                    style={{
                      fontWeight: 600,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Email
                  </span>
                  <span style={{ color: "var(--color-text-primary)" }}>
                    {superAdminEmail}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <ActionBar>
          <button
            type="button"
            className="dg-btn dg-btn-ghost"
            onClick={() => setCurrentStep("details")}
          >
            Back
          </button>
          <button
            type="button"
            className="dg-btn dg-btn-brand"
            disabled={
              saving ||
              !superAdminFirstName.trim() ||
              !superAdminLastName.trim() ||
              !superAdminEmail.trim()
            }
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
      await sendInvitationEmail({
        token: pendingInvite.token,
        email: pendingInvite.email,
        orgName: createdOrg.name,
      });
      toast.success(`Invitation email sent to ${pendingInvite.name}`);
      setPendingInvite(null);
    } catch (err: unknown) {
      toast.error(
        `Failed to send email: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
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
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2
            style={{
              margin: "0 0 8px",
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            Organization Created
          </h2>
          <p
            style={{
              margin: "0 0 24px",
              fontSize: "var(--dg-fs-body-sm)",
              color: "var(--color-text-muted)",
            }}
          >
            {createdOrg?.name} is ready.
          </p>
        </div>

        {/* Pending invitation email prompt */}
        {pendingInvite && (
          <div
            style={{
              ...sectionStyle,
              marginBottom: 24,
              border: "1px solid var(--color-warning)",
            }}
          >
            <div
              style={{
                ...sectionBodyStyle,
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: "var(--dg-fs-body-sm)",
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                    marginBottom: 4,
                  }}
                >
                  Invitation ready for {pendingInvite.name} (
                  {pendingInvite.email})
                </div>
                <div
                  style={{
                    fontSize: "var(--dg-fs-label)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  They will join as admin. You can promote them to super admin
                  after they accept.
                </div>
              </div>
              <button
                type="button"
                className="dg-btn dg-btn-brand"
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
          <p
            style={{
              margin: "0 0 24px",
              fontSize: "var(--dg-fs-body-sm)",
              color: "var(--color-text-muted)",
            }}
          >
            Would you like to continue setting up configuration, employees, and
            invitations?
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
              className="dg-btn dg-btn-brand"
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
        {/* Display Mode */}
        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>Shift Display Mode</div>
          <div style={sectionBodyStyle}>
            <p
              style={{
                margin: "0 0 12px",
                fontSize: "var(--dg-fs-label)",
                color: "var(--color-text-muted)",
              }}
            >
              How shifts appear on the schedule grid.
            </p>
            <div style={{ display: "flex", gap: 16 }}>
              {(
                [
                  ["code", "Code", "D"],
                  ["name", "Full Name", "Day Shift"],
                ] as const
              ).map(([value, label, example]) => (
                <label
                  key={value}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 16px",
                    borderRadius: 8,
                    border: `2px solid ${shiftDisplayMode === value ? "var(--color-primary)" : "var(--color-border)"}`,
                    background:
                      shiftDisplayMode === value
                        ? "var(--color-primary-bg)"
                        : "transparent",
                    cursor: "pointer",
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 500,
                  }}
                >
                  <input
                    type="radio"
                    name="displayMode"
                    value={value}
                    checked={shiftDisplayMode === value}
                    onChange={() => setShiftDisplayMode(value)}
                    style={{ accentColor: "var(--color-primary)" }}
                  />
                  <span>
                    <span style={{ color: "var(--color-text-primary)" }}>
                      {label}
                    </span>
                    <span
                      style={{
                        color: "var(--color-text-muted)",
                        marginLeft: 6,
                      }}
                    >
                      ({example})
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Departments */}
        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>Departments</div>
          <div style={sectionBodyStyle}>
            <p
              style={{
                margin: "0 0 12px",
                fontSize: "var(--dg-fs-label)",
                color: "var(--color-text-muted)",
              }}
            >
              Organizational departments. &quot;Scheduled&quot; departments
              appear on the scheduling grid; &quot;Management&quot; departments
              are for hierarchy only.
            </p>
            {departments.map((dept, idx) => (
              <div
                key={dept.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <input
                  className="dg-input"
                  value={dept.name}
                  onChange={(e) =>
                    setDepartments((prev) =>
                      prev.map((d, i) =>
                        i === idx ? { ...d, name: e.target.value } : d,
                      ),
                    )
                  }
                  placeholder="e.g. Emergency"
                  style={{ flex: 2 }}
                />
                <input
                  className="dg-input"
                  value={dept.abbr}
                  onChange={(e) =>
                    setDepartments((prev) =>
                      prev.map((d, i) =>
                        i === idx ? { ...d, abbr: e.target.value } : d,
                      ),
                    )
                  }
                  placeholder="e.g. ER"
                  style={{ flex: 1, maxWidth: 100 }}
                />
                <CustomSelect
                  value={dept.type}
                  options={[
                    { value: "scheduled", label: "Scheduled" },
                    { value: "management", label: "Management" },
                  ]}
                  onChange={(val) =>
                    setDepartments((prev) =>
                      prev.map((d, i) =>
                        i === idx
                          ? { ...d, type: val as "scheduled" | "management" }
                          : d,
                      ),
                    )
                  }
                  style={{ width: 140 }}
                />
                {departments.length > 1 && (
                  <button
                    type="button"
                    className="dg-btn dg-btn-ghost"
                    onClick={() =>
                      setDepartments((prev) => prev.filter((_, i) => i !== idx))
                    }
                    style={{ padding: "6px 8px" }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="dg-btn dg-btn-ghost"
              onClick={() =>
                setDepartments((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    abbr: "",
                    type: "scheduled",
                  },
                ])
              }
              style={{ fontSize: "var(--dg-fs-label)" }}
            >
              + Add department
            </button>
          </div>
        </div>

        {/* Focus Areas */}
        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>{focusAreaLabel}</div>
          <div style={sectionBodyStyle}>
            <p
              style={{
                margin: "0 0 12px",
                fontSize: "var(--dg-fs-label)",
                color: "var(--color-text-muted)",
              }}
            >
              Departments, wings, or units that employees are assigned to.
            </p>
            {focusAreas.map((fa, idx) => (
              <div
                key={fa.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <input
                  className="dg-input"
                  value={fa.name}
                  onChange={(e) =>
                    updateFocusArea(idx, { name: e.target.value })
                  }
                  placeholder={`${focusAreaLabel.replace(/s$/, "")} name`}
                  style={{ flex: 1 }}
                />
                {focusAreas.length > 1 && (
                  <button
                    type="button"
                    className="dg-btn dg-btn-ghost"
                    onClick={() => removeFocusArea(idx)}
                    style={{ padding: "6px 8px" }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="dg-btn dg-btn-ghost"
              onClick={addFocusAreaRow}
              style={{ fontSize: "var(--dg-fs-label)" }}
            >
              + Add {focusAreaLabel.replace(/s$/, "").toLowerCase()}
            </button>
          </div>
        </div>

        {/* Certifications */}
        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>{certificationLabel}</div>
          <div style={sectionBodyStyle}>
            <p
              style={{
                margin: "0 0 12px",
                fontSize: "var(--dg-fs-label)",
                color: "var(--color-text-muted)",
              }}
            >
              Skill levels or designations that employees can hold.
            </p>
            {certifications.map((cert, idx) => (
              <div
                key={cert.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <input
                  className="dg-input"
                  value={cert.name}
                  onChange={(e) =>
                    updateNamedItem(setCertifications, idx, {
                      name: e.target.value,
                    })
                  }
                  placeholder="e.g. Registered Nurse"
                  style={{ flex: 2 }}
                />
                <input
                  className="dg-input"
                  value={cert.abbr}
                  onChange={(e) =>
                    updateNamedItem(setCertifications, idx, {
                      abbr: e.target.value,
                    })
                  }
                  placeholder="e.g. RN"
                  style={{ flex: 1, maxWidth: 100 }}
                />
                {certifications.length > 1 && (
                  <button
                    type="button"
                    className="dg-btn dg-btn-ghost"
                    onClick={() => removeNamedItem(setCertifications, idx)}
                    style={{ padding: "6px 8px" }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="dg-btn dg-btn-ghost"
              onClick={() => addNamedItemRow(setCertifications)}
              style={{ fontSize: "var(--dg-fs-label)" }}
            >
              + Add {certificationLabel.replace(/s$/, "").toLowerCase()}
            </button>
          </div>
        </div>

        {/* Org Roles */}
        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>{roleLabel}</div>
          <div style={sectionBodyStyle}>
            <p
              style={{
                margin: "0 0 12px",
                fontSize: "var(--dg-fs-label)",
                color: "var(--color-text-muted)",
              }}
            >
              Configurable display roles for employees (not to be confused with
              access roles).
            </p>
            {orgRoles.map((role, idx) => (
              <div
                key={role.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <input
                  className="dg-input"
                  value={role.name}
                  onChange={(e) =>
                    updateNamedItem(setOrgRoles, idx, { name: e.target.value })
                  }
                  placeholder="e.g. Charge Nurse"
                  style={{ flex: 2 }}
                />
                <input
                  className="dg-input"
                  value={role.abbr}
                  onChange={(e) =>
                    updateNamedItem(setOrgRoles, idx, { abbr: e.target.value })
                  }
                  placeholder="e.g. CN"
                  style={{ flex: 1, maxWidth: 100 }}
                />
                {orgRoles.length > 1 && (
                  <button
                    type="button"
                    className="dg-btn dg-btn-ghost"
                    onClick={() => removeNamedItem(setOrgRoles, idx)}
                    style={{ padding: "6px 8px" }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="dg-btn dg-btn-ghost"
              onClick={() => addNamedItemRow(setOrgRoles)}
              style={{ fontSize: "var(--dg-fs-label)" }}
            >
              + Add {roleLabel.replace(/s$/, "").toLowerCase()}
            </button>
          </div>
        </div>

        {/* Shifts */}
        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>Shifts</div>
          <div style={sectionBodyStyle}>
            <p
              style={{
                margin: "0 0 12px",
                fontSize: "var(--dg-fs-label)",
                color: "var(--color-text-muted)",
              }}
            >
              Primary shift blocks like Day, Evening, and Night. These set the timing backbone that jobs can sit on top of.
            </p>
            {shiftCategories.map((cat, idx) => (
              <div
                key={cat.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <input
                  className="dg-input"
                  value={cat.name}
                  onChange={(e) =>
                    setShiftCategories((prev) =>
                      prev.map((c, i) =>
                        i === idx ? { ...c, name: e.target.value } : c,
                      ),
                    )
                  }
                  placeholder="e.g. Day Shift"
                  style={{ flex: 2 }}
                />
                <input
                  className="dg-input"
                  type="time"
                  value={cat.startTime}
                  aria-label="Start time"
                  onChange={(e) =>
                    setShiftCategories((prev) =>
                      prev.map((c, i) =>
                        i === idx ? { ...c, startTime: e.target.value } : c,
                      ),
                    )
                  }
                  style={{ width: 120 }}
                />
                <input
                  className="dg-input"
                  type="time"
                  value={cat.endTime}
                  aria-label="End time"
                  onChange={(e) =>
                    setShiftCategories((prev) =>
                      prev.map((c, i) =>
                        i === idx ? { ...c, endTime: e.target.value } : c,
                      ),
                    )
                  }
                  style={{ width: 120 }}
                />
                {shiftCategories.length > 1 && (
                  <button
                    type="button"
                    className="dg-btn dg-btn-ghost"
                    onClick={() =>
                      setShiftCategories((prev) =>
                        prev.filter((_, i) => i !== idx),
                      )
                    }
                    style={{ padding: "6px 8px" }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="dg-btn dg-btn-ghost"
              onClick={() =>
                setShiftCategories((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    startTime: "",
                    endTime: "",
                  },
                ])
              }
              style={{ fontSize: "var(--dg-fs-label)" }}
            >
              + Add shift
            </button>
          </div>
        </div>

        {/* Jobs */}
        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>Jobs</div>
          <div style={sectionBodyStyle}>
            <p
              style={{
                margin: "0 0 12px",
                fontSize: "var(--dg-fs-label)",
                color: "var(--color-text-muted)",
              }}
            >
              Responsibilities that can sit on a shift or stand alone, like Supervisor, Mentor, Nurse, or Office.
            </p>
            {jobs.map((job, idx) => (
              <div
                key={job.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <input
                  type="color"
                  value={job.color}
                  onChange={(e) =>
                    setJobs((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, color: e.target.value } : item,
                      ),
                    )
                  }
                  style={{
                    width: 36,
                    height: 36,
                    border: "1px solid var(--color-border)",
                    borderRadius: 6,
                    cursor: "pointer",
                    padding: 2,
                  }}
                />
                <input
                  className="dg-input"
                  value={job.label}
                  onChange={(e) =>
                    setJobs((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, label: e.target.value } : item,
                      ),
                    )
                  }
                  placeholder="e.g. SUP"
                  style={{ flex: 1, maxWidth: 80 }}
                />
                <input
                  className="dg-input"
                  value={job.name}
                  onChange={(e) =>
                    setJobs((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, name: e.target.value } : item,
                      ),
                    )
                  }
                  placeholder="e.g. Supervisor"
                  style={{ flex: 2 }}
                />
                {jobs.length > 1 && (
                  <button
                    type="button"
                    className="dg-btn dg-btn-ghost"
                    onClick={() => setJobs((prev) => prev.filter((_, i) => i !== idx))}
                    style={{ padding: "6px 8px" }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="dg-btn dg-btn-ghost"
              onClick={() =>
                setJobs((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    label: "",
                    name: "",
                    color: COLOR_PRESETS[prev.length % COLOR_PRESETS.length],
                  },
                ])
              }
              style={{ fontSize: "var(--dg-fs-label)" }}
            >
              + Add job
            </button>
          </div>
        </div>

        <ActionBar>
          <button
            type="button"
            className="dg-btn dg-btn-ghost"
            onClick={() => setCurrentStep("employees")}
          >
            Skip
          </button>
          <button
            type="button"
            className="dg-btn dg-btn-brand"
            disabled={saving}
            onClick={handleConfigNext}
          >
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
              <span
                style={{
                  fontWeight: 500,
                  color: "var(--color-text-muted)",
                  marginLeft: 8,
                }}
              >
                ({validCount} ready)
              </span>
            )}
          </div>
          <div style={sectionBodyStyle}>
            <p
              style={{
                margin: "0 0 16px",
                fontSize: "var(--dg-fs-label)",
                color: "var(--color-text-muted)",
              }}
            >
              Add your staff members. At minimum, provide a first name. Email is
              needed if you want to invite them in the next step.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16, maxWidth: 420 }}>
              <div>
                <label htmlFor="wizard-employees-ready-count" style={labelStyle}>
                  Employees Ready To Create
                </label>
                <input
                  id="wizard-employees-ready-count"
                  className="dg-input"
                  value={String(validCount)}
                  readOnly
                  aria-readonly="true"
                />
              </div>
              <div>
                <label htmlFor="wizard-employees-created-count" style={labelStyle}>
                  Employees Already Created
                </label>
                <input
                  id="wizard-employees-created-count"
                  className="dg-input"
                  value={String(createdEmployeeCount)}
                  readOnly
                  aria-readonly="true"
                />
              </div>
            </div>

            {/* Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1fr 32px",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <span style={{ ...labelStyle, marginBottom: 0 }}>
                First Name <span style={{ color: "var(--color-danger)" }}>*</span>
              </span>
              <span style={{ ...labelStyle, marginBottom: 0 }}>Last Name</span>
              <span style={{ ...labelStyle, marginBottom: 0 }}>Email</span>
              <span style={{ ...labelStyle, marginBottom: 0 }}>Phone</span>
              <span />
            </div>

            {/* Rows */}
            {employeeRows.map((row, idx) => (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr 32px",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <input
                  className="dg-input"
                  value={row.firstName}
                  onChange={(e) =>
                    updateEmployeeRow(idx, { firstName: e.target.value })
                  }
                  placeholder="John"
                />
                <input
                  className="dg-input"
                  value={row.lastName}
                  onChange={(e) =>
                    updateEmployeeRow(idx, { lastName: e.target.value })
                  }
                  placeholder="Doe"
                />
                <input
                  className="dg-input"
                  type="email"
                  value={row.email}
                  onChange={(e) =>
                    updateEmployeeRow(idx, { email: e.target.value })
                  }
                  placeholder="john@example.com"
                />
                <input
                  className="dg-input"
                  value={row.phone}
                  onChange={(e) =>
                    updateEmployeeRow(idx, { phone: e.target.value })
                  }
                  placeholder="(555) 123-4567"
                />
                <button
                  type="button"
                  className="dg-btn dg-btn-ghost"
                  onClick={() => removeEmployeeRow(idx)}
                  style={{
                    padding: "6px",
                    opacity: employeeRows.length > 1 ? 1 : 0.3,
                  }}
                  disabled={employeeRows.length <= 1}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}

            <button
              type="button"
              className="dg-btn dg-btn-ghost"
              onClick={() => addEmployeeRows(5)}
              style={{ fontSize: "var(--dg-fs-label)", marginTop: 8 }}
            >
              + Add 5 more rows
            </button>
          </div>
        </div>

        <ActionBar>
          <button
            type="button"
            className="dg-btn dg-btn-ghost"
            onClick={() => {
              if (createdOrg) {
                toast.success("Setup complete");
                onCreated(createdOrg);
              }
            }}
          >
            Skip
          </button>
          <button
            type="button"
            className="dg-btn dg-btn-brand"
            disabled={saving || validCount === 0}
            onClick={handleEmployeesNext}
          >
            {saving
              ? "Creating…"
              : `Create ${validCount} Employee${validCount !== 1 ? "s" : ""}`}
          </button>
        </ActionBar>
      </>
    );
  }

  // ── Render: Step 5 — Invitations ──────────────────────────────────────────

  function renderInvitations() {
    const selectedCount = invitationRows.filter((r) => r.selected).length;
    const allSelected =
      invitationRows.length > 0 && selectedCount === invitationRows.length;

    return (
      <>
        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>
            Send Invitations
            {selectedCount > 0 && (
              <span
                style={{
                  fontWeight: 500,
                  color: "var(--color-text-muted)",
                  marginLeft: 8,
                }}
              >
                ({selectedCount} selected)
              </span>
            )}
          </div>
          <div style={sectionBodyStyle}>
            <p
              style={{
                margin: "0 0 16px",
                fontSize: "var(--dg-fs-label)",
                color: "var(--color-text-muted)",
              }}
            >
              Select employees to invite. They will receive an email with a link
              to set their password and join the organization.
            </p>

            <div style={{ maxWidth: 220, marginBottom: 16 }}>
              <label htmlFor="wizard-invitations-created-count" style={labelStyle}>
                Employees Created
              </label>
              <input
                id="wizard-invitations-created-count"
                className="dg-input"
                value={String(createdEmployeeCount)}
                readOnly
                aria-readonly="true"
              />
            </div>

            {invitationRows.length === 0 ? (
              <p
                style={{
                  color: "var(--color-text-muted)",
                  fontSize: "var(--dg-fs-label)",
                }}
              >
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
                      setInvitationRows((prev) =>
                        prev.map((r) => ({ ...r, selected: e.target.checked })),
                      );
                    }}
                    style={{ accentColor: "var(--color-primary)" }}
                  />
                  Select All
                </label>

                {/* Header */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "32px 1fr 1fr 120px",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
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
                          prev.map((r, i) =>
                            i === idx
                              ? { ...r, selected: e.target.checked }
                              : r,
                          ),
                        );
                      }}
                      style={{ accentColor: "var(--color-primary)" }}
                    />
                    <span
                      style={{
                        fontSize: "var(--dg-fs-label)",
                        fontWeight: 500,
                        color: "var(--color-text-primary)",
                      }}
                    >
                      {inv.name}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--dg-fs-label)",
                        color: "var(--color-text-muted)",
                      }}
                    >
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
                          prev.map((r, i) =>
                            i === idx
                              ? {
                                  ...r,
                                  role: val as AssignableOrganizationRole,
                                }
                              : r,
                          ),
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
            className="dg-btn dg-btn-brand"
            disabled={saving || selectedCount === 0}
            onClick={handleInvitationsFinish}
          >
            {saving
              ? "Sending…"
              : `Send ${selectedCount} Invitation${selectedCount !== 1 ? "s" : ""} & Finish`}
          </button>
        </ActionBar>
      </>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 720 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-heading)",
            fontWeight: 700,
            color: "var(--color-text-primary)",
          }}
        >
          {currentStep === "decision"
            ? "Organization Created"
            : "Create Organization"}
        </h2>
        {currentStep !== "decision" && (
          <button
            type="button"
            className="dg-btn dg-btn-ghost"
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>

      <WizardStepper currentStep={currentStep} />

      {currentStep === "details" && renderDetails()}
      {currentStep === "super-admin" && renderSuperAdmin()}
      {currentStep === "decision" && renderDecision()}
      {currentStep === "config" && renderConfig()}
      {currentStep === "employees" && renderEmployees()}
      {currentStep === "invitations" && renderInvitations()}
    </div>
  );
}

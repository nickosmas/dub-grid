"use client";
import { X } from "lucide-react";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import type { Organization, AssignableOrganizationRole } from "@/types";
import { Button } from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import CustomSelect from "@/components/CustomSelect";
import OrganizationLocationFields from "@/components/organization/OrganizationLocationFields";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { withComposedOrganizationAddress } from "@/lib/organization-profile";
import { sectionStyle, sectionHeaderStyle, sectionBodyStyle, labelStyle } from "@/lib/styles";
import { formatTimezoneLabel } from "@/lib/timezones";
import { ActionBar } from "./organization-setup/ActionBar";
import { COLOR_PRESETS, type StepKey } from "./organization-setup/constants";
import {
  createOrganizationEmployees,
  createOrganizationSetup,
  saveOrganizationSetupConfig,
  sendInvitationEmail,
  sendOrganizationInvitations,
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
import { ButtonLoading } from "@/components/ButtonSpinner";

// ── Main Wizard ───────────────────────────────────────────────────────────────

type SetupConfirmAction =
  "create-organization" | "save-configuration" | "create-employees" | "send-invitations";

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
  const [setupConfirmAction, setSetupConfirmAction] = useState<SetupConfirmAction | null>(null);
  const [createdOrg, setCreatedOrg] = useState<Organization | null>(null);

  // ── Step 1: Org Details ───────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("");
  const [focusAreaLabel, setFocusAreaLabel] = useState("Focus Areas");
  const [certificationLabel, setCertificationLabel] = useState("Certifications");
  const [roleLabel, setRoleLabel] = useState("Roles");
  const [createdEmployeeCount, setCreatedEmployeeCount] = useState(0);

  // ── Step 2: Super Admin ───────────────────────────────────────────────────
  const [superAdminFirstName, setSuperAdminFirstName] = useState("");
  const [superAdminLastName, setSuperAdminLastName] = useState("");
  const [superAdminEmail, setSuperAdminEmail] = useState("");
  const [superAdminPhone, setSuperAdminPhone] = useState("");
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  // ── Step 3: Config ────────────────────────────────────────────────────────
  const [shiftDisplayMode, setShiftDisplayMode] = useState<"code" | "name">("code");
  const [departments, setDepartments] = useState<DeptRow[]>([
    { id: crypto.randomUUID(), name: "", abbr: "", type: "scheduled" },
  ]);
  const [focusAreas, setFocusAreas] = useState<FocusAreaRow[]>([
    { id: crypto.randomUUID(), name: "", departmentId: null },
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
      focusAreaId: null,
    },
  ]);
  const [jobs, setJobs] = useState<JobRow[]>([
    {
      id: crypto.randomUUID(),
      label: "",
      name: "",
      color: COLOR_PRESETS[0],
      departmentIds: [],
      focusAreaIds: [],
      shiftCategoryIds: [],
    },
  ]);

  const scheduledDepartments = departments.filter((department) => department.type === "scheduled");
  const focusAreaOptions = focusAreas.filter((focusArea) => focusArea.name.trim());
  const shiftCategoryOptions = shiftCategories.filter((category) => category.name.trim());

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
  const readyEmployeeCount = employeeRows.filter((r) => r.firstName.trim()).length;
  const selectedInvitationCount = invitationRows.filter((r) => r.selected).length;

  // ── Step 1 → Step 2 ──────────────────────────────────────────────────────

  const handleDetailsNext = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      setCurrentStep("super-admin");
    } finally {
      setSaving(false);
    }
  }, [name]);

  // ── Step 2 → Create org + Decision ────────────────────────────────────────

  const handleSuperAdminNext = useCallback(async () => {
    setSaving(true);
    try {
      const { org, superAdmin } = await createOrganizationSetup({
        name,
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
        toast.success(`Organization created & ${superAdmin.displayName} assigned as super admin`);
      } else if (superAdmin.kind === "pending-invite") {
        setPendingInvite(superAdmin.pendingInvite);
        toast.success("Organization created & invitation ready");
        toast.info("Send the invitation email from the next screen.");
      } else if (superAdmin.kind === "invite-error") {
        toast.success("Organization created");
        toast.error(formatClientErrorMessage(superAdmin.message, "Failed to create invitation"));
      } else {
        toast.success("Organization created");
      }

      setCurrentStep("decision");
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "Failed to create organization"));
    } finally {
      setSaving(false);
    }
  }, [
    name,
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
      toast.error(formatClientErrorMessage(err, "Failed to save configuration"));
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
        toast.success(`Created ${created.length} employee${created.length !== 1 ? "s" : ""}`);

      if (withEmail.length > 0) {
        setCurrentStep("invitations");
      } else {
        // No employees with emails — finish
        toast.success("Setup complete");
        onCreated(createdOrg);
      }
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "Failed to create employees"));
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
      const { sentCount, failCount } = await sendOrganizationInvitations(createdOrg, selected);

      if (sentCount > 0) toast.success(`Sent ${sentCount} invitation${sentCount !== 1 ? "s" : ""}`);
      if (failCount > 0) toast.error(`${failCount} invitation${failCount !== 1 ? "s" : ""} failed`);

      onCreated(createdOrg);
    } finally {
      setSaving(false);
    }
  }, [createdOrg, invitationRows, onCreated]);

  async function handleConfirmSetupAction() {
    const action = setupConfirmAction;
    if (!action) return;

    try {
      if (action === "create-organization") {
        await handleSuperAdminNext();
      } else if (action === "save-configuration") {
        await handleConfigNext();
      } else if (action === "create-employees") {
        await handleEmployeesNext();
      } else {
        await handleInvitationsFinish();
      }
    } finally {
      setSetupConfirmAction(null);
    }
  }

  // ── Row helpers ───────────────────────────────────────────────────────────

  function addFocusAreaRow() {
    setFocusAreas((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: "",
        departmentId: null,
      },
    ]);
  }

  function updateFocusArea(idx: number, updates: Partial<FocusAreaRow>) {
    setFocusAreas((prev) => prev.map((fa, i) => (i === idx ? { ...fa, ...updates } : fa)));
  }

  function removeFocusArea(idx: number) {
    const removed = focusAreas[idx];
    setFocusAreas((prev) => prev.filter((_, i) => i !== idx));
    if (!removed) return;
    setShiftCategories((prev) =>
      prev.map((shift) =>
        shift.focusAreaId === removed.id ? { ...shift, focusAreaId: null } : shift,
      ),
    );
    setJobs((prev) =>
      prev.map((job) => ({
        ...job,
        focusAreaIds: job.focusAreaIds.filter((id) => id !== removed.id),
      })),
    );
  }

  function updateDepartmentRow(idx: number, updates: Partial<DeptRow>) {
    const current = departments[idx];
    if (!current) return;
    setDepartments((prev) =>
      prev.map((department, i) => (i === idx ? { ...department, ...updates } : department)),
    );
    if (updates.type === "management") {
      const fallbackDepartmentId =
        departments.find((department, i) => i !== idx && department.type === "scheduled")?.id ??
        null;
      setFocusAreas((prev) =>
        prev.map((focusArea) =>
          focusArea.departmentId === current.id
            ? { ...focusArea, departmentId: fallbackDepartmentId }
            : focusArea,
        ),
      );
      setJobs((prev) =>
        prev.map((job) => ({
          ...job,
          departmentIds: job.departmentIds.filter((id) => id !== current.id),
        })),
      );
    }
  }

  function removeDepartmentRow(idx: number) {
    const removed = departments[idx];
    if (!removed) return;
    const fallbackDepartmentId =
      departments.find((department, i) => i !== idx && department.type === "scheduled")?.id ?? null;
    setDepartments((prev) => prev.filter((_, i) => i !== idx));
    setFocusAreas((prev) =>
      prev.map((focusArea) =>
        focusArea.departmentId === removed.id
          ? { ...focusArea, departmentId: fallbackDepartmentId }
          : focusArea,
      ),
    );
    setJobs((prev) =>
      prev.map((job) => ({
        ...job,
        departmentIds: job.departmentIds.filter((id) => id !== removed.id),
      })),
    );
  }

  function addNamedItemRow(setter: React.Dispatch<React.SetStateAction<NamedItemRow[]>>) {
    setter((prev) => [...prev, { id: crypto.randomUUID(), name: "", abbr: "" }]);
  }

  function updateNamedItem(
    setter: React.Dispatch<React.SetStateAction<NamedItemRow[]>>,
    idx: number,
    updates: Partial<NamedItemRow>,
  ) {
    setter((prev) => prev.map((item, i) => (i === idx ? { ...item, ...updates } : item)));
  }

  function removeNamedItem(
    setter: React.Dispatch<React.SetStateAction<NamedItemRow[]>>,
    idx: number,
  ) {
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
            <p
              style={{
                margin: "0 0 16px",
                fontSize: "var(--dg-fs-label)",
                color: "var(--dg-color-text-muted)",
              }}
            >
              Only the name is required. Address, phone, and time zone can be left for the super
              admin to fill in during their own setup.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div>
                <label style={labelStyle}>Organization name *</label>
                <input
                  className="dg-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Healthcare"
                  required
                />
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
                if (patch.addressPostalCode !== undefined)
                  setAddressPostalCode(patch.addressPostalCode);
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
                color: "var(--dg-color-text-muted)",
              }}
            >
              Optional. Customize the terminology used throughout the app, or leave it for the super
              admin to decide.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 16,
              }}
            >
              <div>
                <label style={labelStyle}>Focus areas label</label>
                <input
                  className="dg-input"
                  value={focusAreaLabel}
                  onChange={(e) => setFocusAreaLabel(e.target.value)}
                  placeholder="Focus Areas"
                />
              </div>
              <div>
                <label style={labelStyle}>Certifications label</label>
                <input
                  className="dg-input"
                  value={certificationLabel}
                  onChange={(e) => setCertificationLabel(e.target.value)}
                  placeholder="Certifications"
                />
              </div>
              <div>
                <label style={labelStyle}>Roles label</label>
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
          <Button type="button" className="dg-btn dg-btn-secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            className="dg-btn dg-btn-primary"
            disabled={saving || !name.trim()}
            onClick={handleDetailsNext}
          >
            <ButtonLoading loading={saving}>Next</ButtonLoading>
          </Button>
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
                color: "var(--dg-color-text-muted)",
              }}
            >
              Assign a super admin who will own this organization. They will have full control over
              settings, users, and configuration.
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
                  First Name <span style={{ color: "var(--dg-color-danger)" }}>*</span>
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
                  Last Name <span style={{ color: "var(--dg-color-danger)" }}>*</span>
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
                  Email <span style={{ color: "var(--dg-color-danger)" }}>*</span>
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
                  color: "var(--dg-color-text-muted)",
                  marginTop: 8,
                  display: "block",
                  maxWidth: 500,
                }}
              >
                If this user doesn&apos;t have an account yet, an invitation will be created. You
                can send the email on the next screen.
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
              <span style={{ fontWeight: 600, color: "var(--dg-color-text-muted)" }}>
                Organization
              </span>
              <span style={{ color: "var(--dg-color-text-primary)" }}>{name}</span>
              {timezone && (
                <>
                  <span
                    style={{
                      fontWeight: 600,
                      color: "var(--dg-color-text-muted)",
                    }}
                  >
                    Timezone
                  </span>
                  <span style={{ color: "var(--dg-color-text-primary)" }}>
                    {formatTimezoneLabel(timezone)} · {timezone}
                  </span>
                </>
              )}
              {summaryAddress && (
                <>
                  <span
                    style={{
                      fontWeight: 600,
                      color: "var(--dg-color-text-muted)",
                    }}
                  >
                    Address
                  </span>
                  <span style={{ color: "var(--dg-color-text-primary)" }}>{summaryAddress}</span>
                </>
              )}
              {superAdminFirstName.trim() && superAdminLastName.trim() && (
                <>
                  <span
                    style={{
                      fontWeight: 600,
                      color: "var(--dg-color-text-muted)",
                    }}
                  >
                    Super Admin
                  </span>
                  <span style={{ color: "var(--dg-color-text-primary)" }}>
                    {superAdminFirstName.trim()} {superAdminLastName.trim()}
                  </span>
                </>
              )}
              {superAdminEmail.trim() && (
                <>
                  <span
                    style={{
                      fontWeight: 600,
                      color: "var(--dg-color-text-muted)",
                    }}
                  >
                    Email
                  </span>
                  <span style={{ color: "var(--dg-color-text-primary)" }}>{superAdminEmail}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <ActionBar>
          <Button
            type="button"
            className="dg-btn dg-btn-ghost"
            onClick={() => setCurrentStep("details")}
          >
            Back
          </Button>
          <Button
            type="button"
            className="dg-btn dg-btn-primary"
            disabled={
              saving ||
              !superAdminFirstName.trim() ||
              !superAdminLastName.trim() ||
              !superAdminEmail.trim()
            }
            onClick={() => setSetupConfirmAction("create-organization")}
          >
            <ButtonLoading loading={saving}>Create Organization</ButtonLoading>
          </Button>
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
      toast.error(formatClientErrorMessage(err, "Failed to send email"));
    } finally {
      setSendingEmail(false);
    }
  }

  function renderDecision() {
    const handoffName = superAdminFirstName.trim() || "the super admin";
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 0" }}>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--dg-color-success)",
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
              stroke="var(--dg-color-text-inverse)"
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
              color: "var(--dg-color-text-primary)",
            }}
          >
            Organization Created
          </h2>
          <p
            style={{
              margin: "0 0 24px",
              fontSize: "var(--dg-fs-body-sm)",
              color: "var(--dg-color-text-muted)",
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
              border: "1px solid var(--dg-color-warning)",
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
                    color: "var(--dg-color-text-primary)",
                    marginBottom: 4,
                  }}
                >
                  Invitation ready for {pendingInvite.name} ({pendingInvite.email})
                </div>
                <div
                  style={{
                    fontSize: "var(--dg-fs-label)",
                    color: "var(--dg-color-text-muted)",
                  }}
                >
                  They will join as the super admin of this organization as soon as they accept.
                </div>
              </div>
              <Button
                type="button"
                className="dg-btn dg-btn-primary"
                disabled={sendingEmail}
                onClick={handleSendPendingEmail}
                style={{ whiteSpace: "nowrap" }}
              >
                <ButtonLoading loading={sendingEmail}>Send Email</ButtonLoading>
              </Button>
            </div>
          </div>
        )}

        <div style={{ textAlign: "center" }}>
          <p
            style={{
              margin: "0 0 24px",
              fontSize: "var(--dg-fs-body-sm)",
              color: "var(--dg-color-text-muted)",
            }}
          >
            Hand the rest off to {handoffName}, or set it up now? If you hand off, {handoffName}{" "}
            will be walked through organization details, departments and focus areas, shifts and
            jobs, and team invitations the first time they sign in.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              maxWidth: 440,
              margin: "0 auto",
            }}
          >
            <Button
              type="button"
              className="dg-btn dg-btn-primary"
              style={{ padding: "12px 24px" }}
              onClick={() => {
                if (createdOrg) onCreated(createdOrg);
              }}
            >
              Hand off to {handoffName}
            </Button>
            <Button
              type="button"
              className="dg-btn dg-btn-secondary"
              style={{ padding: "12px 24px" }}
              onClick={() => setCurrentStep("config")}
            >
              Set up now
            </Button>
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
                color: "var(--dg-color-text-muted)",
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
                    borderRadius: "var(--dg-radius-md)",
                    border: `2px solid ${shiftDisplayMode === value ? "var(--dg-color-primary)" : "var(--dg-color-border)"}`,
                    background:
                      shiftDisplayMode === value ? "var(--dg-color-primary-bg)" : "transparent",
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
                    style={{ accentColor: "var(--dg-color-primary)" }}
                  />
                  <span>
                    <span style={{ color: "var(--dg-color-text-primary)" }}>{label}</span>
                    <span
                      style={{
                        color: "var(--dg-color-text-muted)",
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
                color: "var(--dg-color-text-muted)",
              }}
            >
              Organizational departments. &quot;Scheduled&quot; departments appear on the scheduling
              grid; &quot;Management&quot; departments are for hierarchy only.
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
                  onChange={(e) => updateDepartmentRow(idx, { name: e.target.value })}
                  placeholder="e.g. Emergency"
                  style={{ flex: 2 }}
                />
                <input
                  className="dg-input"
                  value={dept.abbr}
                  onChange={(e) => updateDepartmentRow(idx, { abbr: e.target.value })}
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
                    updateDepartmentRow(idx, {
                      type: val as "scheduled" | "management",
                    })
                  }
                  style={{ width: 140 }}
                />
                {departments.length > 1 && (
                  <Button
                    type="button"
                    className="dg-btn dg-btn-ghost"
                    onClick={() => removeDepartmentRow(idx)}
                    style={{ padding: "6px 8px" }}
                  >
                    <X size={14} />
                  </Button>
                )}
              </div>
            ))}
            <Button
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
            </Button>
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
                color: "var(--dg-color-text-muted)",
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
                  onChange={(e) => updateFocusArea(idx, { name: e.target.value })}
                  placeholder={`${focusAreaLabel.replace(/s$/, "")} name`}
                  style={{ flex: 1 }}
                />
                <CustomSelect
                  value={fa.departmentId ?? "__none__"}
                  options={
                    scheduledDepartments.length > 0
                      ? [
                          {
                            value: "__none__",
                            label: "Select scheduled department",
                          },
                          ...scheduledDepartments.map((department) => ({
                            value: department.id,
                            label: department.name.trim() || "Unnamed department",
                          })),
                        ]
                      : [{ value: "__none__", label: "Add a scheduled department first" }]
                  }
                  onChange={(val) =>
                    updateFocusArea(idx, {
                      departmentId: val === "__none__" ? null : val,
                    })
                  }
                  style={{ width: 220 }}
                />
                {focusAreas.length > 1 && (
                  <Button
                    type="button"
                    className="dg-btn dg-btn-ghost"
                    onClick={() => removeFocusArea(idx)}
                    style={{ padding: "6px 8px" }}
                  >
                    <X size={14} />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              className="dg-btn dg-btn-ghost"
              onClick={addFocusAreaRow}
              style={{ fontSize: "var(--dg-fs-label)" }}
            >
              + Add {focusAreaLabel.replace(/s$/, "").toLowerCase()}
            </Button>
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
                color: "var(--dg-color-text-muted)",
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
                {certifications.length > 1 && (
                  <Button
                    type="button"
                    className="dg-btn dg-btn-ghost"
                    onClick={() => removeNamedItem(setCertifications, idx)}
                    style={{ padding: "6px 8px" }}
                  >
                    <X size={14} />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              className="dg-btn dg-btn-ghost"
              onClick={() => addNamedItemRow(setCertifications)}
              style={{ fontSize: "var(--dg-fs-label)" }}
            >
              + Add {certificationLabel.replace(/s$/, "").toLowerCase()}
            </Button>
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
                color: "var(--dg-color-text-muted)",
              }}
            >
              Configurable display roles for employees (not to be confused with access roles).
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
                  onChange={(e) => updateNamedItem(setOrgRoles, idx, { name: e.target.value })}
                  placeholder="e.g. Charge Nurse"
                  style={{ flex: 2 }}
                />
                {orgRoles.length > 1 && (
                  <Button
                    type="button"
                    className="dg-btn dg-btn-ghost"
                    onClick={() => removeNamedItem(setOrgRoles, idx)}
                    style={{ padding: "6px 8px" }}
                  >
                    <X size={14} />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              className="dg-btn dg-btn-ghost"
              onClick={() => addNamedItemRow(setOrgRoles)}
              style={{ fontSize: "var(--dg-fs-label)" }}
            >
              + Add {roleLabel.replace(/s$/, "").toLowerCase()}
            </Button>
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
                color: "var(--dg-color-text-muted)",
              }}
            >
              Primary shift blocks like Day, Evening, and Night. These set the timing backbone that
              jobs can sit on top of.
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
                      prev.map((c, i) => (i === idx ? { ...c, name: e.target.value } : c)),
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
                      prev.map((c, i) => (i === idx ? { ...c, startTime: e.target.value } : c)),
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
                      prev.map((c, i) => (i === idx ? { ...c, endTime: e.target.value } : c)),
                    )
                  }
                  style={{ width: 120 }}
                />
                <CustomSelect
                  value={cat.focusAreaId ?? "__none__"}
                  options={
                    focusAreaOptions.length > 0
                      ? [
                          {
                            value: "__none__",
                            label: `Select ${focusAreaLabel.replace(/s$/, "").toLowerCase()}`,
                          },
                          ...focusAreaOptions.map((focusArea) => ({
                            value: focusArea.id,
                            label: focusArea.name,
                          })),
                        ]
                      : [{ value: "__none__", label: `Add ${focusAreaLabel.toLowerCase()} first` }]
                  }
                  onChange={(val) =>
                    setShiftCategories((prev) =>
                      prev.map((c, i) =>
                        i === idx ? { ...c, focusAreaId: val === "__none__" ? null : val } : c,
                      ),
                    )
                  }
                  style={{ width: 190 }}
                />
                {shiftCategories.length > 1 && (
                  <Button
                    type="button"
                    className="dg-btn dg-btn-ghost"
                    onClick={() => setShiftCategories((prev) => prev.filter((_, i) => i !== idx))}
                    style={{ padding: "6px 8px" }}
                  >
                    <X size={14} />
                  </Button>
                )}
              </div>
            ))}
            <Button
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
                    focusAreaId: null,
                  },
                ])
              }
              style={{ fontSize: "var(--dg-fs-label)" }}
            >
              + Add shift
            </Button>
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
                color: "var(--dg-color-text-muted)",
              }}
            >
              Responsibilities that can sit on a shift or stand alone, like Supervisor, Mentor,
              Nurse, or Office.
            </p>
            {jobs.map((job, idx) => {
              const selectedDepartmentId = job.departmentIds[0] ?? "__none__";
              const selectableFocusAreas =
                selectedDepartmentId === "__none__"
                  ? []
                  : focusAreaOptions.filter(
                      (focusArea) => focusArea.departmentId === selectedDepartmentId,
                    );
              const selectedFocusAreaId = job.focusAreaIds[0] ?? "__none__";
              const selectableShifts =
                selectedFocusAreaId === "__none__"
                  ? []
                  : shiftCategoryOptions.filter(
                      (shift) => shift.focusAreaId === selectedFocusAreaId,
                    );

              return (
                <div
                  key={job.id}
                  style={{
                    border: "1px solid var(--dg-color-border)",
                    borderRadius: "var(--dg-radius-md)",
                    padding: 12,
                    marginBottom: 10,
                    background: "var(--dg-color-bg-secondary)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 10,
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
                        border: "1px solid var(--dg-color-border)",
                        borderRadius: "var(--dg-radius-sm)",
                        cursor: "pointer",
                        padding: 2,
                        flexShrink: 0,
                      }}
                    />
                    {shiftDisplayMode === "code" && (
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
                        style={{ flex: 1, maxWidth: 90 }}
                      />
                    )}
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
                      <Button
                        type="button"
                        className="dg-btn dg-btn-ghost"
                        onClick={() => setJobs((prev) => prev.filter((_, i) => i !== idx))}
                        style={{ padding: "6px 8px" }}
                      >
                        <X size={14} />
                      </Button>
                    )}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 10,
                    }}
                  >
                    <div>
                      <label style={labelStyle}>Departments</label>
                      <CustomSelect
                        value={selectedDepartmentId}
                        options={[
                          { value: "__none__", label: "Select scheduled department" },
                          ...scheduledDepartments.map((department) => ({
                            value: department.id,
                            label: department.name.trim() || "Unnamed department",
                          })),
                        ]}
                        onChange={(val) =>
                          setJobs((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? {
                                    ...item,
                                    departmentIds: val === "__none__" ? [] : [val],
                                    focusAreaIds: [],
                                    shiftCategoryIds: [],
                                  }
                                : item,
                            ),
                          )
                        }
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>{focusAreaLabel}</label>
                      <CustomSelect
                        value={selectedFocusAreaId}
                        options={[
                          {
                            value: "__none__",
                            label: `Select ${focusAreaLabel.replace(/s$/, "").toLowerCase()}`,
                          },
                          ...selectableFocusAreas.map((focusArea) => ({
                            value: focusArea.id,
                            label: focusArea.name,
                          })),
                        ]}
                        onChange={(val) =>
                          setJobs((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? {
                                    ...item,
                                    focusAreaIds: val === "__none__" ? [] : [val],
                                    shiftCategoryIds: [],
                                  }
                                : item,
                            ),
                          )
                        }
                        style={{ width: "100%" }}
                        disabled={selectedDepartmentId === "__none__"}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Shifts</label>
                      <CustomSelect
                        value={job.shiftCategoryIds[0] ?? "__none__"}
                        options={[
                          { value: "__none__", label: "Select shift" },
                          ...selectableShifts.map((shift) => ({
                            value: shift.id,
                            label: shift.name,
                          })),
                        ]}
                        onChange={(val) =>
                          setJobs((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, shiftCategoryIds: val === "__none__" ? [] : [val] }
                                : item,
                            ),
                          )
                        }
                        style={{ width: "100%" }}
                        disabled={selectedFocusAreaId === "__none__"}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            <Button
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
                    departmentIds: [],
                    focusAreaIds: [],
                    shiftCategoryIds: [],
                  },
                ])
              }
              style={{ fontSize: "var(--dg-fs-label)" }}
            >
              + Add job
            </Button>
          </div>
        </div>

        <ActionBar>
          <Button
            type="button"
            className="dg-btn dg-btn-ghost"
            onClick={() => setCurrentStep("employees")}
          >
            Skip
          </Button>
          <Button
            type="button"
            className="dg-btn dg-btn-primary"
            disabled={saving}
            onClick={() => setSetupConfirmAction("save-configuration")}
          >
            <ButtonLoading loading={saving}>Next</ButtonLoading>
          </Button>
        </ActionBar>
      </>
    );
  }

  // ── Render: Step 4 — Employees ────────────────────────────────────────────

  function renderEmployees() {
    return (
      <>
        <div style={{ ...sectionStyle, marginBottom: 20 }}>
          <div style={sectionHeaderStyle}>
            Add Employees
            {readyEmployeeCount > 0 && (
              <span
                style={{
                  fontWeight: 500,
                  color: "var(--dg-color-text-muted)",
                  marginLeft: 8,
                }}
              >
                ({readyEmployeeCount} ready)
              </span>
            )}
          </div>
          <div style={sectionBodyStyle}>
            <p
              style={{
                margin: "0 0 16px",
                fontSize: "var(--dg-fs-label)",
                color: "var(--dg-color-text-muted)",
              }}
            >
              Add your staff members. At minimum, provide a first name. Email is needed if you want
              to invite them in the next step.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 16,
                maxWidth: 420,
              }}
            >
              <div>
                <label htmlFor="wizard-employees-ready-count" style={labelStyle}>
                  Employees Ready To Create
                </label>
                <input
                  id="wizard-employees-ready-count"
                  className="dg-input"
                  value={String(readyEmployeeCount)}
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
                First Name <span style={{ color: "var(--dg-color-danger)" }}>*</span>
              </span>
              <span style={{ ...labelStyle, marginBottom: 0 }}>Last name</span>
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
                  onChange={(e) => updateEmployeeRow(idx, { firstName: e.target.value })}
                  placeholder="John"
                />
                <input
                  className="dg-input"
                  value={row.lastName}
                  onChange={(e) => updateEmployeeRow(idx, { lastName: e.target.value })}
                  placeholder="Doe"
                />
                <input
                  className="dg-input"
                  type="email"
                  value={row.email}
                  onChange={(e) => updateEmployeeRow(idx, { email: e.target.value })}
                  placeholder="john@example.com"
                />
                <input
                  className="dg-input"
                  type="tel"
                  value={row.phone}
                  onChange={(e) => updateEmployeeRow(idx, { phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
                <Button
                  type="button"
                  className="dg-btn dg-btn-ghost"
                  onClick={() => removeEmployeeRow(idx)}
                  style={{
                    padding: "6px",
                    opacity: employeeRows.length > 1 ? 1 : 0.3,
                  }}
                  disabled={employeeRows.length <= 1}
                >
                  <X size={14} />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              className="dg-btn dg-btn-ghost"
              onClick={() => addEmployeeRows(5)}
              style={{ fontSize: "var(--dg-fs-label)", marginTop: 8 }}
            >
              + Add 5 more rows
            </Button>
          </div>
        </div>

        <ActionBar>
          <Button
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
          </Button>
          <Button
            type="button"
            className="dg-btn dg-btn-primary"
            disabled={saving || readyEmployeeCount === 0}
            onClick={() => setSetupConfirmAction("create-employees")}
          >
            <ButtonLoading loading={saving}>
              {`Create ${readyEmployeeCount} Employee${readyEmployeeCount !== 1 ? "s" : ""}`}
            </ButtonLoading>
          </Button>
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
              <span
                style={{
                  fontWeight: 500,
                  color: "var(--dg-color-text-muted)",
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
                color: "var(--dg-color-text-muted)",
              }}
            >
              Select employees to invite. They will receive an email with a link to set their
              password and join the organization.
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
                  color: "var(--dg-color-text-muted)",
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
                    color: "var(--dg-color-text-primary)",
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
                    style={{ accentColor: "var(--dg-color-primary)" }}
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
                            i === idx ? { ...r, selected: e.target.checked } : r,
                          ),
                        );
                      }}
                      style={{ accentColor: "var(--dg-color-primary)" }}
                    />
                    <span
                      style={{
                        fontSize: "var(--dg-fs-label)",
                        fontWeight: 500,
                        color: "var(--dg-color-text-primary)",
                      }}
                    >
                      {inv.name}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--dg-fs-label)",
                        color: "var(--dg-color-text-muted)",
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
          <Button
            type="button"
            className="dg-btn dg-btn-ghost"
            onClick={() => {
              if (createdOrg) onCreated(createdOrg);
            }}
          >
            Skip
          </Button>
          <Button
            type="button"
            className="dg-btn dg-btn-primary"
            disabled={saving || selectedCount === 0}
            onClick={() => setSetupConfirmAction("send-invitations")}
          >
            <ButtonLoading loading={saving}>
              {`Send ${selectedCount} Invitation${selectedCount !== 1 ? "s" : ""} & Finish`}
            </ButtonLoading>
          </Button>
        </ActionBar>
      </>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  const setupConfirmCopy =
    setupConfirmAction === "create-organization"
      ? {
          title: "Create Organization",
          message: `Create "${name.trim()}" and assign "${superAdminEmail.trim()}" as the initial super admin?`,
          confirmLabel: "Create Organization",
          variant: "warning" as const,
        }
      : setupConfirmAction === "save-configuration"
        ? {
            title: "Save Configuration",
            message: `Save configuration items for ${createdOrg?.name ?? "this organization"} and continue to employees?`,
            confirmLabel: "Save Configuration",
            variant: "warning" as const,
          }
        : setupConfirmAction === "create-employees"
          ? {
              title: "Create Employees",
              message: `Create ${readyEmployeeCount} employee${readyEmployeeCount !== 1 ? "s" : ""} for ${createdOrg?.name ?? "this organization"}?`,
              confirmLabel: "Create Employees",
              variant: "warning" as const,
            }
          : setupConfirmAction === "send-invitations"
            ? {
                title: "Send Invitations",
                message: `Send ${selectedInvitationCount} invitation${selectedInvitationCount !== 1 ? "s" : ""} for ${createdOrg?.name ?? "this organization"}?`,
                confirmLabel: "Send Invitations",
                variant: "warning" as const,
              }
            : null;

  return (
    <div style={{ maxWidth: currentStep === "config" ? 960 : 720, margin: "0 auto" }}>
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
            color: "var(--dg-color-text-primary)",
          }}
        >
          {currentStep === "decision" ? "Organization Created" : "Create Organization"}
        </h2>
        {currentStep !== "decision" && (
          <Button type="button" className="dg-btn dg-btn-ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>

      <WizardStepper currentStep={currentStep} />

      {currentStep === "details" && renderDetails()}
      {currentStep === "super-admin" && renderSuperAdmin()}
      {currentStep === "decision" && renderDecision()}
      {currentStep === "config" && renderConfig()}
      {currentStep === "employees" && renderEmployees()}
      {currentStep === "invitations" && renderInvitations()}
      {setupConfirmCopy && (
        <ConfirmDialog
          title={setupConfirmCopy.title}
          message={setupConfirmCopy.message}
          confirmLabel={setupConfirmCopy.confirmLabel}
          variant={setupConfirmCopy.variant}
          isLoading={saving}
          onConfirm={handleConfirmSetupAction}
          onCancel={() => setSetupConfirmAction(null)}
        />
      )}
    </div>
  );
}

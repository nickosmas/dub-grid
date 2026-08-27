import ConfirmDialog from "@/components/ConfirmDialog";
import CustomSelect from "@/components/CustomSelect";
import { Form } from "@/components/Form";
import { Button } from "@/components/Button";
import PermissionsEditor from "@/components/PermissionsEditor";
import { assignGridmasterOrgRoleByEmail } from "@/features/gridmaster/client";
import {
  OrganizationAccessConflictError,
  removeOrganizationMembershipGuarded,
  updateOrganizationMembershipGuarded,
} from "@/features/organization/client";
import { buildMembershipAccessChanges } from "@/lib/access-management";
import { formatClientErrorMessage, formatOrganizationRoleLabel } from "@/lib/client-facing";
import { queueNotification } from "@/lib/notify";
import { labelStyle, sectionStyle, tdStyle, thStyle } from "@/lib/styles";
import {
  type AdminPermissions,
  type Organization,
  type OrganizationRole,
  type OrganizationUser,
} from "@/types";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ButtonLoading } from "@/components/ButtonSpinner";

// Users tab for the gridmaster OrganizationDetail view.

export function formatPermissions(p: AdminPermissions): string {
  const granted = Object.entries(p)
    .filter(([, v]) => v === true)
    .map(([k]) =>
      k
        .replace(/^can/, "")
        .replace(/([A-Z])/g, " $1")
        .trim(),
    );
  if (granted.length === 0) return "None";
  if (granted.length > 3) return `${granted.length} permissions`;
  return granted.join(", ");
}

export function UsersTab({
  users,
  orgId,
  onUsersChanged,
  onImpersonate,
}: {
  users: OrganizationUser[];
  orgId: string;
  onUsersChanged: () => void;
  onImpersonate?: (userId: string, orgId?: string) => void;
}) {
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [roleChangeConfirm, setRoleChangeConfirm] = useState<{
    user: OrganizationUser;
    newRole: OrganizationRole;
  } | null>(null);
  const [editingPerms, setEditingPerms] = useState<OrganizationUser | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<OrganizationUser | null>(null);
  const [removing, setRemoving] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "user">("user");
  const [addUserConfirm, setAddUserConfirm] = useState<{
    email: string;
    role: "admin" | "user";
  } | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenuId) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuId]);

  function handleRoleChange(userId: string, newRole: OrganizationRole) {
    const target = users.find((u) => u.id === userId);
    if (!target || target.orgRole === newRole) return;
    setRoleChangeConfirm({ user: target, newRole });
  }

  async function handleConfirmRoleChange() {
    if (!roleChangeConfirm) return;
    const { user: target, newRole } = roleChangeConfirm;
    setChangingRole(target.id);
    try {
      if (!target?.updatedAt) {
        throw new Error("User access data is out of date. Refresh and try again.");
      }
      const oldRole = target?.orgRole ?? "user";
      await updateOrganizationMembershipGuarded({
        orgId,
        userId: target.id,
        expectedUpdatedAt: target.updatedAt,
        orgRole: newRole,
        adminPermissions: newRole === "admin" ? target.adminPermissions : null,
      });
      toast.success("Role updated");
      setRoleChangeConfirm(null);
      queueNotification({
        action: "role_changed",
        orgId,
        targetUserId: target.id,
        fromRole: oldRole,
        toRole: newRole,
      });
      onUsersChanged();
    } catch (err: unknown) {
      if (err instanceof OrganizationAccessConflictError) {
        toast.error("User access changed elsewhere. Review the latest values and try again.");
        onUsersChanged();
      } else {
        toast.error(formatClientErrorMessage(err, "We couldn't change role. Try again."));
      }
    } finally {
      setChangingRole(null);
    }
  }

  async function handleRemove() {
    if (!removeConfirm) return;
    setRemoving(true);
    try {
      if (!removeConfirm.updatedAt) {
        throw new Error("User access data is out of date. Refresh and try again.");
      }
      await removeOrganizationMembershipGuarded({
        orgId,
        userId: removeConfirm.id,
        expectedUpdatedAt: removeConfirm.updatedAt,
      });
      toast.success("User removed from organization");
      setRemoveConfirm(null);
      onUsersChanged();
    } catch (err: unknown) {
      if (err instanceof OrganizationAccessConflictError) {
        toast.error("User access changed elsewhere. Review the latest values and try again.");
        onUsersChanged();
      } else {
        toast.error(formatClientErrorMessage(err, "We couldn't remove user. Try again."));
      }
    } finally {
      setRemoving(false);
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    const email = addEmail.trim();
    if (!email) return;
    setAddUserConfirm({ email, role: addRole });
  }

  async function handleConfirmAddUser() {
    if (!addUserConfirm) return;
    setAdding(true);
    try {
      await assignGridmasterOrgRoleByEmail(orgId, addUserConfirm.email, addUserConfirm.role);
      toast.success(`User added as ${formatOrganizationRoleLabel(addUserConfirm.role)}`);
      setAddEmail("");
      setAddUserConfirm(null);
      setShowAddForm(false);
      onUsersChanged();
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "We couldn't add user. Try again."));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}>
          {users.length} user{users.length !== 1 ? "s" : ""}
        </span>
        <div style={{ flex: 1 }} />
        <Button
          className="dg-btn dg-btn-primary"
          style={{ padding: "7px 14px", fontSize: "var(--dg-fs-label)" }}
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? (
            "Cancel"
          ) : (
            <>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add
            </>
          )}
        </Button>
      </div>

      {/* Add user form */}
      {showAddForm && (
        <Form onSubmit={handleAddUser} style={{ ...sectionStyle, padding: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={labelStyle}>Email</label>
              <input
                className="dg-input"
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="user@example.com"
                required
              />
            </div>
            <div style={{ minWidth: 120 }}>
              <label style={labelStyle}>Role</label>
              <CustomSelect
                value={addRole}
                options={[
                  { value: "user", label: "User" },
                  { value: "admin", label: "Admin" },
                ]}
                onChange={(v) => setAddRole(v as "admin" | "user")}
                style={{ width: "100%" }}
              />
            </div>
            <button
              type="submit"
              className="dg-btn dg-btn-primary"
              disabled={adding}
              style={{ fontSize: "var(--dg-fs-caption)" }}
            >
              <ButtonLoading loading={adding}>Add</ButtonLoading>
            </button>
          </div>
        </Form>
      )}

      {/* Users table */}
      <div style={{ ...sectionStyle, overflow: "visible" }}>
        <div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Organization Role</th>
                <th style={thStyle}>Permissions</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      ...tdStyle,
                      textAlign: "center",
                      color: "var(--dg-color-text-muted)",
                      padding: 32,
                    }}
                  >
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{u.email ?? "—"}</td>
                    <td style={tdStyle}>
                      <CustomSelect
                        value={u.orgRole}
                        options={[
                          { value: "user", label: "User" },
                          { value: "admin", label: "Admin" },
                          { value: "super_admin", label: "Super Admin" },
                        ]}
                        onChange={(v) => handleRoleChange(u.id, v as OrganizationRole)}
                        disabled={changingRole === u.id || roleChangeConfirm?.user.id === u.id}
                        style={{ width: 140 }}
                        fontSize={12}
                      />
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        fontSize: "var(--dg-fs-footnote)",
                        color: "var(--dg-color-text-muted)",
                      }}
                    >
                      {u.orgRole === "admin" ? (
                        <Button
                          className="dg-btn dg-btn-ghost"
                          style={{ fontSize: "var(--dg-fs-footnote)", padding: "2px 6px" }}
                          onClick={() => setEditingPerms(u)}
                        >
                          {u.adminPermissions ? formatPermissions(u.adminPermissions) : "Configure"}
                        </Button>
                      ) : u.orgRole === "super_admin" ? (
                        "All"
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={tdStyle}>
                      {(onImpersonate && u.platformRole !== "gridmaster") ||
                      u.orgRole !== "super_admin" ? (
                        <div
                          style={{ position: "relative" }}
                          ref={openMenuId === u.id ? menuRef : undefined}
                        >
                          <Button
                            className="dg-btn dg-btn-ghost"
                            style={{ padding: "4px 8px", lineHeight: 1 }}
                            onClick={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <circle cx="12" cy="5" r="1" />
                              <circle cx="12" cy="12" r="1" />
                              <circle cx="12" cy="19" r="1" />
                            </svg>
                          </Button>
                          {openMenuId === u.id && (
                            <div
                              className="dg-menu"
                              style={{
                                position: "absolute",
                                top: "calc(100% + 4px)",
                                right: 0,
                                zIndex: 200,
                                minWidth: 150,
                              }}
                            >
                              {onImpersonate && u.platformRole !== "gridmaster" && (
                                <Button
                                  className="dg-menu-item"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    onImpersonate(u.id, orgId);
                                  }}
                                >
                                  <svg
                                    width="13"
                                    height="13"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                  </svg>
                                  Impersonate
                                </Button>
                              )}
                              {u.orgRole === "admin" && (
                                <Button
                                  className="dg-menu-item"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    setEditingPerms(u);
                                  }}
                                >
                                  <svg
                                    width="13"
                                    height="13"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                  </svg>
                                  Permissions
                                </Button>
                              )}
                              {u.orgRole !== "super_admin" && (
                                <>
                                  <div className="dg-menu-divider" />
                                  <Button
                                    className="dg-menu-item dg-menu-item--danger"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setRemoveConfirm(u);
                                    }}
                                  >
                                    <svg
                                      width="13"
                                      height="13"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                      <path d="M10 11v6" />
                                      <path d="M14 11v6" />
                                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                    </svg>
                                    Remove
                                  </Button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Permissions editor modal */}
      {editingPerms && (
        <PermissionsEditor
          title={`Admin Permissions \u2014 ${[editingPerms.firstName, editingPerms.lastName].filter(Boolean).join(" ") || editingPerms.email || "User"}`}
          subtitle={
            <>
              Configure which actions this admin can perform. <em>View Schedule</em> and{" "}
              <em>View Staff</em> are always enabled.
            </>
          }
          initialPermissions={editingPerms.adminPermissions}
          buildReview={(perms) => {
            const changes = buildMembershipAccessChanges(editingPerms, {
              orgRole: editingPerms.orgRole,
              adminPermissions: perms,
            });
            return changes.length > 0
              ? {
                  title: "Review Permission Changes",
                  description:
                    "Review these permission changes before saving. Admin access changes affect what this person can see and do across the organization.",
                  changes,
                  confirmLabel: "Confirm Save",
                  warningText: "This save updates sensitive admin permissions.",
                }
              : null;
          }}
          onSave={async (perms) => {
            if (!editingPerms.updatedAt) {
              throw new Error("User access data is out of date. Refresh and try again.");
            }
            try {
              await updateOrganizationMembershipGuarded({
                orgId,
                userId: editingPerms.id,
                expectedUpdatedAt: editingPerms.updatedAt,
                adminPermissions: perms,
              });
              toast.success("Permissions updated");
              onUsersChanged();
            } catch (err) {
              if (err instanceof OrganizationAccessConflictError) {
                toast.error(
                  "Permissions changed elsewhere. Review the latest values and try again.",
                );
                onUsersChanged();
                throw err;
              }
              throw err;
            }
          }}
          onClose={() => setEditingPerms(null)}
        />
      )}

      {/* Remove confirm */}
      {removeConfirm && (
        <ConfirmDialog
          title="Remove User"
          message={`Remove "${removeConfirm.email ?? removeConfirm.id}" from this organization? They will lose access.`}
          confirmLabel="Remove"
          variant="danger"
          isLoading={removing}
          onConfirm={handleRemove}
          onCancel={() => setRemoveConfirm(null)}
        />
      )}

      {roleChangeConfirm && (
        <ConfirmDialog
          title="Change Organization Role"
          message={`Change ${roleChangeConfirm.user.email ?? "this user"} from ${formatOrganizationRoleLabel(roleChangeConfirm.user.orgRole)} to ${formatOrganizationRoleLabel(roleChangeConfirm.newRole)}?`}
          confirmLabel="Change Role"
          variant="warning"
          isLoading={changingRole === roleChangeConfirm.user.id}
          onConfirm={handleConfirmRoleChange}
          onCancel={() => setRoleChangeConfirm(null)}
        />
      )}

      {addUserConfirm && (
        <ConfirmDialog
          title="Add Organization User"
          message={`Add "${addUserConfirm.email}" as ${formatOrganizationRoleLabel(addUserConfirm.role)} for this organization?`}
          confirmLabel="Add User"
          variant="warning"
          isLoading={adding}
          onConfirm={handleConfirmAddUser}
          onCancel={() => setAddUserConfirm(null)}
        />
      )}
    </div>
  );
}

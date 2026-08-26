import { resolveShiftPillColors, toDarkPillColors } from "@/lib/colors";
import { sectionBodyStyle, sectionHeaderStyle, sectionStyle } from "@/lib/styles";
import {
  type AbsenceType,
  type FocusArea,
  type IndicatorType,
  type JobDefinition,
  type NamedItem,
  type Organization,
  type ShiftCategory,
} from "@/types";
import { useTheme } from "next-themes";

// Configuration tab for the gridmaster OrganizationDetail view.

export function ConfigTab({
  focusAreas,
  shiftCategories,
  jobs,
  absenceTypes,
  certifications,
  orgRoles,
  indicatorTypes,
  organization,
}: {
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  absenceTypes: AbsenceType[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  indicatorTypes: IndicatorType[];
  organization: Organization;
}) {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const activeFocusAreas = focusAreas.filter((fa) => !fa.archivedAt);
  const archivedFocusAreas = focusAreas.filter((fa) => fa.archivedAt);
  const activeShiftCategories = shiftCategories.filter((shift) => !shift.archivedAt);
  const archivedShiftCategories = shiftCategories.filter((shift) => shift.archivedAt);
  const activeJobs = jobs.filter((job) => !job.archivedAt);
  const archivedJobs = jobs.filter((job) => job.archivedAt);
  const activeAbsenceTypes = absenceTypes.filter((at) => !at.archivedAt);
  const archivedAbsenceTypes = absenceTypes.filter((at) => at.archivedAt);
  const activeCerts = certifications.filter((c) => !c.archivedAt);
  const activeRoles = orgRoles.filter((r) => !r.archivedAt);
  const activeIndicators = indicatorTypes.filter((i) => !i.archivedAt);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Focus Areas */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          {organization.focusAreaLabel || "Focus Areas"} ({activeFocusAreas.length})
          {archivedFocusAreas.length > 0 && (
            <span
              style={{
                fontWeight: 400,
                fontSize: "var(--dg-fs-caption)",
                color: "var(--dg-color-text-muted)",
                marginLeft: 8,
              }}
            >
              +{archivedFocusAreas.length} archived
            </span>
          )}
        </div>
        <div style={sectionBodyStyle}>
          {activeFocusAreas.length === 0 ? (
            <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--dg-color-text-muted)" }}>
              None configured
            </span>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {activeFocusAreas.map((fa) => (
                <span
                  key={fa.id}
                  style={{
                    display: "inline-block",
                    padding: "5px 12px",
                    borderRadius: 8,
                    fontSize: "var(--dg-fs-caption)",
                    fontWeight: 600,
                    background: "var(--dg-color-bg-secondary)",
                    color: "var(--dg-color-text-secondary)",
                  }}
                >
                  {fa.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Shifts */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          Shifts ({activeShiftCategories.length})
          {archivedShiftCategories.length > 0 && (
            <span
              style={{
                fontWeight: 400,
                fontSize: "var(--dg-fs-caption)",
                color: "var(--dg-color-text-muted)",
                marginLeft: 8,
              }}
            >
              +{archivedShiftCategories.length} archived
            </span>
          )}
        </div>
        <div
          style={{
            ...sectionBodyStyle,
            padding: activeShiftCategories.length > 0 ? 0 : sectionBodyStyle.padding,
          }}
        >
          {activeShiftCategories.length === 0 ? (
            <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--dg-color-text-muted)" }}>
              None configured
            </span>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Shift", "Short Code", "Times", "Focus Area"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 14px",
                        fontSize: "var(--dg-fs-badge)",
                        fontWeight: 700,
                        color: "var(--dg-color-text-subtle)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        textAlign: "left",
                        whiteSpace: "nowrap",
                        borderBottom: "1px solid var(--dg-color-border-light)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeShiftCategories.map((shift) => {
                  const faName = focusAreas.find((fa) => fa.id === shift.focusAreaId)?.name;
                  const hasTime = shift.startTime || shift.endTime;
                  return (
                    <tr key={shift.id}>
                      <td
                        style={{
                          padding: "8px 14px",
                          borderBottom: "1px solid var(--dg-color-border-light)",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 48,
                            height: 26,
                            padding: "0 8px",
                            borderRadius: 8,
                            fontSize: "var(--dg-fs-caption)",
                            fontWeight: 700,
                            background: "var(--dg-color-bg-secondary)",
                            color: "var(--dg-color-text-primary)",
                            border: "1.5px solid var(--dg-color-border-light)",
                          }}
                        >
                          {shift.name}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "8px 14px",
                          fontSize: "var(--dg-fs-label)",
                          fontWeight: 600,
                          color: "var(--dg-color-text-primary)",
                          borderBottom: "1px solid var(--dg-color-border-light)",
                        }}
                      >
                        {shift.abbr?.trim() || "—"}
                      </td>
                      <td
                        style={{
                          padding: "8px 14px",
                          fontSize: "var(--dg-fs-caption)",
                          fontFamily: "var(--font-dm-mono), monospace",
                          color: "var(--dg-color-text-muted)",
                          borderBottom: "1px solid var(--dg-color-border-light)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {hasTime ? `${shift.startTime ?? "—"} – ${shift.endTime ?? "—"}` : "—"}
                      </td>
                      <td
                        style={{
                          padding: "8px 14px",
                          fontSize: "var(--dg-fs-caption)",
                          color: faName
                            ? "var(--dg-color-text-secondary)"
                            : "var(--dg-color-text-subtle)",
                          fontWeight: faName ? 600 : 400,
                          borderBottom: "1px solid var(--dg-color-border-light)",
                        }}
                      >
                        {faName ?? "Global"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Jobs */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          Jobs ({activeJobs.length})
          {archivedJobs.length > 0 && (
            <span
              style={{
                fontWeight: 400,
                fontSize: "var(--dg-fs-caption)",
                color: "var(--dg-color-text-muted)",
                marginLeft: 8,
              }}
            >
              +{archivedJobs.length} archived
            </span>
          )}
        </div>
        <div
          style={{
            ...sectionBodyStyle,
            padding: activeJobs.length > 0 ? 0 : sectionBodyStyle.padding,
          }}
        >
          {activeJobs.length === 0 ? (
            <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--dg-color-text-muted)" }}>
              None configured
            </span>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Job", "Short Code", "Assignment", "Grid Display"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 14px",
                        fontSize: "var(--dg-fs-badge)",
                        fontWeight: 700,
                        color: "var(--dg-color-text-subtle)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        textAlign: "left",
                        whiteSpace: "nowrap",
                        borderBottom: "1px solid var(--dg-color-border-light)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeJobs.map((job) => (
                  <tr key={job.id}>
                    <td
                      style={{
                        padding: "8px 14px",
                        fontSize: "var(--dg-fs-label)",
                        fontWeight: 600,
                        color: "var(--dg-color-text-primary)",
                        borderBottom: "1px solid var(--dg-color-border-light)",
                      }}
                    >
                      {job.name}
                    </td>
                    <td
                      style={{
                        padding: "8px 14px",
                        fontSize: "var(--dg-fs-caption)",
                        fontFamily: "var(--font-dm-mono), monospace",
                        color: "var(--dg-color-text-muted)",
                        borderBottom: "1px solid var(--dg-color-border-light)",
                      }}
                    >
                      {job.abbr}
                    </td>
                    <td
                      style={{
                        padding: "8px 14px",
                        fontSize: "var(--dg-fs-caption)",
                        color: "var(--dg-color-text-secondary)",
                        borderBottom: "1px solid var(--dg-color-border-light)",
                      }}
                    >
                      {job.assignmentMode === "shiftless"
                        ? "Job-only"
                        : job.assignmentMode === "both"
                          ? "Shift + job or job-only"
                          : "Shift + job"}
                    </td>
                    <td
                      style={{
                        padding: "8px 14px",
                        fontSize: "var(--dg-fs-caption)",
                        color: "var(--dg-color-text-secondary)",
                        borderBottom: "1px solid var(--dg-color-border-light)",
                      }}
                    >
                      {job.showOnGrid ? "Shown on grid" : "Hidden on grid"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Absence Types */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          Absence Types ({activeAbsenceTypes.length})
          {archivedAbsenceTypes.length > 0 && (
            <span
              style={{
                fontWeight: 400,
                fontSize: "var(--dg-fs-caption)",
                color: "var(--dg-color-text-muted)",
                marginLeft: 8,
              }}
            >
              +{archivedAbsenceTypes.length} archived
            </span>
          )}
        </div>
        <div
          style={{
            ...sectionBodyStyle,
            padding: activeAbsenceTypes.length > 0 ? 0 : sectionBodyStyle.padding,
          }}
        >
          {activeAbsenceTypes.length === 0 ? (
            <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--dg-color-text-muted)" }}>
              None configured
            </span>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Label", "Name", "Color"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 14px",
                        fontSize: "var(--dg-fs-badge)",
                        fontWeight: 700,
                        color: "var(--dg-color-text-subtle)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        textAlign: "left",
                        whiteSpace: "nowrap",
                        borderBottom: "1px solid var(--dg-color-border-light)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeAbsenceTypes.map((at0) => {
                  const at = {
                    ...at0,
                    ...resolveShiftPillColors(
                      { color: at0.color, text: at0.text, border: at0.border },
                      isDarkTheme,
                    ),
                  };
                  return (
                    <tr key={at0.id}>
                      <td
                        style={{
                          padding: "8px 14px",
                          borderBottom: "1px solid var(--dg-color-border-light)",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 32,
                            height: 26,
                            padding: "0 8px",
                            borderRadius: 8,
                            fontSize: "var(--dg-fs-caption)",
                            fontWeight: 700,
                            background: at.color,
                            color: at.text,
                            border: `1.5px solid ${at.border}`,
                          }}
                        >
                          {at.label}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "8px 14px",
                          fontSize: "var(--dg-fs-label)",
                          fontWeight: 600,
                          color: "var(--dg-color-text-primary)",
                          borderBottom: "1px solid var(--dg-color-border-light)",
                        }}
                      >
                        {at.name}
                      </td>
                      <td
                        style={{
                          padding: "8px 14px",
                          borderBottom: "1px solid var(--dg-color-border-light)",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            width: 20,
                            height: 20,
                            borderRadius: 4,
                            background: at.color,
                            border: `1px solid ${at.border}`,
                            verticalAlign: "middle",
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Certifications */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          {organization.certificationLabel || "Certifications"} ({activeCerts.length})
        </div>
        <div style={sectionBodyStyle}>
          {activeCerts.length === 0 ? (
            <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--dg-color-text-muted)" }}>
              None configured
            </span>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {activeCerts.map((c) => (
                <span
                  key={c.id}
                  style={{
                    display: "inline-block",
                    padding: "4px 10px",
                    borderRadius: 8,
                    fontSize: "var(--dg-fs-caption)",
                    fontWeight: 600,
                    background: "var(--dg-color-bg-secondary)",
                    color: "var(--dg-color-text-secondary)",
                  }}
                >
                  {c.abbr ? `${c.abbr} — ${c.name}` : c.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Roles */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          {organization.roleLabel || "Roles"} ({activeRoles.length})
        </div>
        <div style={sectionBodyStyle}>
          {activeRoles.length === 0 ? (
            <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--dg-color-text-muted)" }}>
              None configured
            </span>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {activeRoles.map((r) => (
                <span
                  key={r.id}
                  style={{
                    display: "inline-block",
                    padding: "4px 10px",
                    borderRadius: 8,
                    fontSize: "var(--dg-fs-caption)",
                    fontWeight: 600,
                    background: "var(--dg-color-bg-secondary)",
                    color: "var(--dg-color-text-secondary)",
                  }}
                >
                  {r.abbr ? `${r.abbr} — ${r.name}` : r.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Indicator Types */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Indicator Types ({activeIndicators.length})</div>
        <div style={sectionBodyStyle}>
          {activeIndicators.length === 0 ? (
            <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--dg-color-text-muted)" }}>
              None configured
            </span>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {activeIndicators.map((ind) => (
                <span
                  key={ind.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    borderRadius: 8,
                    fontSize: "var(--dg-fs-caption)",
                    fontWeight: 600,
                    background: "var(--dg-color-bg-secondary)",
                    color: "var(--dg-color-text-secondary)",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: isDarkTheme ? toDarkPillColors(ind.color).bg : ind.color,
                      flexShrink: 0,
                    }}
                  />
                  {ind.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

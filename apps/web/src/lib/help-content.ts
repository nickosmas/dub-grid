/**
 * Centralized help text strings for in-app tooltips.
 * Grouped by feature area; ready for i18n extraction (Phase 8).
 */

export const helpText = {
  schedule: {
    publishSchedule:
      "Publishing makes the current week's schedule visible to all staff members. You can still edit after publishing.",
    recurringShifts:
      "Recurring shifts are templates that auto-fill the schedule each week. Edit them in Settings.",
    dragDrop:
      "Drag a shift or absence entry from one cell to another to move it. Hold Shift and drag to copy instead.",
    cellClick:
      "Click an empty cell to assign a shift, or click an existing shift to edit it.",
  },
  staff: {
    seniority:
      "Seniority determines the default sort order on the schedule grid. Lower numbers appear first.",
    focusAreas:
      "Focus areas group employees into schedule sections. An employee must belong to at least one.",
    certification:
      "The certification badge shown next to the employee's name on the schedule grid.",
    bulkImport:
      "Upload a CSV file to add multiple employees at once. Download the template for the expected format.",
    roles:
      "Display roles shown as tags on the schedule grid (e.g., Charge Nurse). These are cosmetic and don't affect permissions.",
  },
  settings: {
    assignments:
      "Shifts define the primary Day/Evening/Night structure, and jobs add responsibilities like Supervisor or Mentor when needed.",
    orgLabels:
      "Customize the terminology used in your organization. For example, rename 'Focus Areas' to 'Wings' or 'Units'.",
    adminPermissions:
      "Control what each admin can do. Only super admins can configure these permissions.",
    indicatorTypes:
      "Indicators are small icons shown on schedule cells to flag notes or special conditions.",
    absenceTypes:
      "Absence types (e.g., Vacation, Sick) replace the worked assignment in a cell and are tracked separately.",
  },
  profile: {
    mfa:
      "Two-factor authentication adds an extra layer of security by requiring a code from your authenticator app.",
    notifications:
      "Choose which events trigger in-app and email notifications.",
    sessions:
      "View all devices where you're currently signed in. Revoke any session you don't recognize.",
    deleteAccount:
      "Permanently deletes your account and all personal data. This cannot be undone.",
  },
  billing: {
    seats:
      "Your seat count is based on the number of users in your organization (not employees). Seats auto-sync when users are added or removed.",
    trial:
      "Your free trial includes full access to all features. No credit card required until the trial ends.",
  },
} as const;

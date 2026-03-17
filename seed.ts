import { copycat } from "@snaplet/copycat";
import { readFileSync } from "fs";
import { Client } from "pg";

// ═══════════════════════════════════════════════════════════════════════════
// 5-Tenant Seed: Realistic healthcare scheduling data
// Uses @snaplet/copycat for deterministic fake data, raw pg for inserts
// ═══════════════════════════════════════════════════════════════════════════

interface ShiftCodeDef {
  label: string;
  name: string;
  color: string;
  border_color: string;
  text_color: string;
  is_off_day: boolean;
  is_general: boolean;
  faIndex: number | null;
  catIndex: number | null;
  start?: string;
  end?: string;
}

const TENANTS = [
  {
    name: "Sunrise Senior Living",
    slug: "sunrise-senior",
    address: "450 Sutter St, San Francisco, CA 94108",
    phone: "(415) 555-0101",
    timezone: "America/Los_Angeles",
    focus_area_label: "Units",
    certification_label: "Certifications",
    role_label: "Positions",
    focusAreas: [
      { name: "Memory Care", color_bg: "#BAE6FD", color_text: "#075985" },
      { name: "Assisted Living", color_bg: "#BBF7D0", color_text: "#166534" },
      { name: "Independent Living", color_bg: "#F5D0FE", color_text: "#86198F" },
      { name: "Respite Care", color_bg: "#FECACA", color_text: "#991B1B" },
    ],
    certifications: [
      { name: "Registered Nurse", abbr: "RN" },
      { name: "Licensed Practical Nurse", abbr: "LPN" },
      { name: "Certified Nursing Assistant", abbr: "CNA" },
      { name: "Home Health Aide", abbr: "HHA" },
      { name: "Medication Aide", abbr: "MA" },
      { name: "Other", abbr: "Other" },
    ],
    orgRoles: [
      { name: "Charge Nurse", abbr: "CN" },
      { name: "Supervisor", abbr: "SUP" },
      { name: "Activities Director", abbr: "AD" },
      { name: "Med Tech", abbr: "MT" },
    ],
    shiftCategories: [
      { name: "Day Shift", color: "#C7D2FE", start_time: "07:00", end_time: "15:00", faIndex: 0 },
      { name: "Evening Shift", color: "#FDE68A", start_time: "15:00", end_time: "23:00", faIndex: 0 },
      { name: "Night Shift", color: "#BAE6FD", start_time: "23:00", end_time: "07:00", faIndex: 0 },
      { name: "Day Shift", color: "#99F6E4", start_time: "07:00", end_time: "15:00", faIndex: 1 },
      { name: "Evening Shift", color: "#DDD6FE", start_time: "15:00", end_time: "23:00", faIndex: 1 },
      { name: "Day Shift", color: "#FECDD3", start_time: "08:00", end_time: "16:00", faIndex: 2 },
      { name: "Day Shift", color: "#BBF7D0", start_time: "08:00", end_time: "16:00", faIndex: 3 },
    ],
    shiftCodes: [
      { label: "X", name: "Off", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "V", name: "Vacation", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "S", name: "Sick", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "Ofc", name: "Office", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: false, is_general: true, faIndex: null, catIndex: null },
      { label: "0.3", name: "Partial", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: false, is_general: true, faIndex: null, catIndex: null },
      { label: "D", name: "Day", color: "#A5F3FC", border_color: "transparent", text_color: "#155E75", is_off_day: false, is_general: false, faIndex: 0, catIndex: 0, start: "07:00", end: "15:00" },
      { label: "E", name: "Evening", color: "#FDE68A", border_color: "transparent", text_color: "#92400E", is_off_day: false, is_general: false, faIndex: 0, catIndex: 1, start: "15:00", end: "23:00" },
      { label: "N", name: "Night", color: "#FECDD3", border_color: "transparent", text_color: "#9F1239", is_off_day: false, is_general: false, faIndex: 0, catIndex: 2, start: "23:00", end: "07:00" },
      { label: "D", name: "Day", color: "#C7D2FE", border_color: "transparent", text_color: "#3730A3", is_off_day: false, is_general: false, faIndex: 1, catIndex: 3, start: "07:00", end: "15:00" },
      { label: "E", name: "Evening", color: "#FDE68A", border_color: "transparent", text_color: "#92400E", is_off_day: false, is_general: false, faIndex: 1, catIndex: 4, start: "15:00", end: "23:00" },
      { label: "D", name: "Day", color: "#A7F3D0", border_color: "transparent", text_color: "#065F46", is_off_day: false, is_general: false, faIndex: 2, catIndex: 5, start: "08:00", end: "16:00" },
      { label: "D", name: "Day", color: "#BFDBFE", border_color: "transparent", text_color: "#1E40AF", is_off_day: false, is_general: false, faIndex: 3, catIndex: 6, start: "08:00", end: "16:00" },
    ] as ShiftCodeDef[],
    employeeCount: 35,
    indicatorTypes: [
      { name: "Readings", color: "#FDE047" },
      { name: "Shower", color: "#FDE68A" },
      { name: "Weight Check", color: "#FED7AA" },
    ],
  },
  {
    name: "Harbor Health Center",
    slug: "harbor-health",
    address: "1200 NW Marshall St, Portland, OR 97209",
    phone: "(503) 555-0202",
    timezone: "America/Los_Angeles",
    focus_area_label: "Departments",
    certification_label: "Licenses",
    role_label: "Roles",
    focusAreas: [
      { name: "Skilled Nursing", color_bg: "#FBCFE8", color_text: "#9D174D" },
      { name: "Rehabilitation", color_bg: "#A5F3FC", color_text: "#155E75" },
      { name: "Hospice", color_bg: "#FDE68A", color_text: "#92400E" },
      { name: "Outpatient", color_bg: "#FBCFE8", color_text: "#9D174D" },
    ],
    certifications: [
      { name: "Registered Nurse", abbr: "RN" },
      { name: "Licensed Vocational Nurse", abbr: "LVN" },
      { name: "Certified Nursing Assistant", abbr: "CNA" },
      { name: "Physical Therapist", abbr: "PT" },
      { name: "Occupational Therapist", abbr: "OT" },
      { name: "Other", abbr: "Other" },
    ],
    orgRoles: [
      { name: "Charge Nurse", abbr: "CN" },
      { name: "Floor Lead", abbr: "FL" },
      { name: "Rehab Tech", abbr: "RT" },
      { name: "Case Manager", abbr: "CM" },
    ],
    shiftCategories: [
      { name: "Day Shift", color: "#E9D5FF", start_time: "06:00", end_time: "14:00", faIndex: 0 },
      { name: "Swing Shift", color: "#BFDBFE", start_time: "14:00", end_time: "22:00", faIndex: 0 },
      { name: "Night Shift", color: "#BAE6FD", start_time: "22:00", end_time: "06:00", faIndex: 0 },
      { name: "Day Shift", color: "#FECDD3", start_time: "08:00", end_time: "16:30", faIndex: 1 },
      { name: "Day Shift", color: "#A5F3FC", start_time: "08:00", end_time: "16:00", faIndex: 2 },
      { name: "Clinic Hours", color: "#FDE047", start_time: "09:00", end_time: "17:00", faIndex: 3 },
    ],
    shiftCodes: [
      { label: "X", name: "Off", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "PTO", name: "Paid Time Off", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "Ofc", name: "Office", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: false, is_general: true, faIndex: null, catIndex: null },
      { label: "0.3", name: "Partial", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: false, is_general: true, faIndex: null, catIndex: null },
      { label: "D", name: "Day", color: "#99F6E4", border_color: "transparent", text_color: "#115E59", is_off_day: false, is_general: false, faIndex: 0, catIndex: 0, start: "06:00", end: "14:00" },
      { label: "Sw", name: "Swing", color: "#E9D5FF", border_color: "transparent", text_color: "#6B21A8", is_off_day: false, is_general: false, faIndex: 0, catIndex: 1, start: "14:00", end: "22:00" },
      { label: "N", name: "Night", color: "#FED7AA", border_color: "transparent", text_color: "#9A3412", is_off_day: false, is_general: false, faIndex: 0, catIndex: 2, start: "22:00", end: "06:00" },
      { label: "R", name: "Rehab", color: "#C7D2FE", border_color: "transparent", text_color: "#3730A3", is_off_day: false, is_general: false, faIndex: 1, catIndex: 3, start: "08:00", end: "16:30" },
      { label: "H", name: "Hospice", color: "#F5D0FE", border_color: "transparent", text_color: "#86198F", is_off_day: false, is_general: false, faIndex: 2, catIndex: 4, start: "08:00", end: "16:00" },
      { label: "C", name: "Clinic", color: "#FDE68A", border_color: "transparent", text_color: "#92400E", is_off_day: false, is_general: false, faIndex: 3, catIndex: 5, start: "09:00", end: "17:00" },
    ] as ShiftCodeDef[],
    employeeCount: 40,
    indicatorTypes: [
      { name: "Vitals", color: "#BFDBFE" },
      { name: "Therapy Session", color: "#E9D5FF" },
      { name: "Pain Assessment", color: "#E9D5FF" },
    ],
  },
  {
    name: "Evergreen Care Home",
    slug: "evergreen-care",
    address: "800 Pike St, Seattle, WA 98101",
    phone: "(206) 555-0303",
    timezone: "America/Los_Angeles",
    focus_area_label: "Wings",
    certification_label: "Skill Levels",
    role_label: "Titles",
    focusAreas: [
      { name: "East Wing", color_bg: "#FECACA", color_text: "#991B1B" },
      { name: "West Wing", color_bg: "#BBF7D0", color_text: "#166534" },
      { name: "Garden Wing", color_bg: "#FDE047", color_text: "#854D0E" },
      { name: "North Wing", color_bg: "#FECACA", color_text: "#991B1B" },
    ],
    certifications: [
      { name: "Caregiver", abbr: "CG" },
      { name: "Medication Technician", abbr: "MT" },
      { name: "Activity Director", abbr: "AD" },
      { name: "Senior Caregiver", abbr: "SC" },
      { name: "Other", abbr: "Other" },
    ],
    orgRoles: [
      { name: "Lead Caregiver", abbr: "LC" },
      { name: "Medication Aide", abbr: "MA" },
      { name: "Shift Supervisor", abbr: "SS" },
    ],
    shiftCategories: [
      { name: "Morning", color: "#A5F3FC", start_time: "07:00", end_time: "15:00", faIndex: 0 },
      { name: "Afternoon", color: "#99F6E4", start_time: "15:00", end_time: "23:00", faIndex: 0 },
      { name: "Morning", color: "#DDD6FE", start_time: "07:00", end_time: "15:00", faIndex: 1 },
      { name: "Afternoon", color: "#E2E8F0", start_time: "15:00", end_time: "23:00", faIndex: 1 },
      { name: "Morning", color: "#FDE047", start_time: "07:00", end_time: "15:00", faIndex: 2 },
      { name: "Afternoon", color: "#A5F3FC", start_time: "15:00", end_time: "23:00", faIndex: 2 },
      { name: "Morning", color: "#A5F3FC", start_time: "07:00", end_time: "15:00", faIndex: 3 },
      { name: "Afternoon", color: "#BBF7D0", start_time: "15:00", end_time: "23:00", faIndex: 3 },
    ],
    shiftCodes: [
      { label: "X", name: "Off", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "Ofc", name: "Office", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: false, is_general: true, faIndex: null, catIndex: null },
      { label: "0.3", name: "Partial", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: false, is_general: true, faIndex: null, catIndex: null },
      { label: "M", name: "Morning", color: "#BBF7D0", border_color: "transparent", text_color: "#166534", is_off_day: false, is_general: false, faIndex: 0, catIndex: 0, start: "07:00", end: "15:00" },
      { label: "A", name: "Afternoon", color: "#FED7AA", border_color: "transparent", text_color: "#9A3412", is_off_day: false, is_general: false, faIndex: 0, catIndex: 1, start: "15:00", end: "23:00" },
      { label: "M", name: "Morning", color: "#FECACA", border_color: "transparent", text_color: "#991B1B", is_off_day: false, is_general: false, faIndex: 1, catIndex: 2, start: "07:00", end: "15:00" },
      { label: "A", name: "Afternoon", color: "#FBCFE8", border_color: "transparent", text_color: "#9D174D", is_off_day: false, is_general: false, faIndex: 1, catIndex: 3, start: "15:00", end: "23:00" },
      { label: "M", name: "Morning", color: "#BAE6FD", border_color: "transparent", text_color: "#075985", is_off_day: false, is_general: false, faIndex: 2, catIndex: 4, start: "07:00", end: "15:00" },
      { label: "A", name: "Afternoon", color: "#FECACA", border_color: "transparent", text_color: "#991B1B", is_off_day: false, is_general: false, faIndex: 2, catIndex: 5, start: "15:00", end: "23:00" },
      { label: "M", name: "Morning", color: "#A5F3FC", border_color: "transparent", text_color: "#155E75", is_off_day: false, is_general: false, faIndex: 3, catIndex: 6, start: "07:00", end: "15:00" },
      { label: "A", name: "Afternoon", color: "#99F6E4", border_color: "transparent", text_color: "#115E59", is_off_day: false, is_general: false, faIndex: 3, catIndex: 7, start: "15:00", end: "23:00" },
    ] as ShiftCodeDef[],
    employeeCount: 32,
    indicatorTypes: [
      { name: "Medication", color: "#FDE68A" },
      { name: "Activity", color: "#FDE047" },
      { name: "Bath Day", color: "#A5F3FC" },
    ],
  },
  {
    name: "Pacific Wellness Group",
    slug: "pacific-wellness",
    address: "9000 Wilshire Blvd, Beverly Hills, CA 90210",
    phone: "(310) 555-0404",
    timezone: "America/Los_Angeles",
    focus_area_label: "Service Lines",
    certification_label: "Credentials",
    role_label: "Roles",
    focusAreas: [
      { name: "Acute Care", color_bg: "#BBF7D0", color_text: "#166534" },
      { name: "Long-term Care", color_bg: "#F5D0FE", color_text: "#86198F" },
      { name: "Outpatient", color_bg: "#A7F3D0", color_text: "#065F46" },
      { name: "Emergency", color_bg: "#E9D5FF", color_text: "#6B21A8" },
      { name: "Behavioral Health", color_bg: "#FECACA", color_text: "#991B1B" },
    ],
    certifications: [
      { name: "Doctor of Medicine", abbr: "MD" },
      { name: "Registered Nurse", abbr: "RN" },
      { name: "Physician Assistant", abbr: "PA" },
      { name: "Medical Assistant", abbr: "MA" },
      { name: "Respiratory Therapist", abbr: "RT" },
      { name: "Social Worker", abbr: "SW" },
      { name: "Other", abbr: "Other" },
    ],
    orgRoles: [
      { name: "Attending", abbr: "ATT" },
      { name: "Charge Nurse", abbr: "CN" },
      { name: "Nurse Manager", abbr: "NM" },
      { name: "Technician", abbr: "Tech" },
      { name: "Social Worker", abbr: "SW" },
    ],
    shiftCategories: [
      { name: "Day Shift (12hr)", color: "#F5D0FE", start_time: "07:00", end_time: "19:00", faIndex: 0 },
      { name: "Night Shift (12hr)", color: "#A5F3FC", start_time: "19:00", end_time: "07:00", faIndex: 0 },
      { name: "Day Shift", color: "#D9F99D", start_time: "07:00", end_time: "15:30", faIndex: 1 },
      { name: "Evening Shift", color: "#FECDD3", start_time: "15:30", end_time: "23:30", faIndex: 1 },
      { name: "Clinic Hours", color: "#A7F3D0", start_time: "08:00", end_time: "17:00", faIndex: 2 },
      { name: "ER Shift (12hr)", color: "#FED7AA", start_time: "07:00", end_time: "19:00", faIndex: 3 },
      { name: "Day Shift", color: "#A7F3D0", start_time: "08:00", end_time: "16:00", faIndex: 4 },
    ],
    shiftCodes: [
      { label: "X", name: "Off", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "CME", name: "Education", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "Ofc", name: "Office", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: false, is_general: true, faIndex: null, catIndex: null },
      { label: "0.3", name: "Partial", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: false, is_general: true, faIndex: null, catIndex: null },
      { label: "12D", name: "12hr Day", color: "#D9F99D", border_color: "transparent", text_color: "#3F6212", is_off_day: false, is_general: false, faIndex: 0, catIndex: 0, start: "07:00", end: "19:00" },
      { label: "12N", name: "12hr Night", color: "#F5D0FE", border_color: "transparent", text_color: "#86198F", is_off_day: false, is_general: false, faIndex: 0, catIndex: 1, start: "19:00", end: "07:00" },
      { label: "D", name: "Day", color: "#FDE047", border_color: "transparent", text_color: "#854D0E", is_off_day: false, is_general: false, faIndex: 1, catIndex: 2, start: "07:00", end: "15:30" },
      { label: "E", name: "Evening", color: "#D9F99D", border_color: "transparent", text_color: "#3F6212", is_off_day: false, is_general: false, faIndex: 1, catIndex: 3, start: "15:30", end: "23:30" },
      { label: "C", name: "Clinic", color: "#FECACA", border_color: "transparent", text_color: "#991B1B", is_off_day: false, is_general: false, faIndex: 2, catIndex: 4, start: "08:00", end: "17:00" },
      { label: "ER", name: "ER Shift", color: "#FDE68A", border_color: "transparent", text_color: "#92400E", is_off_day: false, is_general: false, faIndex: 3, catIndex: 5, start: "07:00", end: "19:00" },
      { label: "BH", name: "Behavioral", color: "#A5F3FC", border_color: "transparent", text_color: "#155E75", is_off_day: false, is_general: false, faIndex: 4, catIndex: 6, start: "08:00", end: "16:00" },
    ] as ShiftCodeDef[],
    employeeCount: 45,
    indicatorTypes: [
      { name: "Assessment", color: "#DDD6FE" },
      { name: "Rounds", color: "#E2E8F0" },
      { name: "Discharge Planning", color: "#FDE68A" },
      { name: "Code Status Review", color: "#BFDBFE" },
    ],
  },
  {
    name: "Mountain View Hospice",
    slug: "mountain-view",
    address: "2100 Blake St, Denver, CO 80205",
    phone: "(720) 555-0505",
    timezone: "America/Denver",
    focus_area_label: "Programs",
    certification_label: "Certifications",
    role_label: "Disciplines",
    focusAreas: [
      { name: "Inpatient Hospice", color_bg: "#D9F99D", color_text: "#3F6212" },
      { name: "Home Care", color_bg: "#C7D2FE", color_text: "#3730A3" },
      { name: "Bereavement", color_bg: "#BBF7D0", color_text: "#166534" },
    ],
    certifications: [
      { name: "Registered Nurse", abbr: "RN" },
      { name: "Licensed Practical Nurse", abbr: "LPN" },
      { name: "Social Worker", abbr: "SW" },
      { name: "Chaplain", abbr: "CH" },
      { name: "Volunteer", abbr: "VOL" },
      { name: "Other", abbr: "Other" },
    ],
    orgRoles: [
      { name: "Case Manager", abbr: "CM" },
      { name: "Team Lead", abbr: "TL" },
      { name: "On-Call", abbr: "OC" },
    ],
    shiftCategories: [
      { name: "Day Shift", color: "#BBF7D0", start_time: "07:00", end_time: "15:00", faIndex: 0 },
      { name: "Evening Shift", color: "#FECDD3", start_time: "15:00", end_time: "23:00", faIndex: 0 },
      { name: "Night Shift", color: "#F5D0FE", start_time: "23:00", end_time: "07:00", faIndex: 0 },
      { name: "Field Visits", color: "#E9D5FF", start_time: "08:00", end_time: "17:00", faIndex: 1 },
      { name: "Support Group", color: "#E2E8F0", start_time: "10:00", end_time: "16:00", faIndex: 2 },
    ],
    shiftCodes: [
      { label: "X", name: "Off", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "B", name: "Bereavement Leave", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "Ofc", name: "Office", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: false, is_general: true, faIndex: null, catIndex: null },
      { label: "0.3", name: "Partial", color: "#E2E8F0", border_color: "transparent", text_color: "#1E293B", is_off_day: false, is_general: true, faIndex: null, catIndex: null },
      { label: "D", name: "Day", color: "#BAE6FD", border_color: "transparent", text_color: "#075985", is_off_day: false, is_general: false, faIndex: 0, catIndex: 0, start: "07:00", end: "15:00" },
      { label: "E", name: "Evening", color: "#DDD6FE", border_color: "transparent", text_color: "#5B21B6", is_off_day: false, is_general: false, faIndex: 0, catIndex: 1, start: "15:00", end: "23:00" },
      { label: "N", name: "Night", color: "#FED7AA", border_color: "transparent", text_color: "#9A3412", is_off_day: false, is_general: false, faIndex: 0, catIndex: 2, start: "23:00", end: "07:00" },
      { label: "FV", name: "Field Visit", color: "#D9F99D", border_color: "transparent", text_color: "#3F6212", is_off_day: false, is_general: false, faIndex: 1, catIndex: 3, start: "08:00", end: "17:00" },
      { label: "SG", name: "Support Group", color: "#D9F99D", border_color: "transparent", text_color: "#3F6212", is_off_day: false, is_general: false, faIndex: 2, catIndex: 4, start: "10:00", end: "16:00" },
    ] as ShiftCodeDef[],
    employeeCount: 30,
    indicatorTypes: [
      { name: "Pain Assessment", color: "#E9D5FF" },
      { name: "Family Meeting", color: "#A7F3D0" },
      { name: "Comfort Care", color: "#FED7AA" },
    ],
  },
];

const EMPLOYEE_NAMES = [
  "Maria Garcia", "James Johnson", "Sarah Williams", "Robert Brown", "Jennifer Davis",
  "Michael Miller", "Lisa Wilson", "David Moore", "Jessica Taylor", "Thomas Anderson",
  "Amanda Martinez", "Christopher Robinson", "Ashley Clark", "Daniel Rodriguez", "Emily Lewis",
  "Matthew Lee", "Stephanie Walker", "Andrew Hall", "Nicole Allen", "Joshua Young",
  "Megan Hernandez", "Kevin King", "Rachel Wright", "Brian Lopez", "Lauren Hill",
  "Ryan Scott", "Samantha Green", "Justin Adams", "Heather Baker", "Brandon Nelson",
  "Amber Carter", "Tyler Mitchell", "Kayla Perez", "Jason Roberts", "Christina Turner",
  "Nathan Phillips", "Tiffany Campbell", "Eric Parker", "Melissa Evans", "Aaron Edwards",
  "Rebecca Collins", "Patrick Stewart", "Victoria Morgan", "Sean Murphy", "Hannah Cook",
  "Cody Rogers", "Catherine Reed", "Derek Bailey", "Danielle Rivera", "Travis Cooper",
  "Michelle Thomas", "Gregory Jackson", "Brittany White", "Keith Harris", "Diana Martin",
  "Frank Thompson", "Janet Robinson", "Gary Clark", "Susan Lewis", "Peter Lee",
  "Carol Walker", "George Young", "Donna Allen", "Timothy King", "Sandra Wright",
  "Kenneth Scott", "Dorothy Hill", "Steven Green", "Nancy Adams", "Edward Baker",
  "Carolyn Nelson", "Larry Carter", "Virginia Mitchell", "Raymond Perez", "Debra Roberts",
  "Jeffrey Turner", "Laura Phillips", "Raymond Campbell", "Judith Parker", "Albert Evans",
  "Helen Edwards", "Ralph Collins", "Gloria Stewart", "Louis Morgan", "Marie Murphy",
  "Russell Cook", "Beverly Rogers", "Wayne Reed", "Frances Bailey", "Adam Rivera",
  "Rose Cooper", "Eugene Thomas", "Patricia Jackson", "Henry White", "Martha Harris",
];

function dateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Helper: coerce pg bigint strings to number
function id(val: unknown): number {
  return Number(val);
}

async function main() {
  let connectionString: string;

  if (process.env.FORCE_LOCAL_DB === "1") {
    // Explicitly forced local (from npm run db:reset)
    connectionString = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    console.log("Connecting to LOCAL Supabase...\n");
  } else if (process.env.DATABASE_URL) {
    connectionString = process.env.DATABASE_URL;
  } else if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("supabase.co")) {
    // Remote Supabase — derive pooler connection string from project ref
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
    const password = process.env.SUPABASE_DB_PASSWORD;
    if (!password) {
      console.error("ERROR: Set SUPABASE_DB_PASSWORD in .env.remote to seed remote DB.");
      console.error("Find it in Supabase Dashboard → Settings → Database → Database password");
      process.exit(1);
    }
    connectionString = `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
    console.log(`Connecting to REMOTE Supabase (${ref})...\n`);
  } else {
    connectionString = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    console.log("Connecting to LOCAL Supabase...\n");
  }

  const ssl = connectionString.includes("supabase") ? { rejectUnauthorized: false } : undefined;
  const db = new Client({ connectionString, ssl });
  await db.connect();

  // ── Cleanup ────────────────────────────────────────────────────────────
  console.log("Clearing existing seed data...");
  await db.query(`
    DO $$ BEGIN
      TRUNCATE
        public.organization_memberships,
        public.schedule_notes,
        public.shifts,
        public.recurring_shifts,
        public.shift_series,
        public.schedule_draft_sessions,
        public.recurring_shifts_draft_sessions,
        public.publish_history,
        public.employees,
        public.shift_codes,
        public.shift_categories,
        public.indicator_types,
        public.organization_roles,
        public.certifications,
        public.focus_areas
      CASCADE;
      DELETE FROM public.organizations
      WHERE slug IN ('sunrise-senior', 'harbor-health', 'evergreen-care', 'pacific-wellness', 'mountain-view', 'ardenwood');
    EXCEPTION WHEN undefined_table THEN
      NULL; -- Tables don't exist yet on first run
    END $$;
  `);

  console.log("Seeding 6 tenants...\n");
  let globalNameIdx = 0;

  for (let t = 0; t < TENANTS.length; t++) {
    const tenant = TENANTS[t];
    console.log(`  [${t + 1}/6] ${tenant.name}...`);

    // 1. Organization
    const { rows: [org] } = await db.query(
      `INSERT INTO public.organizations (name, slug, address, phone, timezone, focus_area_label, certification_label, role_label, employee_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [tenant.name, tenant.slug, tenant.address, tenant.phone, tenant.timezone,
       tenant.focus_area_label, tenant.certification_label, tenant.role_label, tenant.employeeCount]
    );
    const orgId: string = org.id;

    // 2. Focus Areas
    const focusAreaIds: number[] = [];
    for (let i = 0; i < tenant.focusAreas.length; i++) {
      const fa = tenant.focusAreas[i];
      const { rows: [row] } = await db.query(
        `INSERT INTO public.focus_areas (org_id, name, color_bg, color_text, sort_order)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [orgId, fa.name, fa.color_bg, fa.color_text, i]
      );
      focusAreaIds.push(id(row.id));
    }

    // 3. Certifications
    const certIds: number[] = [];
    for (let i = 0; i < tenant.certifications.length; i++) {
      const c = tenant.certifications[i];
      const { rows: [row] } = await db.query(
        `INSERT INTO public.certifications (org_id, name, abbr, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [orgId, c.name, c.abbr, i]
      );
      certIds.push(id(row.id));
    }

    // 4. Organization Roles
    const roleIds: number[] = [];
    for (let i = 0; i < tenant.orgRoles.length; i++) {
      const r = tenant.orgRoles[i];
      const { rows: [row] } = await db.query(
        `INSERT INTO public.organization_roles (org_id, name, abbr, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [orgId, r.name, r.abbr, i]
      );
      roleIds.push(id(row.id));
    }

    // 5. Shift Categories
    const catIds: number[] = [];
    for (let i = 0; i < tenant.shiftCategories.length; i++) {
      const cat = tenant.shiftCategories[i];
      const faId = cat.faIndex !== null ? focusAreaIds[cat.faIndex] : null;
      const { rows: [row] } = await db.query(
        `INSERT INTO public.shift_categories (org_id, name, color, start_time, end_time, sort_order, focus_area_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [orgId, cat.name, cat.color, cat.start_time, cat.end_time, i, faId]
      );
      catIds.push(id(row.id));
    }

    // 6. Shift Codes
    interface ShiftCodeRow { id: number; label: string; is_off_day: boolean; focus_area_id: number | null }
    const shiftCodeRows: ShiftCodeRow[] = [];
    for (let i = 0; i < tenant.shiftCodes.length; i++) {
      const sc = tenant.shiftCodes[i];
      const faId = sc.faIndex !== null ? focusAreaIds[sc.faIndex] : null;
      const catId = sc.catIndex !== null ? catIds[sc.catIndex] : null;
      const { rows: [row] } = await db.query(
        `INSERT INTO public.shift_codes
           (org_id, label, name, color, border_color, text_color, is_off_day, is_general,
            sort_order, focus_area_id, category_id, default_start_time, default_end_time, required_certification_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id, label, is_off_day, focus_area_id`,
        [orgId, sc.label, sc.name, sc.color, sc.border_color, sc.text_color,
         sc.is_off_day, sc.is_general, i, faId, catId,
         sc.start ?? null, sc.end ?? null, '{}']
      );
      shiftCodeRows.push({
        id: id(row.id),
        label: row.label,
        is_off_day: row.is_off_day,
        focus_area_id: row.focus_area_id != null ? id(row.focus_area_id) : null,
      });
    }

    // 7. Indicator Types
    for (let i = 0; i < tenant.indicatorTypes.length; i++) {
      const it = tenant.indicatorTypes[i];
      await db.query(
        `INSERT INTO public.indicator_types (org_id, name, color, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [orgId, it.name, it.color, i]
      );
    }

    // 8. Employees — spread across focus areas
    const empNames: string[] = [];
    for (let i = 0; i < tenant.employeeCount; i++) {
      empNames.push(EMPLOYEE_NAMES[globalNameIdx % EMPLOYEE_NAMES.length]);
      globalNameIdx++;
    }

    interface EmpRow { id: string; focus_area_ids: number[]; status: string }
    const employees: EmpRow[] = [];
    for (let i = 0; i < empNames.length; i++) {
      const name = empNames[i];
      const certId = certIds[i % certIds.length];
      // Spread employees across focus areas evenly
      const primaryFaIdx = i % focusAreaIds.length;
      const empFaIds = [focusAreaIds[primaryFaIdx]];
      // Every 3rd employee gets a secondary focus area
      if (i % 3 === 0 && focusAreaIds.length > 1) {
        empFaIds.push(focusAreaIds[(primaryFaIdx + 1) % focusAreaIds.length]);
      }
      const empRoleIds = i % 4 === 0 ? [roleIds[i % roleIds.length]] : [];
      const status = i < empNames.length - 2 ? "active" : i === empNames.length - 2 ? "benched" : "terminated";

      const { rows: [row] } = await db.query(
        `INSERT INTO public.employees
           (org_id, name, seniority, phone, email, contact_notes, certification_id, role_ids, focus_area_ids, status, status_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::bigint[],$9::integer[],$10::employee_status,$11)
         RETURNING id, focus_area_ids, status`,
        [orgId, name, empNames.length - i,
         copycat.phoneNumber(`${tenant.slug}-${name}-${i}`),
         copycat.email(`${tenant.slug}-${name}-${i}`),
         "", certId, empRoleIds, empFaIds, status, ""]
      );
      employees.push({
        id: row.id,
        focus_area_ids: (row.focus_area_ids ?? []).map(id),
        status: row.status,
      });
    }

    // 9. Shifts (March 22 – April 4, 2026 — 2 weeks of data)
    const workCodes = shiftCodeRows.filter((sc) => !sc.is_off_day);
    const offCode = shiftCodeRows.find((sc) => sc.is_off_day);
    let shiftCount = 0;

    // Batch insert for performance
    const shiftValues: unknown[][] = [];

    for (const emp of employees) {
      if (emp.status === "terminated") continue;
      const primaryFaId = emp.focus_area_ids[0] ?? null;
      const empWorkCodes = workCodes.filter(
        (sc) => sc.focus_area_id === primaryFaId || sc.focus_area_id === null
      );
      if (empWorkCodes.length === 0) continue;

      const shiftStart = new Date(2026, 2, 22); // March 22, 2026
      for (let i = 0; i < 14; i++) {
        const d = new Date(shiftStart);
        d.setDate(d.getDate() + i);
        const dt = dateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
        const dow = d.getDay();
        const rand = copycat.float(`${emp.id}-${dt}-shift`, { min: 0, max: 1 });
        if (rand > 0.92) continue; // ~8% chance of no shift

        let codeId: number;
        let faId: number | null;

        if (rand > 0.75 || (dow === 0 && rand > 0.4)) {
          // Off day (~25% chance, higher on Sundays)
          codeId = offCode ? offCode.id : empWorkCodes[0].id;
          faId = offCode ? null : primaryFaId;
        } else {
          const code = empWorkCodes[i % empWorkCodes.length];
          codeId = code.id;
          faId = code.focus_area_id ?? primaryFaId;
        }

        shiftValues.push([emp.id, dt, orgId, [codeId], [codeId], faId, false, 1]);
        shiftCount++;
      }
    }

    // Batch insert shifts (50 at a time)
    for (let i = 0; i < shiftValues.length; i += 50) {
      const batch = shiftValues.slice(i, i + 50);
      const placeholders = batch.map((_, idx) => {
        const base = idx * 8;
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4}::integer[],$${base + 5}::integer[],$${base + 6},$${base + 7},$${base + 8})`;
      }).join(",");
      const params = batch.flat();
      await db.query(
        `INSERT INTO public.shifts
           (emp_id, date, org_id, published_shift_code_ids, draft_shift_code_ids, focus_area_id, from_recurring, version)
         VALUES ${placeholders}
         ON CONFLICT (emp_id, date) DO NOTHING`,
        params
      );
    }

    console.log(`    ✓ ${tenant.focusAreas.length} focus areas, ${tenant.certifications.length} certs, ${tenant.shiftCodes.length} codes, ${employees.length} employees, ${shiftCount} shifts`);
  }

  // ── Arden Wood (6th tenant) — from existing SQL seed files ──────────
  console.log(`\n  [6/6] Arden Wood...`);

  const ardenWoodSql = readFileSync('supabase/seed_arden_wood.sql', 'utf8');
  await db.query(ardenWoodSql);

  const gridmasterSql = readFileSync('supabase/seed_gridmaster.sql', 'utf8');
  await db.query(gridmasterSql);

  console.log(`    ✓ 4 focus areas, 6 certs, 8 roles, 17 codes, 28 employees, shifts seeded (along with gridmaster user)`);

  // ── Auth Users & Profiles ──────────────────────────────────────────────
  // Create 4 test users, all assigned to the first seeded organization.
  // Uses a DO $$ block (same pattern as seed_arden_wood.sql) to avoid
  // pg driver prepared-statement type inference issues.

  console.log("\n  Creating test users...");

  // Get default and Arden Wood organization IDs
  const { rows: orgs } = await db.query(
    `SELECT id, slug FROM public.organizations WHERE slug IN ('sunrise-senior', 'ardenwood')`
  );
  const defaultOrgId = orgs.find((o: any) => o.slug === 'sunrise-senior')?.id;
  const ardenwoodOrgId = orgs.find((o: any) => o.slug === 'ardenwood')?.id;

  const TEST_USERS = [
    { email: "nicokosmas.dev@gmail.com",     platform_role: "gridmaster", org_role: "user",        label: "gridmaster",  first_name: "Nicodamus", last_name: "Kosmas", preferred_org: "sunrise-senior" },
    { email: "nicokosmas@outlook.com",        platform_role: "none",       org_role: "super_admin", label: "super_admin", first_name: "Nic",       last_name: "Kosmas", preferred_org: "ardenwood" },
    { email: "nicodamus.kosmas@icloud.com",   platform_role: "none",       org_role: "admin",       label: "admin",       first_name: "Nico",      last_name: "Kosmas", preferred_org: "sunrise-senior" },
    { email: "nicodamusalois@gmail.com",       platform_role: "none",       org_role: "user",        label: "user",        first_name: "Nick",      last_name: "Kosmas", preferred_org: "ardenwood" },
  ];

  const allAdminPerms = `'{"canEditShifts":true,"canPublishSchedule":true,"canApplyRecurringSchedule":true,"canEditNotes":true,"canManageRecurringShifts":true,"canManageShiftSeries":true,"canManageEmployees":true,"canManageFocusAreas":true,"canManageShiftCodes":true,"canManageIndicatorTypes":true,"canManageOrgSettings":true}'::jsonb`;

  for (const user of TEST_USERS) {
    const orgIdStr = user.preferred_org === 'ardenwood' ? ardenwoodOrgId : defaultOrgId;
    const orgIdSql = user.platform_role === "gridmaster" ? "NULL" : `'${orgIdStr}'`;

    await db.query(`
      DO $$
      DECLARE
        uid uuid;
      BEGIN
        SELECT id INTO uid FROM auth.users WHERE email = '${user.email}';

        IF uid IS NULL THEN
          uid := gen_random_uuid();
          INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user,
            confirmation_token, recovery_token, email_change_token_new,
            email_change_token_current, email_change, phone, phone_change,
            phone_change_token, reauthentication_token
          )
          VALUES (
            '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
            '${user.email}', crypt('password123', gen_salt('bf')), now(),
            now(), now(), '{"provider":"email","providers":["email"]}', '{}', false,
            '', '', '', '', '', NULL, '', '', ''
          );

          INSERT INTO auth.identities (
            id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
          )
          VALUES (
            gen_random_uuid(), uid, uid::text,
            format('{"sub":"%s","email":"%s"}', uid::text, '${user.email}')::jsonb,
            'email', now(), now(), now()
          );
        ELSE
          UPDATE auth.users
          SET encrypted_password = crypt('password123', gen_salt('bf')),
              email_confirmed_at = COALESCE(email_confirmed_at, now())
          WHERE id = uid;
        END IF;

        INSERT INTO public.profiles (id, org_id, platform_role, first_name, last_name)
        VALUES (uid, ${orgIdSql}, '${user.platform_role}', '${user.first_name}', '${user.last_name}')
        ON CONFLICT (id) DO UPDATE
          SET org_id        = EXCLUDED.org_id,
              platform_role = EXCLUDED.platform_role,
              first_name    = EXCLUDED.first_name,
              last_name     = EXCLUDED.last_name,
              updated_at    = NOW();
      END $$;
    `);

    console.log(`    ✓ ${user.label}: ${user.email}`);
  }

  // ── Organization Memberships ─────────────────────────────────────────
  // Create memberships for each non-gridmaster user across ALL 6 organizations.
  // Gridmaster bypasses RLS globally and doesn't need memberships.

  console.log("\n  Creating organization memberships...");

  const { rows: allOrgs } = await db.query(
    `SELECT id FROM public.organizations ORDER BY name`
  );

  const memberUsers = TEST_USERS.filter((u) => u.platform_role !== "gridmaster");

  for (const user of memberUsers) {
    const adminPermsSql = user.org_role === "admin" ? allAdminPerms : "NULL";

    for (const org of allOrgs) {
      await db.query(`
        INSERT INTO public.organization_memberships (user_id, org_id, org_role, admin_permissions)
        SELECT p.id, $1, '${user.org_role}'::org_role, ${adminPermsSql}
        FROM public.profiles p
        JOIN auth.users u ON u.id = p.id
        WHERE u.email = '${user.email}'
        ON CONFLICT (user_id, org_id) DO UPDATE
          SET org_role          = EXCLUDED.org_role,
              admin_permissions = EXCLUDED.admin_permissions
      `, [org.id]);
    }

    console.log(`    ✓ ${user.label}: ${allOrgs.length} organizations`);
  }

  console.log("\n✅ All 6 tenants + 4 test users + memberships seeded successfully!");
  await db.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

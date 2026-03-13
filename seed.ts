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
    certification_label: "Certification",
    role_label: "Position",
    focusAreas: [
      { name: "Memory Care", color_bg: "#FECACA", color_text: "#991B1B" },
      { name: "Assisted Living", color_bg: "#BFDBFE", color_text: "#1E40AF" },
      { name: "Independent Living", color_bg: "#BBF7D0", color_text: "#166534" },
      { name: "Respite Care", color_bg: "#FEF3C7", color_text: "#92400E" },
    ],
    certifications: [
      { name: "Registered Nurse", abbr: "RN" },
      { name: "Licensed Practical Nurse", abbr: "LPN" },
      { name: "Certified Nursing Assistant", abbr: "CNA" },
      { name: "Home Health Aide", abbr: "HHA" },
      { name: "Medication Aide", abbr: "MA" },
    ],
    companyRoles: [
      { name: "Charge Nurse", abbr: "CN" },
      { name: "Supervisor", abbr: "SUP" },
      { name: "Activities Director", abbr: "AD" },
      { name: "Med Tech", abbr: "MT" },
    ],
    shiftCategories: [
      { name: "Day Shift", color: "#93C5FD", start_time: "07:00", end_time: "15:00", faIndex: 0 },
      { name: "Evening Shift", color: "#FDE68A", start_time: "15:00", end_time: "23:00", faIndex: 0 },
      { name: "Night Shift", color: "#C4B5FD", start_time: "23:00", end_time: "07:00", faIndex: 0 },
      { name: "Day Shift", color: "#86EFAC", start_time: "07:00", end_time: "15:00", faIndex: 1 },
      { name: "Evening Shift", color: "#FDE68A", start_time: "15:00", end_time: "23:00", faIndex: 1 },
      { name: "Day Shift", color: "#BBF7D0", start_time: "08:00", end_time: "16:00", faIndex: 2 },
      { name: "Day Shift", color: "#FEF3C7", start_time: "08:00", end_time: "16:00", faIndex: 3 },
    ],
    shiftCodes: [
      { label: "X", name: "Off", color: "#E2E8F0", border_color: "#94A3B8", text_color: "#475569", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "V", name: "Vacation", color: "#FEF3C7", border_color: "#F59E0B", text_color: "#92400E", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "S", name: "Sick", color: "#FEE2E2", border_color: "#EF4444", text_color: "#991B1B", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "D", name: "Day", color: "#EF4444", border_color: "#DC2626", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 0, catIndex: 0, start: "07:00", end: "15:00" },
      { label: "E", name: "Evening", color: "#F59E0B", border_color: "#D97706", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 0, catIndex: 1, start: "15:00", end: "23:00" },
      { label: "N", name: "Night", color: "#8B5CF6", border_color: "#7C3AED", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 0, catIndex: 2, start: "23:00", end: "07:00" },
      { label: "D", name: "Day", color: "#3B82F6", border_color: "#2563EB", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 1, catIndex: 3, start: "07:00", end: "15:00" },
      { label: "E", name: "Evening", color: "#F59E0B", border_color: "#D97706", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 1, catIndex: 4, start: "15:00", end: "23:00" },
      { label: "D", name: "Day", color: "#22C55E", border_color: "#16A34A", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 2, catIndex: 5, start: "08:00", end: "16:00" },
      { label: "D", name: "Day", color: "#EAB308", border_color: "#CA8A04", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 3, catIndex: 6, start: "08:00", end: "16:00" },
    ] as ShiftCodeDef[],
    employeeCount: 35,
    indicatorTypes: [
      { name: "Readings", color: "#3B82F6" },
      { name: "Shower", color: "#10B981" },
      { name: "Weight Check", color: "#F59E0B" },
    ],
  },
  {
    name: "Harbor Health Center",
    slug: "harbor-health",
    address: "1200 NW Marshall St, Portland, OR 97209",
    phone: "(503) 555-0202",
    timezone: "America/Los_Angeles",
    focus_area_label: "Department",
    certification_label: "License",
    role_label: "Role",
    focusAreas: [
      { name: "Skilled Nursing", color_bg: "#DBEAFE", color_text: "#1E40AF" },
      { name: "Rehabilitation", color_bg: "#D1FAE5", color_text: "#065F46" },
      { name: "Hospice", color_bg: "#EDE9FE", color_text: "#5B21B6" },
      { name: "Outpatient", color_bg: "#FEF3C7", color_text: "#92400E" },
    ],
    certifications: [
      { name: "Registered Nurse", abbr: "RN" },
      { name: "Licensed Vocational Nurse", abbr: "LVN" },
      { name: "Certified Nursing Assistant", abbr: "CNA" },
      { name: "Physical Therapist", abbr: "PT" },
      { name: "Occupational Therapist", abbr: "OT" },
    ],
    companyRoles: [
      { name: "Charge Nurse", abbr: "CN" },
      { name: "Floor Lead", abbr: "FL" },
      { name: "Rehab Tech", abbr: "RT" },
      { name: "Case Manager", abbr: "CM" },
    ],
    shiftCategories: [
      { name: "Day Shift", color: "#93C5FD", start_time: "06:00", end_time: "14:00", faIndex: 0 },
      { name: "Swing Shift", color: "#FDE68A", start_time: "14:00", end_time: "22:00", faIndex: 0 },
      { name: "Night Shift", color: "#C4B5FD", start_time: "22:00", end_time: "06:00", faIndex: 0 },
      { name: "Day Shift", color: "#6EE7B7", start_time: "08:00", end_time: "16:30", faIndex: 1 },
      { name: "Day Shift", color: "#C4B5FD", start_time: "08:00", end_time: "16:00", faIndex: 2 },
      { name: "Clinic Hours", color: "#FDE68A", start_time: "09:00", end_time: "17:00", faIndex: 3 },
    ],
    shiftCodes: [
      { label: "X", name: "Off", color: "#E2E8F0", border_color: "#94A3B8", text_color: "#475569", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "PTO", name: "Paid Time Off", color: "#DBEAFE", border_color: "#3B82F6", text_color: "#1E40AF", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "D", name: "Day", color: "#2563EB", border_color: "#1D4ED8", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 0, catIndex: 0, start: "06:00", end: "14:00" },
      { label: "Sw", name: "Swing", color: "#F59E0B", border_color: "#D97706", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 0, catIndex: 1, start: "14:00", end: "22:00" },
      { label: "N", name: "Night", color: "#7C3AED", border_color: "#6D28D9", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 0, catIndex: 2, start: "22:00", end: "06:00" },
      { label: "R", name: "Rehab", color: "#059669", border_color: "#047857", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 1, catIndex: 3, start: "08:00", end: "16:30" },
      { label: "H", name: "Hospice", color: "#8B5CF6", border_color: "#7C3AED", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 2, catIndex: 4, start: "08:00", end: "16:00" },
      { label: "C", name: "Clinic", color: "#EAB308", border_color: "#CA8A04", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 3, catIndex: 5, start: "09:00", end: "17:00" },
    ] as ShiftCodeDef[],
    employeeCount: 40,
    indicatorTypes: [
      { name: "Vitals", color: "#EF4444" },
      { name: "Therapy Session", color: "#8B5CF6" },
      { name: "Pain Assessment", color: "#F59E0B" },
    ],
  },
  {
    name: "Evergreen Care Home",
    slug: "evergreen-care",
    address: "800 Pike St, Seattle, WA 98101",
    phone: "(206) 555-0303",
    timezone: "America/Los_Angeles",
    focus_area_label: "Wing",
    certification_label: "Skill Level",
    role_label: "Title",
    focusAreas: [
      { name: "East Wing", color_bg: "#CFFAFE", color_text: "#155E75" },
      { name: "West Wing", color_bg: "#FCE7F3", color_text: "#9D174D" },
      { name: "Garden Wing", color_bg: "#D1FAE5", color_text: "#065F46" },
      { name: "North Wing", color_bg: "#DBEAFE", color_text: "#1E40AF" },
    ],
    certifications: [
      { name: "Caregiver", abbr: "CG" },
      { name: "Medication Technician", abbr: "MT" },
      { name: "Activity Director", abbr: "AD" },
      { name: "Senior Caregiver", abbr: "SC" },
    ],
    companyRoles: [
      { name: "Lead Caregiver", abbr: "LC" },
      { name: "Medication Aide", abbr: "MA" },
      { name: "Shift Supervisor", abbr: "SS" },
    ],
    shiftCategories: [
      { name: "Morning", color: "#67E8F9", start_time: "07:00", end_time: "15:00", faIndex: 0 },
      { name: "Afternoon", color: "#F9A8D4", start_time: "15:00", end_time: "23:00", faIndex: 0 },
      { name: "Morning", color: "#67E8F9", start_time: "07:00", end_time: "15:00", faIndex: 1 },
      { name: "Afternoon", color: "#F9A8D4", start_time: "15:00", end_time: "23:00", faIndex: 1 },
      { name: "Morning", color: "#6EE7B7", start_time: "07:00", end_time: "15:00", faIndex: 2 },
      { name: "Afternoon", color: "#BBF7D0", start_time: "15:00", end_time: "23:00", faIndex: 2 },
      { name: "Morning", color: "#93C5FD", start_time: "07:00", end_time: "15:00", faIndex: 3 },
      { name: "Afternoon", color: "#BFDBFE", start_time: "15:00", end_time: "23:00", faIndex: 3 },
    ],
    shiftCodes: [
      { label: "X", name: "Off", color: "#E2E8F0", border_color: "#94A3B8", text_color: "#475569", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "M", name: "Morning", color: "#06B6D4", border_color: "#0891B2", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 0, catIndex: 0, start: "07:00", end: "15:00" },
      { label: "A", name: "Afternoon", color: "#EC4899", border_color: "#DB2777", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 0, catIndex: 1, start: "15:00", end: "23:00" },
      { label: "M", name: "Morning", color: "#06B6D4", border_color: "#0891B2", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 1, catIndex: 2, start: "07:00", end: "15:00" },
      { label: "A", name: "Afternoon", color: "#EC4899", border_color: "#DB2777", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 1, catIndex: 3, start: "15:00", end: "23:00" },
      { label: "M", name: "Morning", color: "#059669", border_color: "#047857", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 2, catIndex: 4, start: "07:00", end: "15:00" },
      { label: "A", name: "Afternoon", color: "#10B981", border_color: "#059669", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 2, catIndex: 5, start: "15:00", end: "23:00" },
      { label: "M", name: "Morning", color: "#3B82F6", border_color: "#2563EB", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 3, catIndex: 6, start: "07:00", end: "15:00" },
      { label: "A", name: "Afternoon", color: "#60A5FA", border_color: "#3B82F6", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 3, catIndex: 7, start: "15:00", end: "23:00" },
    ] as ShiftCodeDef[],
    employeeCount: 32,
    indicatorTypes: [
      { name: "Medication", color: "#EF4444" },
      { name: "Activity", color: "#10B981" },
      { name: "Bath Day", color: "#3B82F6" },
    ],
  },
  {
    name: "Pacific Wellness Group",
    slug: "pacific-wellness",
    address: "9000 Wilshire Blvd, Beverly Hills, CA 90210",
    phone: "(310) 555-0404",
    timezone: "America/Los_Angeles",
    focus_area_label: "Service Line",
    certification_label: "Credential",
    role_label: "Role",
    focusAreas: [
      { name: "Acute Care", color_bg: "#FEE2E2", color_text: "#991B1B" },
      { name: "Long-term Care", color_bg: "#DBEAFE", color_text: "#1E40AF" },
      { name: "Outpatient", color_bg: "#FEF3C7", color_text: "#92400E" },
      { name: "Emergency", color_bg: "#FECACA", color_text: "#7F1D1D" },
      { name: "Behavioral Health", color_bg: "#E0E7FF", color_text: "#3730A3" },
    ],
    certifications: [
      { name: "Doctor of Medicine", abbr: "MD" },
      { name: "Registered Nurse", abbr: "RN" },
      { name: "Physician Assistant", abbr: "PA" },
      { name: "Medical Assistant", abbr: "MA" },
      { name: "Respiratory Therapist", abbr: "RT" },
      { name: "Social Worker", abbr: "SW" },
    ],
    companyRoles: [
      { name: "Attending", abbr: "ATT" },
      { name: "Charge Nurse", abbr: "CN" },
      { name: "Nurse Manager", abbr: "NM" },
      { name: "Technician", abbr: "Tech" },
      { name: "Social Worker", abbr: "SW" },
    ],
    shiftCategories: [
      { name: "Day Shift (12hr)", color: "#FCA5A5", start_time: "07:00", end_time: "19:00", faIndex: 0 },
      { name: "Night Shift (12hr)", color: "#A5B4FC", start_time: "19:00", end_time: "07:00", faIndex: 0 },
      { name: "Day Shift", color: "#93C5FD", start_time: "07:00", end_time: "15:30", faIndex: 1 },
      { name: "Evening Shift", color: "#FDE68A", start_time: "15:30", end_time: "23:30", faIndex: 1 },
      { name: "Clinic Hours", color: "#FCD34D", start_time: "08:00", end_time: "17:00", faIndex: 2 },
      { name: "ER Shift (12hr)", color: "#FCA5A5", start_time: "07:00", end_time: "19:00", faIndex: 3 },
      { name: "Day Shift", color: "#C4B5FD", start_time: "08:00", end_time: "16:00", faIndex: 4 },
    ],
    shiftCodes: [
      { label: "X", name: "Off", color: "#E2E8F0", border_color: "#94A3B8", text_color: "#475569", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "CME", name: "Education", color: "#C084FC", border_color: "#A855F7", text_color: "#FFFFFF", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "12D", name: "12hr Day", color: "#EF4444", border_color: "#DC2626", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 0, catIndex: 0, start: "07:00", end: "19:00" },
      { label: "12N", name: "12hr Night", color: "#6366F1", border_color: "#4F46E5", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 0, catIndex: 1, start: "19:00", end: "07:00" },
      { label: "D", name: "Day", color: "#3B82F6", border_color: "#2563EB", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 1, catIndex: 2, start: "07:00", end: "15:30" },
      { label: "E", name: "Evening", color: "#F59E0B", border_color: "#D97706", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 1, catIndex: 3, start: "15:30", end: "23:30" },
      { label: "C", name: "Clinic", color: "#EAB308", border_color: "#CA8A04", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 2, catIndex: 4, start: "08:00", end: "17:00" },
      { label: "ER", name: "ER Shift", color: "#DC2626", border_color: "#B91C1C", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 3, catIndex: 5, start: "07:00", end: "19:00" },
      { label: "BH", name: "Behavioral", color: "#7C3AED", border_color: "#6D28D9", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 4, catIndex: 6, start: "08:00", end: "16:00" },
    ] as ShiftCodeDef[],
    employeeCount: 45,
    indicatorTypes: [
      { name: "Assessment", color: "#EF4444" },
      { name: "Rounds", color: "#3B82F6" },
      { name: "Discharge Planning", color: "#10B981" },
      { name: "Code Status Review", color: "#F59E0B" },
    ],
  },
  {
    name: "Mountain View Hospice",
    slug: "mountain-view",
    address: "2100 Blake St, Denver, CO 80205",
    phone: "(720) 555-0505",
    timezone: "America/Denver",
    focus_area_label: "Program",
    certification_label: "Certification",
    role_label: "Discipline",
    focusAreas: [
      { name: "Inpatient Hospice", color_bg: "#EDE9FE", color_text: "#5B21B6" },
      { name: "Home Care", color_bg: "#D1FAE5", color_text: "#065F46" },
      { name: "Bereavement", color_bg: "#FEF3C7", color_text: "#92400E" },
    ],
    certifications: [
      { name: "Registered Nurse", abbr: "RN" },
      { name: "Licensed Practical Nurse", abbr: "LPN" },
      { name: "Social Worker", abbr: "SW" },
      { name: "Chaplain", abbr: "CH" },
      { name: "Volunteer", abbr: "VOL" },
    ],
    companyRoles: [
      { name: "Case Manager", abbr: "CM" },
      { name: "Team Lead", abbr: "TL" },
      { name: "On-Call", abbr: "OC" },
    ],
    shiftCategories: [
      { name: "Day Shift", color: "#C4B5FD", start_time: "07:00", end_time: "15:00", faIndex: 0 },
      { name: "Evening Shift", color: "#FDE68A", start_time: "15:00", end_time: "23:00", faIndex: 0 },
      { name: "Night Shift", color: "#A78BFA", start_time: "23:00", end_time: "07:00", faIndex: 0 },
      { name: "Field Visits", color: "#6EE7B7", start_time: "08:00", end_time: "17:00", faIndex: 1 },
      { name: "Support Group", color: "#FDE68A", start_time: "10:00", end_time: "16:00", faIndex: 2 },
    ],
    shiftCodes: [
      { label: "X", name: "Off", color: "#E2E8F0", border_color: "#94A3B8", text_color: "#475569", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "B", name: "Bereavement Leave", color: "#FEF3C7", border_color: "#F59E0B", text_color: "#92400E", is_off_day: true, is_general: false, faIndex: null, catIndex: null },
      { label: "D", name: "Day", color: "#8B5CF6", border_color: "#7C3AED", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 0, catIndex: 0, start: "07:00", end: "15:00" },
      { label: "E", name: "Evening", color: "#F59E0B", border_color: "#D97706", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 0, catIndex: 1, start: "15:00", end: "23:00" },
      { label: "N", name: "Night", color: "#7C3AED", border_color: "#6D28D9", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 0, catIndex: 2, start: "23:00", end: "07:00" },
      { label: "FV", name: "Field Visit", color: "#059669", border_color: "#047857", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 1, catIndex: 3, start: "08:00", end: "17:00" },
      { label: "SG", name: "Support Group", color: "#EAB308", border_color: "#CA8A04", text_color: "#FFFFFF", is_off_day: false, is_general: false, faIndex: 2, catIndex: 4, start: "10:00", end: "16:00" },
    ] as ShiftCodeDef[],
    employeeCount: 30,
    indicatorTypes: [
      { name: "Pain Assessment", color: "#EF4444" },
      { name: "Family Meeting", color: "#8B5CF6" },
      { name: "Comfort Care", color: "#10B981" },
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
  const db = new Client("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
  await db.connect();

  // ── Cleanup ────────────────────────────────────────────────────────────
  console.log("Clearing existing seed data...");
  await db.query(`
    TRUNCATE
      public.company_memberships,
      public.schedule_notes,
      public.shifts,
      public.regular_shifts,
      public.shift_series,
      public.schedule_draft_sessions,
      public.employees,
      public.shift_codes,
      public.shift_categories,
      public.indicator_types,
      public.company_roles,
      public.certifications,
      public.focus_areas
    CASCADE;
    DELETE FROM public.companies
    WHERE slug IN ('sunrise-senior', 'harbor-health', 'evergreen-care', 'pacific-wellness', 'mountain-view', 'ardenwood');
  `);

  console.log("Seeding 6 tenants...\n");
  let globalNameIdx = 0;

  for (let t = 0; t < TENANTS.length; t++) {
    const tenant = TENANTS[t];
    console.log(`  [${t + 1}/6] ${tenant.name}...`);

    // 1. Company
    const { rows: [company] } = await db.query(
      `INSERT INTO public.companies (name, slug, address, phone, timezone, focus_area_label, certification_label, role_label, employee_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [tenant.name, tenant.slug, tenant.address, tenant.phone, tenant.timezone,
       tenant.focus_area_label, tenant.certification_label, tenant.role_label, tenant.employeeCount]
    );
    const companyId: string = company.id;

    // 2. Focus Areas
    const focusAreaIds: number[] = [];
    for (let i = 0; i < tenant.focusAreas.length; i++) {
      const fa = tenant.focusAreas[i];
      const { rows: [row] } = await db.query(
        `INSERT INTO public.focus_areas (company_id, name, color_bg, color_text, sort_order)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [companyId, fa.name, fa.color_bg, fa.color_text, i]
      );
      focusAreaIds.push(id(row.id));
    }

    // 3. Certifications
    const certIds: number[] = [];
    for (let i = 0; i < tenant.certifications.length; i++) {
      const c = tenant.certifications[i];
      const { rows: [row] } = await db.query(
        `INSERT INTO public.certifications (company_id, name, abbr, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [companyId, c.name, c.abbr, i]
      );
      certIds.push(id(row.id));
    }

    // 4. Company Roles
    const roleIds: number[] = [];
    for (let i = 0; i < tenant.companyRoles.length; i++) {
      const r = tenant.companyRoles[i];
      const { rows: [row] } = await db.query(
        `INSERT INTO public.company_roles (company_id, name, abbr, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [companyId, r.name, r.abbr, i]
      );
      roleIds.push(id(row.id));
    }

    // 5. Shift Categories
    const catIds: number[] = [];
    for (let i = 0; i < tenant.shiftCategories.length; i++) {
      const cat = tenant.shiftCategories[i];
      const faId = cat.faIndex !== null ? focusAreaIds[cat.faIndex] : null;
      const { rows: [row] } = await db.query(
        `INSERT INTO public.shift_categories (company_id, name, color, start_time, end_time, sort_order, focus_area_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [companyId, cat.name, cat.color, cat.start_time, cat.end_time, i, faId]
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
           (company_id, label, name, color, border_color, text_color, is_off_day, is_general,
            sort_order, focus_area_id, category_id, default_start_time, default_end_time, required_certification_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id, label, is_off_day, focus_area_id`,
        [companyId, sc.label, sc.name, sc.color, sc.border_color, sc.text_color,
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
        `INSERT INTO public.indicator_types (company_id, name, color, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [companyId, it.name, it.color, i]
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
           (company_id, name, seniority, phone, email, contact_notes, certification_id, role_ids, focus_area_ids, status, status_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::bigint[],$9::integer[],$10::employee_status,$11)
         RETURNING id, focus_area_ids, status`,
        [companyId, name, empNames.length - i,
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

    // 9. Shifts (March 1-21, 2026 — 3 weeks of data)
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

      for (let day = 1; day <= 21; day++) {
        const dt = dateStr(2026, 3, day);
        const dow = new Date(2026, 2, day).getDay();
        const rand = copycat.float(`${emp.id}-${dt}-shift`, { min: 0, max: 1 });
        if (rand > 0.92) continue; // ~8% chance of no shift

        let codeId: number;
        let faId: number | null;

        if (rand > 0.75 || (dow === 0 && rand > 0.4)) {
          // Off day (~25% chance, higher on Sundays)
          codeId = offCode ? offCode.id : empWorkCodes[0].id;
          faId = offCode ? null : primaryFaId;
        } else {
          const code = empWorkCodes[day % empWorkCodes.length];
          codeId = code.id;
          faId = code.focus_area_id ?? primaryFaId;
        }

        shiftValues.push([emp.id, dt, companyId, [codeId], [codeId], faId, false, 1]);
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
           (emp_id, date, company_id, published_shift_code_ids, draft_shift_code_ids, focus_area_id, from_regular, version)
         VALUES ${placeholders}
         ON CONFLICT (emp_id, date) DO NOTHING`,
        params
      );
    }

    console.log(`    ✓ ${tenant.focusAreas.length} focus areas, ${tenant.certifications.length} certs, ${tenant.shiftCodes.length} codes, ${employees.length} employees, ${shiftCount} shifts`);
  }

  // ── Arden Wood (6th tenant) — from existing SQL seed files ──────────
  console.log(`\n  [6/6] Arden Wood...`);

  const ardenAdminSql = readFileSync('supabase/arden_admin_seed.sql', 'utf8');
  await db.query(ardenAdminSql);

  const ardenEmployeesSql = readFileSync('supabase/seed_employees.sql', 'utf8');
  await db.query(ardenEmployeesSql);

  const ardenShiftsSql = readFileSync('supabase/seed_shifts.sql', 'utf8');
  await db.query(ardenShiftsSql);

  console.log(`    ✓ 4 focus areas, 5 certs, 8 roles, 17 codes, 28 employees, shifts seeded`);

  // ── Auth Users & Profiles ──────────────────────────────────────────────
  // Create 4 test users, all assigned to the first seeded company.
  // Uses a DO $$ block (same pattern as arden_admin_seed.sql) to avoid
  // pg driver prepared-statement type inference issues.

  console.log("\n  Creating test users...");

  // Get the first seeded company ID
  const { rows: [firstCompany] } = await db.query(
    `SELECT id FROM public.companies WHERE slug = 'sunrise-senior'`
  );
  const defaultCompanyId = firstCompany.id;

  const TEST_USERS = [
    { email: "nicokosmas.dev@gmail.com",     platform_role: "gridmaster", company_role: "user",        label: "gridmaster" },
    { email: "nicokosmas@outlook.com",        platform_role: "none",       company_role: "super_admin", label: "super_admin" },
    { email: "nicodamus.kosmas@icloud.com",   platform_role: "none",       company_role: "admin",       label: "admin" },
    { email: "nicodamusalois@gmail.com",       platform_role: "none",       company_role: "user",        label: "user" },
  ];

  const allAdminPerms = `'{"canEditShifts":true,"canPublishSchedule":true,"canApplyRegularSchedule":true,"canEditNotes":true,"canManageRegularShifts":true,"canManageShiftSeries":true,"canManageEmployees":true,"canManageFocusAreas":true,"canManageShiftCodes":true,"canManageIndicatorTypes":true,"canManageOrgSettings":true}'::jsonb`;

  for (const user of TEST_USERS) {
    const companyIdSql = user.platform_role === "gridmaster" ? "NULL" : `'${defaultCompanyId}'`;

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

        INSERT INTO public.profiles (id, company_id, platform_role)
        VALUES (uid, ${companyIdSql}, '${user.platform_role}')
        ON CONFLICT (id) DO UPDATE
          SET company_id    = EXCLUDED.company_id,
              platform_role = EXCLUDED.platform_role,
              updated_at    = NOW();
      END $$;
    `);

    console.log(`    ✓ ${user.label}: ${user.email}`);
  }

  // ── Company Memberships ────────────────────────────────────────────────
  // Create memberships for each non-gridmaster user across ALL 6 companies.
  // Gridmaster bypasses RLS globally and doesn't need memberships.

  console.log("\n  Creating company memberships...");

  const { rows: allCompanies } = await db.query(
    `SELECT id FROM public.companies ORDER BY name`
  );

  const memberUsers = TEST_USERS.filter((u) => u.platform_role !== "gridmaster");

  for (const user of memberUsers) {
    const adminPermsSql = user.company_role === "admin" ? allAdminPerms : "NULL";

    for (const company of allCompanies) {
      await db.query(`
        INSERT INTO public.company_memberships (user_id, company_id, company_role, admin_permissions)
        SELECT p.id, $1, '${user.company_role}'::company_role, ${adminPermsSql}
        FROM public.profiles p
        JOIN auth.users u ON u.id = p.id
        WHERE u.email = '${user.email}'
        ON CONFLICT (user_id, company_id) DO UPDATE
          SET company_role      = EXCLUDED.company_role,
              admin_permissions = EXCLUDED.admin_permissions
      `, [company.id]);
    }

    console.log(`    ✓ ${user.label}: ${allCompanies.length} companies`);
  }

  console.log("\n✅ All 6 tenants + 4 test users + memberships seeded successfully!");
  await db.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

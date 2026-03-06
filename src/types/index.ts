export type Section = string; // dynamic from DB (wings table)

export interface Organization {
  id: string;
  name: string;
  address: string;
  phone: string;
  employeeCount: number | null;
}

export interface Wing {
  id: number;
  orgId: string;
  name: string;
  colorBg: string;
  colorText: string;
  sortOrder: number;
}

export interface ShiftType {
  id: number;
  orgId: string;
  label: string;
  name: string;
  color: string;
  border: string;   // mapped from border_color
  text: string;     // mapped from text_color
  countsTowardDay?: boolean;
  countsTowardEve?: boolean;
  countsTowardNight?: boolean;
  isOrientation?: boolean;
  isGeneral?: boolean;
  wingName?: string | null;
  sortOrder: number;
}

export interface Employee {
  id: number;
  name: string;
  designation: string;
  roles: string[];
  fteWeight: number;
  seniority: number;
  wings: Section[];
  phone: string;
  email: string;
  contactNotes: string;
}

export type ShiftMap = Record<string, string>;

export interface EditModalState {
  empId: number;
  empName: string;
  date: Date;
  empWings: Section[];
}

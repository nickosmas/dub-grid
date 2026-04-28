import type { ShiftRequestStatus, ShiftRequestType } from "@dubgrid/domain";
import type { ScheduleCellState } from "@dubgrid/contracts";

export interface DbShiftRequest {
  id: string;
  org_id: string;
  type: ShiftRequestType;
  status: ShiftRequestStatus;
  requester_emp_id: string;
  requester_shift_date: string;
  requester_state: ScheduleCellState;
  target_emp_id: string | null;
  target_shift_date: string | null;
  target_state?: ScheduleCellState | null;
  absence_type_id: number | null;
  parent_request_id: string | null;
  admin_user_id: string | null;
  admin_note: string | null;
  expires_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  requester_first_name?: string;
  requester_last_name?: string;
  target_first_name?: string | null;
  target_last_name?: string | null;
}

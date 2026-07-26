export function isOnSchedule(focusAreaIds: number[]): boolean {
  return focusAreaIds.length > 0;
}

export function isManagementOnly(focusAreaIds: number[], departmentIds: number[]): boolean {
  return departmentIds.length > 0 && focusAreaIds.length === 0;
}

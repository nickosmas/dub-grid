export function isCurrentUsersEmployee(
  employeeUserId: string | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  return !!employeeUserId && !!currentUserId && employeeUserId === currentUserId;
}

export function getEmployeeProfileHref(
  employeeId: string,
  employeeUserId: string | null | undefined,
  currentUserId: string | null | undefined,
): string {
  return isCurrentUsersEmployee(employeeUserId, currentUserId)
    ? "/profile"
    : `/people/${employeeId}`;
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatDateKey(date: Date): string {
  // Use local components to avoid timezone shift in ISO string
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getInitials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) {
    const letters = parts[0].replace(/[^a-zA-Z]/g, "");
    return letters.slice(0, 2).toUpperCase();
  }
  const firstLetter = parts[0].replace(/[^a-zA-Z]/g, "")[0] ?? "";
  const lastLetter = parts[parts.length - 1].replace(/[^a-zA-Z]/g, "")[0] ?? "";
  return (firstLetter + lastLetter).toUpperCase();
}

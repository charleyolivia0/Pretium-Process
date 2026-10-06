export function timestampToDateInputValue(ts?: number | null): string {
  if (ts == null) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateInputValueToTimestamp(value: string): number | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const stamp = new Date(year, month - 1, day).getTime();
  return Number.isFinite(stamp) ? stamp : undefined;
}

export function todayDateInputValue(): string {
  return timestampToDateInputValue(Date.now());
}

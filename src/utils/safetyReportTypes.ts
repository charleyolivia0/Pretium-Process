export const REPORT_TYPES = [
  { value: "near_miss", label: "Near miss" },
  { value: "notice_of_violation", label: "Notice of violation" },
  { value: "first_aid_log", label: "First aid log" },
  { value: "incident_report", label: "Incident report" },
] as const;

export type IncidentReportType = (typeof REPORT_TYPES)[number]["value"];

const REPORT_TYPE_LABELS: Record<IncidentReportType, string> = {
  near_miss: "Near miss",
  notice_of_violation: "Notice of violation",
  first_aid_log: "First aid log",
  incident_report: "Incident report",
};

export function formatReportType(value?: string | null): string {
  if (value == null) return REPORT_TYPE_LABELS.incident_report;
  return REPORT_TYPE_LABELS[value as IncidentReportType] ?? REPORT_TYPE_LABELS.incident_report;
}

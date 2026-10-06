/** Display name for the Project Coordinator (PC) user who gets the corner mascot. */
export const ERIN_LEINBERGER_PC_NAME = "Erin Leinberger";
/** Display name for Jimmy Cao (PC) who gets the corner mascot variant. */
export const JIMMY_CAO_PC_NAME = "Jimmy Cao";
/** Display name options for the Project Manager (PM) user who gets the corner mascot. */
export const ALEX_MIDDLETON_PM_NAMES = ["Alex Middleton", "Alex"] as const;
/** Display name options for Scot Paterson (PM) who gets the corner mascot. */
export const SCOT_PATERSON_PM_NAMES = ["Scot Paterson", "Scott Paterson"] as const;
/** Display name options for Grayson (PM) who gets the corner mascot. First-name token match. */
export const GRAYSON_PM_NAMES = ["Grayson"] as const;
/** Display name options for Tamara Einfeld (PM) who gets the corner mascot. */
export const TAMARA_EINFELD_PM_NAMES = ["Tamara Einfeld", "Tamara"] as const;

/** Job # in name/client/location: P2551, P-2551, P 2551, etc. */
export function projectMatchesJobNumber(
  project: { name?: string; clientName?: string | null; location?: string | null } | null | undefined,
  jobNumber: string
): boolean {
  if (!project) return false;
  const num = jobNumber.replace(/\D/g, "");
  const jobLabelUpper = [project.name, project.clientName ?? "", project.location ?? ""]
    .join(" ")
    .toUpperCase();
  return (
    jobLabelUpper.includes(`P${num}`) || new RegExp(`\\bP[\\s.-]*${num}\\b`).test(jobLabelUpper)
  );
}

export function normalizePersonName(value: string | undefined): string {
  // Normalize for loose matching: lowercase, remove punctuation, collapse whitespace.
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Loose match for "First Last" style names.
 * Examples:
 * - "Alex M. Middleton" matches "Alex Middleton"
 * - "Erin Leinberger" matches "Erin Leinberger"
 */
export function personNameMatchesTarget(actualName: string | undefined, targetName: string): boolean {
  const actual = normalizePersonName(actualName);
  const target = normalizePersonName(targetName);
  if (!actual) return false;
  if (!target) return false;
  if (actual === target) return true;

  const targetTokens = target.split(" ").filter(Boolean);
  const actualTokens = actual.split(" ").filter(Boolean);

  if (targetTokens.length >= 2) {
    const first = targetTokens[0];
    const last = targetTokens[targetTokens.length - 1];
    return actualTokens.includes(first) && actualTokens.includes(last);
  }

  return actualTokens.some((t) => t === target);
}

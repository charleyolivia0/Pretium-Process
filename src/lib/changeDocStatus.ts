import type { Doc } from "../../convex/_generated/dataModel";

export function isPcnOrCorType(type: string): boolean {
  const t = type.trim().toUpperCase();
  return t === "PCN" || t === "COR";
}

export function pcnCorStatusLabel(status: string | undefined): "Approved" | "Pending" {
  return status === "paid" ? "Approved" : "Pending";
}

export function isPcnCorApproved(status: string | undefined): boolean {
  return status === "paid";
}

export function nonWorkflowStatusLabel(d: Doc<"documents">): string {
  if (isPcnOrCorType(d.type)) {
    return pcnCorStatusLabel(d.status);
  }
  const s = d.status as string | undefined;
  if (s === "paid" || s === "closed") return "Paid";
  return "Unpaid";
}

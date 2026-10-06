import { useMemo, type CSSProperties } from "react";
import { projectQueryArgs } from "../../lib/projectQueryArgs";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  CHANGE_DOCUMENT_TYPES,
  CHANGE_DOCUMENT_TYPE_LABEL,
  type ChangeDocumentType,
} from "../../lib/changeFormTemplate";

function workflowStatusDisplay(d: Doc<"documents">): string {
  const ws = d.workflowStatus;
  if (ws === "draft") return "Draft";
  if (ws === "open" || (ws == null && d.status === "unpaid")) return "Open";
  if (ws === "closed") return "Closed";
  if (ws === "approved") return "Approved";
  if (ws === "approved_as_noted") return "Approved as noted";
  if (ws === "rejected") return "Rejected";
  if (d.status === "paid") return "Paid";
  return ws ?? d.status ?? "—";
}

function managerNames(
  d: Doc<"documents">,
  usersForAssignment: { _id: Id<"users">; name?: string | null }[] | undefined,
): string {
  const ids = (d.ballInCourtUserIds?.length ? d.ballInCourtUserIds : d.assigneeUserIds) ?? [];
  if (ids.length === 0) return "—";
  return ids
    .map((uid) => usersForAssignment?.find((u) => u._id === uid)?.name ?? "Unknown")
    .join(", ");
}

function descriptionCell(d: Doc<"documents">): string {
  const desc = d.description?.trim();
  if (desc) return desc;
  const trade = d.tradeName?.trim();
  if (trade) return trade;
  return "—";
}

function formatDate(ts?: number) {
  if (ts == null) return "—";
  return new Date(ts).toLocaleDateString();
}

function typeLabel(type: string): string {
  const normalized = type.trim().toUpperCase() as ChangeDocumentType;
  return CHANGE_DOCUMENT_TYPE_LABEL[normalized] ?? type;
}

const TH: CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.45rem",
  color: "var(--text-secondary)",
  fontWeight: 600,
  fontSize: "0.8125rem",
  borderBottom: "1px solid var(--border-strong)",
  whiteSpace: "nowrap",
  backgroundColor: "var(--surface-muted)",
};

const TD: CSSProperties = {
  padding: "0.45rem 0.5rem",
  fontSize: "0.8125rem",
  color: "var(--text-primary)",
  borderBottom: "1px solid var(--border-strong)",
  verticalAlign: "top",
};

const CHANGE_TYPE_SET = new Set<string>(CHANGE_DOCUMENT_TYPES);

type Props = { projectId: string };

export function ProjectChangeManagementLog({ projectId }: Props) {
  const project = useQuery(api.projects.getProjectById, projectQueryArgs(projectId));
  const documents = useQuery(api.documents.listDocumentsByProject, projectQueryArgs(projectId));
  const usersForAssignment = useQuery(api.users.listUsersForAssignment);

  const sortedItems = useMemo(() => {
    const items = (documents ?? []).filter((d: Doc<"documents">) =>
      CHANGE_TYPE_SET.has(d.type.trim().toUpperCase()),
    );
    return [...items].sort(
      (a, b) =>
        (b.workflowDueDate ?? b.createdDate ?? b.uploadedAt) -
        (a.workflowDueDate ?? a.createdDate ?? a.uploadedAt),
    );
  }, [documents]);

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: "0 0 0.75rem 0" }}>
        {project?.name ?? "Loading…"} · Change Management Log
      </p>

      <div
        style={{
          borderRadius: "0.75rem",
          border: "2px solid var(--color-emerald-800)",
          backgroundColor: "var(--surface-card)",
          padding: "1rem",
        }}
      >
        {documents === undefined ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>Loading…</p>
        ) : sortedItems.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
            No changes logged yet for this project.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
              <thead>
                <tr>
                  <th style={TH}>Type</th>
                  <th style={TH}>Change</th>
                  <th style={TH}>Date</th>
                  <th style={TH}>Manager</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>Description</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((d) => {
                  const dateMs = d.workflowDueDate ?? d.createdDate ?? d.uploadedAt;
                  return (
                    <tr key={d._id}>
                      <td style={{ ...TD, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {typeLabel(d.type)}
                      </td>
                      <td style={TD}>
                        <a
                          href={d.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#059669", textDecoration: "none", fontWeight: 600 }}
                        >
                          {d.name}
                        </a>
                      </td>
                      <td style={{ ...TD, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {formatDate(dateMs)}
                      </td>
                      <td style={TD}>{managerNames(d, usersForAssignment)}</td>
                      <td style={{ ...TD, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {workflowStatusDisplay(d)}
                      </td>
                      <td
                        style={{
                          ...TD,
                          color: "var(--text-secondary)",
                          maxWidth: "14rem",
                          wordBreak: "break-word",
                        }}
                      >
                        {descriptionCell(d)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { isPcnOrCorType, pcnCorStatusLabel } from "../../lib/changeDocStatus";

const TH: React.CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.45rem",
  color: "var(--text-primary)",
  fontWeight: 600,
  fontSize: "0.75rem",
  borderBottom: "2px solid var(--border-strong)",
  whiteSpace: "nowrap",
  backgroundColor: "var(--surface-muted)",
};

const TD: React.CSSProperties = {
  padding: "0.45rem 0.45rem",
  fontSize: "0.75rem",
  color: "var(--text-primary)",
  borderBottom: "1px solid var(--border-strong)",
  verticalAlign: "top",
  maxWidth: "10rem",
};

const WHITE_CARD: React.CSSProperties = {
  borderRadius: "0.75rem",
  border: "3px solid #2f7d68",
  backgroundColor: "var(--surface-panel)",
  padding: "0.85rem 1rem",
  boxShadow: "0 6px 12px -8px rgba(16,185,129,0.2)",
};

const CHANGE_CARD_MIN_HEIGHT = "15rem";

const CHANGE_CARD_SHELL: React.CSSProperties = {
  ...WHITE_CARD,
  display: "flex",
  flexDirection: "column",
  minHeight: CHANGE_CARD_MIN_HEIGHT,
  height: "100%",
  boxSizing: "border-box",
  padding: "0.75rem 0.85rem 0.85rem",
  border: "2px solid var(--border-strong)",
  boxShadow: "0 4px 10px -8px rgba(17,24,39,0.35)",
};

function normalizeDocType(type: string) {
  return type.trim().toUpperCase();
}

function formatDate(ts?: number) {
  if (ts == null) return "—";
  return new Date(ts).toLocaleDateString();
}

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

type Props = { projectId: string };

export function ProjectChangesHub({ projectId }: Props) {
  const navigate = useNavigate();
  const documents = useQuery(api.documents.listDocumentsByProject, {
    projectId: projectId as Id<"projects">,
  });

  const docsByKind = useMemo(() => {
    const all: Doc<"documents">[] = documents ?? [];
    const pick = (kind: string) =>
      all
        .filter((d: Doc<"documents">) => normalizeDocType(d.type) === kind)
        .slice()
        .sort((a: Doc<"documents">, b: Doc<"documents">) => b.uploadedAt - a.uploadedAt)
        .slice(0, 5);
    return {
      RFI: pick("RFI"),
      PCN: pick("PCN"),
      CO: pick("CO"),
      COR: pick("COR"),
      SI: pick("SI"),
      SUBMITTAL: pick("SUBMITTAL"),
      PO: pick("PO"),
    };
  }, [documents]);

  const base = `/projects/${projectId}/changes`;

  const changeCards: { key: string; rows: Doc<"documents">[]; href: string; title: string }[] = [
    { key: "rfi", rows: docsByKind.RFI, href: `${base}/rfi`, title: "Requests for Information" },
    { key: "pcn", rows: docsByKind.PCN, href: `${base}/pcn`, title: "Potential Change Orders" },
    { key: "co", rows: docsByKind.CO, href: `${base}/co`, title: "Change Order" },
    { key: "cor", rows: docsByKind.COR, href: `${base}/cor`, title: "Change Order Requests" },
    { key: "si", rows: docsByKind.SI, href: `${base}/si`, title: "Site Instructions" },
    { key: "submittal", rows: docsByKind.SUBMITTAL, href: `${base}/submittal`, title: "Submittals" },
    { key: "po", rows: docsByKind.PO, href: `${base}/po`, title: "Purchase Orders" },
  ];

  function changeCardGridStyle(index: number, total: number): React.CSSProperties | undefined {
    if (total % 2 === 1 && index === total - 1) {
      return {
        gridColumn: "1 / -1",
        maxWidth: "calc((100% - 1rem) / 2)",
        width: "100%",
        justifySelf: "center",
      };
    }
    return undefined;
  }

  const addBtnStyle: React.CSSProperties = {
    padding: "0.2rem 0.45rem",
    fontSize: "0.65rem",
    fontWeight: 600,
    borderRadius: "0.35rem",
    border: "1px solid rgba(4, 120, 87, 0.55)",
    backgroundColor: "transparent",
    color: "#047857",
    cursor: "pointer",
    fontFamily: "Montserrat, sans-serif",
    flexShrink: 0,
  };

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", justifyContent: "space-between" }}>
        <h2 className="section-header" style={{ margin: 0 }}>
          Changes
        </h2>
        <Link
          to={`${base}/templates`}
          style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#047857", textDecoration: "none" }}
        >
          Template library
        </Link>
      </div>

      <div
        className="changes-hub-cards"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridAutoRows: "minmax(15rem, auto)",
          gap: "1rem",
          alignItems: "stretch",
        }}
      >
        <style>{`
          @media (max-width: 900px) {
            .changes-hub-cards {
              grid-template-columns: 1fr !important;
            }
            .changes-hub-cards > * {
              grid-column: auto !important;
              max-width: none !important;
              justify-self: stretch !important;
            }
          }
        `}</style>
        {changeCards.map((c, i) => (
          <div
            key={c.key}
            style={{
              ...CHANGE_CARD_SHELL,
              ...changeCardGridStyle(i, changeCards.length),
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                marginBottom: "0.6rem",
                flexShrink: 0,
              }}
            >
              <Link
                to={c.href}
                style={{
                  fontSize: "0.9375rem",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  textDecoration: "none",
                  flex: 1,
                  minWidth: 0,
                  backgroundColor: "var(--surface-muted)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "0.45rem",
                  padding: "0.35rem 0.5rem",
                }}
              >
                {c.title}
              </Link>
              <button
                type="button"
                onClick={() => navigate(`${c.href}?openAdd=1`)}
                aria-label={`Add new ${c.title}`}
                style={addBtnStyle}
              >
                Add
              </button>
            </div>
            <Link
              to={c.href}
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              {c.rows.length === 0 ? (
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-secondary)" }}>No items yet.</p>
              ) : (
                <div
                  style={{
                    overflow: "auto",
                    flex: 1,
                    minHeight: 0,
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "0.5rem",
                    backgroundColor: "var(--surface-panel)",
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "16rem" }}>
                    <thead>
                      <tr>
                        <th style={TH}>Title</th>
                        <th style={TH}>Status</th>
                        <th style={TH}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.rows.map((d: Doc<"documents">) => (
                        <tr key={d._id}>
                          <td style={TD}>{d.name}</td>
                          <td style={TD}>{isPcnOrCorType(d.type) ? pcnCorStatusLabel(d.status) : workflowStatusDisplay(d)}</td>
                          <td style={TD}>{formatDate(d.createdDate ?? d.uploadedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

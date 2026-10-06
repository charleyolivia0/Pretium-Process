import { useEffect, useState, type CSSProperties } from "react";
import { projectQueryArgs } from "../lib/projectQueryArgs";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { innerWhiteCardStyle, secondaryButtonStyle, shellCardStyle } from "../theme";
import { todayDateInputValue } from "../utils/dateInput";

const CLOSE_OUT_SECTIONS = [
  { id: "as-built" as const, title: "As Built" },
  { id: "o-and-m" as const, title: "O&M" },
  { id: "warranty" as const, title: "Warranty" },
  { id: "certification" as const, title: "Certification" },
  { id: "shop-drawings" as const, title: "Shop Drawings" },
] as const;

type CloseOutSectionId = (typeof CLOSE_OUT_SECTIONS)[number]["id"];

const ALL_SECTION_IDS = CLOSE_OUT_SECTIONS.map((s) => s.id);

function isCloseOutSectionId(value: string | null): value is CloseOutSectionId {
  return ALL_SECTION_IDS.includes(value as CloseOutSectionId);
}

const SUB_DOC_IDS: CloseOutSectionId[] = ["as-built", "warranty", "shop-drawings"];

type CloseOutRow = {
  id: string;
  date: string;
  trade: string;
  file: string;
};

function emptyRowsState(): Record<CloseOutSectionId, CloseOutRow[]> {
  const next = {} as Record<CloseOutSectionId, CloseOutRow[]>;
  for (const s of CLOSE_OUT_SECTIONS) {
    next[s.id] = [];
  }
  return next;
}

function createRow(): CloseOutRow {
  return {
    id: crypto.randomUUID(),
    date: todayDateInputValue(),
    trade: "",
    file: "",
  };
}

const closeOutCardStyle: CSSProperties = {
  ...shellCardStyle,
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
};

const tableShellStyle: CSSProperties = {
  ...innerWhiteCardStyle,
  overflow: "auto",
  marginTop: "0.75rem",
  padding: 0,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--text-secondary)",
  padding: "0.5rem 0.65rem",
  backgroundColor: "var(--surface-muted)",
  borderBottom: "1px solid var(--border-strong)",
};

const cellInputStyle: CSSProperties = {
  width: "100%",
  minWidth: "4rem",
  border: "none",
  background: "transparent",
  color: "var(--text-primary)",
  fontSize: "0.8125rem",
  fontFamily: "inherit",
  padding: "0.45rem 0.5rem",
  boxSizing: "border-box",
};

const uploadButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  display: "inline-block",
  padding: "0.3rem 0.6rem",
  fontSize: "0.75rem",
  fontWeight: 600,
  cursor: "pointer",
  lineHeight: 1.2,
};

type CloseOutSectionCardProps = {
  sectionId: CloseOutSectionId;
  title: string;
  rows: CloseOutRow[];
  spanWide?: boolean;
  onAddRow: () => void;
  onChangeRow: (rowId: string, field: "date" | "trade" | "file", value: string) => void;
};

function CloseOutSectionCard({
  sectionId,
  title,
  rows,
  spanWide,
  onAddRow,
  onChangeRow,
}: CloseOutSectionCardProps) {
  const addBtnStyle: CSSProperties = {
    padding: "0.35rem 0.65rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    flexShrink: 0,
    borderRadius: "0.75rem",
    border: "1px solid rgba(255, 255, 255, 0.35)",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    color: "#ffffff",
    cursor: "pointer",
    fontFamily: "Montserrat, sans-serif",
  };

  return (
    <div
      id={`close-out-${sectionId}`}
      className={spanWide ? "close-out-dashboard-span-2" : undefined}
      style={closeOutCardStyle}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "#ffffff" }}>{title}</h2>
        <button type="button" style={addBtnStyle} onClick={onAddRow}>
          + Add
        </button>
      </div>

      <div style={tableShellStyle}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontFamily: "Montserrat, sans-serif",
          }}
        >
          <thead>
            <tr>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Trade</th>
              <th style={{ ...thStyle, minWidth: "7rem" }}>File</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  style={{
                    padding: "0.85rem 0.65rem",
                    fontSize: "0.8125rem",
                    color: "var(--text-secondary)",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  No entries yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: 0, verticalAlign: "middle" }}>
                    <input
                      type="date"
                      value={row.date}
                      onChange={(e) => onChangeRow(row.id, "date", e.target.value)}
                      style={{ ...cellInputStyle, minWidth: "7.5rem" }}
                    />
                  </td>
                  <td style={{ padding: 0, verticalAlign: "middle" }}>
                    <input
                      type="text"
                      value={row.trade}
                      onChange={(e) => onChangeRow(row.id, "trade", e.target.value)}
                      style={cellInputStyle}
                      placeholder="—"
                    />
                  </td>
                  <td style={{ padding: 0, verticalAlign: "middle" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.35rem 0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <label style={uploadButtonStyle}>
                        Upload from device
                        <input
                          type="file"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            onChangeRow(row.id, "file", file?.name ?? "");
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                      <span
                        style={{
                          fontSize: "0.8125rem",
                          color: row.file ? "var(--text-primary)" : "var(--text-secondary)",
                          wordBreak: "break-word",
                        }}
                      >
                        {row.file || "No file selected"}
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function sectionMeta(id: CloseOutSectionId) {
  return CLOSE_OUT_SECTIONS.find((s) => s.id === id)!;
}

export function CloseOutProject() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const project = useQuery(api.projects.getProjectById, projectQueryArgs(projectId));
  const [rowsBySection, setRowsBySection] = useState(emptyRowsState);

  useEffect(() => {
    if (!projectId || project === undefined || project === null || !project.inCloseOut) return;
    const fromUrl = searchParams.get("tab");
    if (!isCloseOutSectionId(fromUrl)) return;
    const id = `close-out-${fromUrl}`;
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => window.clearTimeout(t);
  }, [projectId, project, searchParams]);

  const addRow = (sectionId: CloseOutSectionId) => {
    setRowsBySection((prev) => ({
      ...prev,
      [sectionId]: [...prev[sectionId], createRow()],
    }));
  };

  const changeRow = (sectionId: CloseOutSectionId, rowId: string, field: "date" | "trade" | "file", value: string) => {
    setRowsBySection((prev) => ({
      ...prev,
      [sectionId]: prev[sectionId].map((r) => (r.id === rowId ? { ...r, [field]: value } : r)),
    }));
  };

  if (!projectId) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#b91c1c" }}>Missing project id.</p>
      </div>
    );
  }

  if (project === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Loading...</p>
      </div>
    );
  }

  if (project === null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#b91c1c" }}>Project not found.</p>
        <Link to="/close-out" style={{ color: "#059669", textDecoration: "none", fontWeight: 600 }}>
          Back to Close Out
        </Link>
      </div>
    );
  }

  if (!project.inCloseOut) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <Link
          to="/close-out"
          style={{
            display: "inline-block",
            marginBottom: "1rem",
            fontSize: "0.875rem",
            color: "#059669",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          {"<-"} Back to Close Out
        </Link>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>Not in Close Out</h1>
        <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", maxWidth: "32rem", marginBottom: "1rem" }}>
          This job is not on the Close Out list yet. Open the project in <strong>Projects</strong>, go to the project{" "}
          <strong>summary</strong>, and choose <strong>Move to Close Out</strong>.
        </p>
        <Link
          to={`/projects/${project._id}`}
          style={{
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "#059669",
            textDecoration: "none",
          }}
        >
          Go to project Summary →
        </Link>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <Link
        to="/close-out"
        style={{
          display: "inline-block",
          marginBottom: "1rem",
          fontSize: "0.875rem",
          color: "#059669",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        {"<-"} Back to Close Out
      </Link>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        Close Out for {project.name}
      </h1>
      <p style={{ fontSize: "0.875rem", marginBottom: "1.25rem", color: "var(--text-secondary)" }}>
        {project.clientName}
        {project.location && ` · ${project.location}`}
      </p>

      <div className="close-out-dashboard-grid">
        <div className="close-out-dashboard-full-row">
          <div
            style={{
              fontSize: "0.6875rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-secondary)",
              marginBottom: "0.35rem",
            }}
          >
            Sub docs
          </div>
        </div>

        {SUB_DOC_IDS.map((id) => {
          const s = sectionMeta(id);
          return (
            <CloseOutSectionCard
              key={id}
              sectionId={id}
              title={s.title}
              rows={rowsBySection[id]}
              onAddRow={() => addRow(id)}
              onChangeRow={(rowId, field, value) => changeRow(id, rowId, field, value)}
            />
          );
        })}

        <CloseOutSectionCard
          sectionId="o-and-m"
          title={sectionMeta("o-and-m").title}
          rows={rowsBySection["o-and-m"]}
          spanWide
          onAddRow={() => addRow("o-and-m")}
          onChangeRow={(rowId, field, value) => changeRow("o-and-m", rowId, field, value)}
        />

        <CloseOutSectionCard
          sectionId="certification"
          title={sectionMeta("certification").title}
          rows={rowsBySection["certification"]}
          onAddRow={() => addRow("certification")}
          onChangeRow={(rowId, field, value) => changeRow("certification", rowId, field, value)}
        />
      </div>
    </div>
  );
}

import { useNavigate, useLocation, Link, Navigate } from "react-router-dom";
import { ProjectChangesTemplates } from "../ProjectChangesTemplates";
import { ProjectChangesKindWorkspace } from "../ProjectChangesKind";
import { ProjectChangesHub } from "./ProjectChangesHub";
import { ProjectChangeManagementLog } from "./ProjectChangeManagementLog";

const SLUG_TO_TYPE: Record<string, string> = {
  rfi: "RFI",
  submittal: "SUBMITTAL",
  co: "CO",
  pcn: "PCN",
  si: "SI",
  cor: "COR",
  po: "PO",
};

const CHANGES_KIND_DROPDOWN = [
  { slug: "rfi", label: "RFI" },
  { slug: "co", label: "CO" },
  { slug: "pcn", label: "PCN" },
  { slug: "si", label: "SI" },
  { slug: "cor", label: "COR" },
  { slug: "po", label: "Purchase Orders" },
  { slug: "management-log", label: "Change Management Log" },
] as const;

export function parseChangesTail(pathname: string, projectId: string): string {
  const base = `/projects/${projectId}/changes`;
  if (pathname === base || pathname === `${base}/`) return "";
  if (!pathname.startsWith(`${base}/`)) return "";
  return pathname.slice(base.length + 1).split("/")[0]?.replace(/\/$/, "") ?? "";
}

type ChangesHeaderProps = {
  projectId: string;
  selectValue: string;
  showDropdown: boolean;
  onNavigate: (slug: string) => void;
};

function ChangesHeader({ projectId, selectValue, showDropdown, onNavigate }: ChangesHeaderProps) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", justifyContent: "space-between" }}>
      <h2 className="section-header" style={{ margin: 0 }}>
        Changes
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
        {showDropdown ? (
          <label htmlFor="changes-kind-select" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>
            Change type
          </label>
        ) : null}
        {showDropdown ? (
          <select
            id="changes-kind-select"
            value={selectValue}
            onChange={(e) => onNavigate(e.target.value)}
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#059669",
              border: "1px solid rgba(5, 150, 105, 0.45)",
              borderRadius: "0.5rem",
              padding: "0.45rem 2rem 0.45rem 0.65rem",
              backgroundColor: "var(--surface-muted, #f9fafb)",
              cursor: "pointer",
              minWidth: "min(100%, 12rem)",
            }}
          >
            {CHANGES_KIND_DROPDOWN.map((k) => (
              <option key={k.slug} value={k.slug}>
                {k.label}
              </option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Submittal</span>
        )}
        <Link
          to={`/projects/${projectId}/changes/templates`}
          style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#047857", textDecoration: "none" }}
        >
          Template library
        </Link>
      </div>
    </div>
  );
}

type Props = { projectId: string };

export function ProjectChangesSection({ projectId }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const tail = parseChangesTail(location.pathname, projectId);

  if (tail === "templates") {
    return <ProjectChangesTemplates projectId={projectId} />;
  }

  if (!tail) {
    return <ProjectChangesHub projectId={projectId} />;
  }

  const kindKey = tail.toLowerCase();
  const isManagementLog = kindKey === "management-log";

  if (!isManagementLog && !SLUG_TO_TYPE[kindKey]) {
    return <Navigate to={`/projects/${projectId}/changes/rfi`} replace />;
  }

  const isSubmittalOnly = kindKey === "submittal";
  const selectValue = isManagementLog ? "management-log" : kindKey;

  function navigateToKind(slug: string) {
    navigate(`/projects/${projectId}/changes/${slug}`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontFamily: "Montserrat, sans-serif" }}>
      <ChangesHeader
        projectId={projectId}
        selectValue={selectValue}
        showDropdown={!isSubmittalOnly}
        onNavigate={navigateToKind}
      />

      {isManagementLog ? (
        <ProjectChangeManagementLog projectId={projectId} />
      ) : (
        <ProjectChangesKindWorkspace projectId={projectId} kindSlug={tail} />
      )}
    </div>
  );
}

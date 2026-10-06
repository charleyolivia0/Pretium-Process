import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { projectSectionHref } from "./projectDetail/projectSectionPaths";
import { cardStyle, primaryButtonStyle, secondaryButtonStyle } from "../theme";

const labelStyle = {
  display: "block" as const,
  marginBottom: "0.25rem",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "var(--text-secondary)",
};

const inputStyle = {
  width: "100%" as const,
  marginBottom: "0.75rem",
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1px solid var(--border-subtle, #e5e7eb)",
  fontFamily: "Montserrat, sans-serif",
  fontSize: "0.875rem",
  boxSizing: "border-box" as const,
};

export function ProjectSiteContactSheet() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useQuery(
    api.projects.getProjectById,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip"
  );
  const updateProject = useMutation(api.projects.updateProject);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emergencyPlan, setEmergencyPlan] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (!project) return;
    setName(project.siteContactSuperName ?? "");
    setPhone(project.siteContactSuperPhone ?? "");
    setEmail(project.siteContactSuperEmail ?? "");
    setEmergencyPlan(project.siteEmergencyPlanNotes ?? "");
  }, [project]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setError(null);
    setSavedNotice(false);
    try {
      await updateProject({
        projectId: projectId as Id<"projects">,
        siteContactSuperName: name.trim(),
        siteContactSuperPhone: phone.trim(),
        siteContactSuperEmail: email.trim(),
        siteEmergencyPlanNotes: emergencyPlan.trim(),
      });
      setSavedNotice(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (!projectId) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Missing project.</p>
        <Link to="/projects" style={{ color: "#059669" }}>
          Back to projects
        </Link>
      </div>
    );
  }

  if (project === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Loading…</p>
      </div>
    );
  }

  if (project === null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Project not found.</p>
        <Link to="/projects" style={{ color: "#059669", textDecoration: "none" }}>
          Back to projects
        </Link>
      </div>
    );
  }

  const backHref = projectSectionHref(projectId, "summary");

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", maxWidth: "36rem" }}>
      <Link
        to={backHref}
        style={{
          display: "inline-block",
          marginBottom: "1rem",
          fontSize: "0.875rem",
          color: "#059669",
          textDecoration: "none",
        }}
      >
        {"<-"} Back to project summary
      </Link>
      <h1 className="page-title" style={{ marginTop: 0, marginBottom: "0.35rem" }}>
        Site contact sheet
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: 0, marginBottom: "1.25rem" }}>
        {project.name}
        {project.clientName ? ` · ${project.clientName}` : ""}
      </p>

      <form onSubmit={handleSubmit} style={{ ...cardStyle }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.75rem", color: "var(--text-primary)" }}>
          Site super (client / jobsite)
        </h2>

        <label htmlFor="site-contact-name" style={labelStyle}>
          Name
        </label>
        <input
          id="site-contact-name"
          type="text"
          value={name}
          onChange={(ev) => setName(ev.target.value)}
          autoComplete="name"
          style={inputStyle}
        />

        <label htmlFor="site-contact-phone" style={labelStyle}>
          Phone
        </label>
        <input
          id="site-contact-phone"
          type="tel"
          value={phone}
          onChange={(ev) => setPhone(ev.target.value)}
          autoComplete="tel"
          style={inputStyle}
        />

        <label htmlFor="site-contact-email" style={labelStyle}>
          Email
        </label>
        <input
          id="site-contact-email"
          type="email"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          autoComplete="email"
          style={inputStyle}
        />

        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "1rem 0 0.35rem", color: "var(--text-primary)" }}>
          Emergency plan
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "0 0 0.5rem" }}>
          Optional for now. Add procedures, rally points, or contacts when your plan is ready.
        </p>
        <label htmlFor="site-emergency-plan" style={labelStyle}>
          Plan notes
        </label>
        <textarea
          id="site-emergency-plan"
          value={emergencyPlan}
          onChange={(ev) => setEmergencyPlan(ev.target.value)}
          rows={8}
          placeholder="e.g. evacuation routes, muster point, GC emergency line…"
          style={{
            ...inputStyle,
            marginBottom: "1rem",
            minHeight: "8rem",
            resize: "vertical" as const,
          }}
        />

        {error && (
          <p style={{ color: "#b91c1c", fontSize: "0.875rem", margin: "0 0 0.75rem" }}>{error}</p>
        )}
        {savedNotice && !error && (
          <p style={{ color: "#047857", fontSize: "0.875rem", margin: "0 0 0.75rem" }}>Saved.</p>
        )}

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="submit" disabled={saving} style={{ ...primaryButtonStyle, opacity: saving ? 0.7 : 1, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Saving…" : "Save"}
          </button>
          <Link to={backHref} style={{ ...secondaryButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

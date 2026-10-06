import { useParams, Link } from "react-router-dom";
import { projectQueryArgs } from "../lib/projectQueryArgs";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { cardStyle } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import { safetyJobSummaryHref } from "./projectDetail/projectSectionPaths";

export function SafetyProject() {
  const { id } = useParams<{ id: string }>();
  const { theme } = useTheme();
  const textColor = theme === "dark" ? "#ffffff" : "#111827";

  const project = useQuery(api.projects.getProjectById, projectQueryArgs(id));

  if (id == null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif", color: textColor }}>
        <p>No project selected.</p>
      </div>
    );
  }

  if (project === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif", color: textColor }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (project === null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif", color: textColor }}>
        <p>Project not found.</p>
        <Link to={safetyJobSummaryHref(id)} style={{ color: textColor }}>Back to safety summary</Link>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", color: textColor }}>
      <Link
        to={safetyJobSummaryHref(id)}
        style={{
          display: "inline-block",
          marginBottom: "1rem",
          fontSize: "0.875rem",
          color: textColor,
          textDecoration: "none",
        }}
      >
        {"<-"} Back to safety summary
      </Link>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: textColor, marginBottom: "0.25rem" }}>
        Safety for {project.name}
      </h1>
      <p style={{ fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        From this project you can go to incident reports or trade employee forms.
        {" "}
        {project.clientName}
        {project.location && ` · ${project.location}`}
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          maxWidth: "48rem",
        }}
      >
        <Link
          to={`/safety/project/${id}/incidents`}
          style={{ ...cardStyle, textDecoration: "none", color: "inherit", display: "block" }}
          className="card-hover"
        >
          <h2
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              color: textColor,
              marginTop: 0,
              marginBottom: "0.5rem",
            }}
          >
            Incident reports (project {"->"} incident reports)
          </h2>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "0.75rem", marginTop: 0 }}>
            Record and track safety incidents for this project, including severity and status.
          </p>
          <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#059669" }}>
            Go to incident reports {"->"}
          </span>
        </Link>

        <Link
          to={`/safety/project/${id}/trades`}
          style={{ ...cardStyle, textDecoration: "none", color: "inherit", display: "block" }}
          className="card-hover"
        >
          <h2
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              color: textColor,
              marginTop: 0,
              marginBottom: "0.5rem",
            }}
          >
            Trade employee forms (project {"->"} trade employee forms)
          </h2>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "0.75rem", marginTop: 0 }}>
            View trades on this project and manage employee safety documents for each trade.
          </p>
          <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#059669" }}>
            Go to trade documents {"->"}
          </span>
        </Link>

        <Link
          to={`/safety/project/${id}/job-sign-in-out/external`}
          style={{ ...cardStyle, textDecoration: "none", color: "inherit", display: "block" }}
          className="card-hover"
        >
          <h2
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              color: textColor,
              marginTop: 0,
              marginBottom: "0.5rem",
            }}
          >
            Trade & site super sign-in/out
          </h2>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "0.75rem", marginTop: 0 }}>
            Let trades and site supers quickly sign in and out for today, with a full log history.
          </p>
          <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#059669" }}>
            Open sign-in/out form {"->"}
          </span>
        </Link>

        <Link
          to={`/safety/project/${id}/job-sign-in-out`}
          style={{ ...cardStyle, textDecoration: "none", color: "inherit", display: "block" }}
          className="card-hover"
        >
          <h2
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              color: textColor,
              marginTop: 0,
              marginBottom: "0.5rem",
            }}
          >
            Trade & site super sign-in/out logs
          </h2>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "0.75rem", marginTop: 0 }}>
            View today and historical logs inside the app.
          </p>
          <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#059669" }}>
            Open logs {"->"}
          </span>
        </Link>
      </div>
    </div>
  );
}

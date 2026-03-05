import { Link } from "react-router-dom";

export function Landing() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "linear-gradient(180deg, #f0fdf4 0%, #f3f4f6 100%)",
      }}
    >
      <div
        style={{
          maxWidth: "36rem",
          width: "100%",
          padding: "3rem 2.5rem",
          borderRadius: "1rem",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.08)",
          backgroundColor: "#ffffff",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontSize: "1.875rem",
            fontWeight: 700,
            color: "#022c22",
            marginBottom: "0.75rem",
          }}
        >
          Lean Construction Ops
        </h1>
        <p
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontSize: "1rem",
            lineHeight: 1.6,
            color: "#4b5563",
            marginBottom: "2rem",
          }}
        >
          Your lean construction project cockpit. Keep projects, tasks,
          paperwork, and your team organized in one place.
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            to="/login"
            style={{
              display: "inline-block",
              padding: "0.75rem 1.5rem",
              borderRadius: "0.75rem",
              fontWeight: 600,
              backgroundColor: "#059669",
              color: "#fff",
              textDecoration: "none",
              fontFamily: "Montserrat, sans-serif",
              boxShadow: "0 4px 14px rgba(5, 150, 105, 0.35)",
            }}
          >
            Log in
          </Link>
          <Link
            to="/signup"
            style={{
              display: "inline-block",
              padding: "0.75rem 1.5rem",
              borderRadius: "0.75rem",
              fontWeight: 600,
              backgroundColor: "#f3f4f6",
              color: "#065f46",
              textDecoration: "none",
              fontFamily: "Montserrat, sans-serif",
              border: "1px solid #d1d5db",
            }}
          >
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}

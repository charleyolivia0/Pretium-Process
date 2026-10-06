import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogoMark } from "../components/LogoMark";

const ROLES = [
  { value: "project_manager", label: "Project Manager" },
  { value: "coordinator", label: "Coordinator" },
  { value: "accounting", label: "Accounting" },
  { value: "safety", label: "Safety" },
  { value: "admin", label: "Admin" },
  { value: "principal", label: "Principal" },
  { value: "site_superintendent", label: "Site Superintendent" },
] as const;

export function Signup() {
  const { signIn } = useAuthActions();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("project_manager");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData();
    formData.set("email", email);
    formData.set("password", password);
    formData.set("name", name);
    formData.set("role", role);
    formData.set("flow", "signUp");
    try {
      await signIn("password", formData);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "#f3f4f6",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "24rem",
          padding: "2rem",
          borderRadius: "1rem",
          boxShadow: "0 18px 45px rgba(15, 23, 42, 0.12)",
          backgroundColor: "var(--surface-panel)",
        }}
      >
        <h1
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "#022c22",
            marginBottom: "1.5rem",
          }}
        >
          Sign up <LogoMark />
        </h1>
        <form onSubmit={handleSubmit}>
          {error && (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                marginBottom: "1rem",
                borderRadius: "0.5rem",
                backgroundColor: "#fef2f2",
                color: "#b91c1c",
                fontSize: "0.875rem",
              }}
            >
              {error}
            </div>
          )}
          <label
            htmlFor="signup-name"
            style={{
              display: "block",
              marginBottom: "0.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#374151",
            }}
          >
            Name
          </label>
          <input
            id="signup-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem",
              marginBottom: "1rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              fontFamily: "Montserrat, sans-serif",
            }}
          />
          <label
            htmlFor="signup-email"
            style={{
              display: "block",
              marginBottom: "0.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#374151",
            }}
          >
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem",
              marginBottom: "1rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              fontFamily: "Montserrat, sans-serif",
            }}
          />
          <label
            htmlFor="signup-password"
            style={{
              display: "block",
              marginBottom: "0.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#374151",
            }}
          >
            Password
          </label>
          <input
            id="signup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem",
              marginBottom: "1rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              fontFamily: "Montserrat, sans-serif",
            }}
          />
          <label
            htmlFor="signup-role"
            style={{
              display: "block",
              marginBottom: "0.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#374151",
            }}
          >
            Role
          </label>
          <select
            id="signup-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{ width: "100%", marginBottom: "1rem" }}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: "0.75rem",
              fontWeight: 600,
              backgroundColor: "#059669",
              color: "#fff",
              border: "none",
              fontFamily: "Montserrat, sans-serif",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Creating account..." : "Sign up"}
          </button>
        </form>
        <p
          style={{
            marginTop: "1.5rem",
            fontSize: "0.875rem",
            color: "#6b7280",
          }}
        >
          Already have an account?{" "}
          <Link to="/login" style={{ color: "#059669", fontWeight: 600 }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

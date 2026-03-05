import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/projects", label: "Project Tracker" },
  { to: "/accounting", label: "Accounting" },
  { to: "/admin", label: "Admin" },
] as const;

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.current);

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        backgroundColor: "#f9fafb",
        fontFamily: "Montserrat, sans-serif",
      }}
    >
      <aside
        style={{
          width: "14rem",
          flexShrink: 0,
          backgroundColor: "#ffffff",
          borderRight: "1px solid #e5e7eb",
          boxShadow: "2px 0 12px rgba(0,0,0,0.04)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "1.25rem 1rem",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <Link
            to="/dashboard"
            style={{
              fontSize: "1.125rem",
              fontWeight: 700,
              color: "#022c22",
              textDecoration: "none",
            }}
          >
            Lean Ops
          </Link>
        </div>
        <nav style={{ padding: "0.75rem 0", flex: 1 }}>
          {navItems.map(({ to, label }) => {
            const active = location.pathname === to || location.pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                style={{
                  display: "block",
                  padding: "0.6rem 1rem",
                  margin: "0 0.5rem",
                  borderRadius: "0.5rem",
                  fontSize: "0.9375rem",
                  fontWeight: 500,
                  color: active ? "#059669" : "#4b5563",
                  backgroundColor: active ? "#ecfdf5" : "transparent",
                  textDecoration: "none",
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            height: "3.5rem",
            flexShrink: 0,
            backgroundColor: "#ffffff",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 1.5rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>
            {user?.role && (
              <span style={{ color: "#059669", fontWeight: 500 }}>
                {user.role.replace(/_/g, " ")}
              </span>
            )}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "0.875rem", color: "#374151" }}>
              {user?.name ?? user?.email ?? "User"}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              style={{
                padding: "0.4rem 0.75rem",
                borderRadius: "0.5rem",
                fontSize: "0.8125rem",
                fontWeight: 500,
                color: "#6b7280",
                backgroundColor: "transparent",
                border: "1px solid #e5e7eb",
                cursor: "pointer",
                fontFamily: "Montserrat, sans-serif",
              }}
            >
              Log out
            </button>
          </div>
        </header>
        <main
          style={{
            flex: 1,
            overflow: "auto",
            padding: "1.5rem",
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

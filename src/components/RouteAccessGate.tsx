import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  isAdminPathId,
  pathIdForPathname,
  safeRedirectPathForUser,
} from "../lib/pathAccess";
import { useEffectiveRole } from "../contexts/EffectiveRoleContext";

export function RouteAccessGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const myPathIds = useQuery(api.roleAccess.getMyPathIds);
  const user = useQuery(api.users.current);
  const { viewAsRole, isAdmin } = useEffectiveRole();

  if (user === null) {
    return (
      <Navigate
        to="/login"
        state={{ from: location, authIssue: "missing_user_profile" }}
        replace
      />
    );
  }

  if (user === undefined || myPathIds === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif", color: "var(--text-secondary)" }}>
        Loading…
      </div>
    );
  }

  if (myPathIds.length === 0) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif", maxWidth: "28rem" }}>
        <p style={{ color: "var(--text-primary)", marginTop: 0 }}>
          You don&apos;t have access to any sections in Pretium Process.
        </p>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: 0 }}>
          Contact an administrator if you need permissions updated.
        </p>
      </div>
    );
  }

  const allowed = new Set<string>(myPathIds);
  const pathId = pathIdForPathname(location.pathname);
  const roleForDashboard =
    user.role === "admin" && viewAsRole ? viewAsRole : user.role ?? "";
  const isDbAdmin = user.role === "admin";

  if (pathId !== null && (!allowed.has(pathId) || (!isDbAdmin && isAdminPathId(pathId)))) {
    const to = safeRedirectPathForUser({
      roleForDashboard,
      isDbAdmin,
      allowed,
    });
    if (to == null) {
      return (
        <div style={{ fontFamily: "Montserrat, sans-serif", maxWidth: "28rem" }}>
          <p style={{ color: "var(--text-primary)", marginTop: 0 }}>
            This page isn&apos;t available for your account.
          </p>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: 0 }}>
            Contact an administrator if you need a different home section.
          </p>
        </div>
      );
    }
    return <Navigate to={to} replace />;
  }

  return <>{children}</>;
}

import { useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { Navigate, useLocation } from "react-router-dom";
import { api } from "../../convex/_generated/api";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.current);
  const location = useLocation();

  const isLoading = authLoading || (isAuthenticated && user === undefined);
  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Montserrat, sans-serif",
        }}
      >
        <span style={{ color: "#059669" }}>Loading…</span>
      </div>
    );
  }

  if (!isAuthenticated || user === null) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

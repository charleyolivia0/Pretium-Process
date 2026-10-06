import { Link } from "react-router-dom";
import { StartUpDashboardLayout } from "../components/StartUpDashboardLayout";
import { primaryButtonStyle } from "../theme";

export function Landing() {
  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "2rem",
      }}
    >
      <StartUpDashboardLayout />
      <div style={{ maxWidth: "1200px", margin: "1rem auto 0", textAlign: "center" }}>
        <Link
          to="/login"
          style={{
            ...primaryButtonStyle,
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Log in
        </Link>
      </div>
    </div>
  );
}

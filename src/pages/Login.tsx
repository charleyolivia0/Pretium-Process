import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useLocation, Navigate, Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { LogoMark } from "../components/LogoMark";

export function Login() {
  const { signIn, signOut } = useAuthActions();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.current);
  const repairCurrentUserProfile = useMutation(api.users.repairCurrentUserProfile);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [repairingProfile, setRepairingProfile] = useState(false);
  const repairAttemptedRef = useRef(false);
  const location = useLocation();
  const defaultPath =
    user?.role === "safety"
      ? "/safety"
      : user?.role === "accounting"
        ? "/accounting"
        : "/dashboard";
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? defaultPath;
  const authIssue =
    (location.state as { authIssue?: string } | null)?.authIssue ?? null;
  const isFinishingSignIn = !authLoading && isAuthenticated && user === undefined;
  const isMissingUserProfile = !authLoading && isAuthenticated && user === null;
  // Redirect only after a valid app profile is loaded. A null profile stays here
  // so the repair/sign-out path below can run instead of sending users into the app shell.
  const authReady = !authLoading && isAuthenticated && user !== undefined && user !== null;

  useEffect(() => {
    if (!isMissingUserProfile) {
      repairAttemptedRef.current = false;
      setRepairingProfile(false);
      return;
    }
    if (repairAttemptedRef.current) return;
    repairAttemptedRef.current = true;
    setRepairingProfile(true);
    void repairCurrentUserProfile()
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not repair account profile");
      })
      .finally(() => {
        setRepairingProfile(false);
      });
  }, [isMissingUserProfile, repairCurrentUserProfile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isFinishingSignIn || isMissingUserProfile || repairingProfile) return;
    setError(null);
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    const formData = new FormData();
    formData.set("email", normalizedEmail);
    formData.set("password", password);
    formData.set("flow", "signIn");
    try {
      await signIn("password", formData);
      setLoading(false);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Sign in failed";
      if (raw.includes("InvalidSecret")) {
        setError("Incorrect email or password.");
      } else {
        setError(raw);
      }
      setLoading(false);
    }
  }

  if (authReady) {
    return <Navigate to={from} replace />;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        backgroundColor: "#065f46",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "24rem",
          padding: "2.25rem 2rem",
          borderRadius: "1.25rem",
          boxShadow:
            "0 18px 45px rgba(0, 0, 0, 0.38)," +
            "0 10px 26px rgba(15, 118, 110, 0.45)," +
            "0 0 0 1px rgba(5, 150, 105, 0.22)," +
            "0 2px 0 0 rgba(255, 255, 255, 0.12) inset",
          backgroundColor: "var(--surface-panel)",
          border: "1px solid rgba(5, 150, 105, 0.25)",
          transform: "translateY(-4px)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "3.5rem",
            height: "4px",
            borderRadius: "0 0 4px 4px",
            background: "linear-gradient(90deg, #059669, #047857)",
            boxShadow: "0 2px 8px rgba(5, 150, 105, 0.35)",
          }}
        />
        <p
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "#047857",
            marginBottom: "0.5rem",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
          }}
        >
          Pretium Process
          <LogoMark style={{ textTransform: "none" }} />
        </p>
        <h1
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "#022c22",
            marginBottom: "1.5rem",
          }}
        >
          Log in <LogoMark />
        </h1>
        <form onSubmit={handleSubmit}>
          {isFinishingSignIn && (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                marginBottom: "1rem",
                borderRadius: "0.5rem",
                backgroundColor: "#ecfeff",
                color: "#155e75",
                fontSize: "0.875rem",
              }}
            >
              Sign-in succeeded. Finishing your session...
            </div>
          )}
          {isMissingUserProfile && (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                marginBottom: "1rem",
                borderRadius: "0.5rem",
                backgroundColor: "#fffbeb",
                color: "#92400e",
                fontSize: "0.875rem",
              }}
            >
              {repairingProfile
                ? "This account signed in but profile mapping is missing. Repairing automatically..."
                : "This account signed in, but no user profile is available in the app. Ask an admin to reactivate or recreate your user, then sign in again."}
              <button
                type="button"
                onClick={() => {
                  void signOut();
                }}
                style={{
                  display: "block",
                  marginTop: "0.5rem",
                  border: "1px solid #d97706",
                  borderRadius: "0.5rem",
                  background: "var(--surface-panel)",
                  color: "#92400e",
                  padding: "0.4rem 0.6rem",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Sign out and try another account
              </button>
            </div>
          )}
          {!isMissingUserProfile && authIssue === "missing_user_profile" && (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                marginBottom: "1rem",
                borderRadius: "0.5rem",
                backgroundColor: "#fffbeb",
                color: "#92400e",
                fontSize: "0.875rem",
              }}
            >
              Your previous session was authenticated, but your user profile could not be loaded. Please sign in
              again.
            </div>
          )}
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
            htmlFor="login-email"
            style={{
              display: "block",
              marginBottom: "0.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#065f46",
            }}
          >
            Email
          </label>
          <input
            id="login-email"
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
            htmlFor="login-password"
            style={{
              display: "block",
              marginBottom: "0.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#065f46",
            }}
          >
            Password
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem",
              marginBottom: "1rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              fontFamily: "Montserrat, sans-serif",
            }}
          />
          <button
            type="submit"
            disabled={loading || isMissingUserProfile || isFinishingSignIn || repairingProfile}
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: "0.75rem",
              fontWeight: 600,
              backgroundColor: "#059669",
              color: "#fff",
              border: "1px solid #047857",
              fontFamily: "Montserrat, sans-serif",
              cursor: loading || isMissingUserProfile || isFinishingSignIn || repairingProfile ? "not-allowed" : "pointer",
              opacity: loading || isMissingUserProfile || isFinishingSignIn || repairingProfile ? 0.7 : 1,
              boxShadow: "0 4px 14px rgba(5, 150, 105, 0.35), 0 1px 0 0 rgba(255,255,255,0.2) inset",
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
          <Link
            to="/trade-portal"
            style={{
              display: "block",
              marginTop: "0.5rem",
              textAlign: "center",
              padding: "0.65rem",
              borderRadius: "0.75rem",
              fontWeight: 600,
              backgroundColor: "#ecfdf5",
              color: "#065f46",
              border: "1px solid #86efac",
              fontFamily: "Montserrat, sans-serif",
              textDecoration: "none",
            }}
          >
            Trade Portal Login
          </Link>
        </form>
        <p
          style={{
            marginTop: "1.5rem",
            fontSize: "0.875rem",
            color: "var(--text-secondary)",
          }}
        >
          Access is by invitation only. Contact your administrator if you need an account.
        </p>
      </div>
    </div>
  );
}

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "./contexts/ThemeContext";
import { MascotsPreferenceProvider } from "./contexts/MascotsPreferenceContext";
import { OfflineProvider } from "./offline/OfflineProvider";

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
  componentStack: string;
};

class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: "",
    componentStack: "",
  };

  static getDerivedStateFromError(error: unknown): Partial<AppErrorBoundaryState> {
    const message = error instanceof Error ? error.message : "Unknown runtime error";
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // Keep the full stack in the browser console for debugging.
    // eslint-disable-next-line no-console
    console.error("App crashed during render:", error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? "" });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            background: "#111827",
            color: "#f9fafb",
            fontFamily: "Montserrat, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: "44rem",
              width: "100%",
              border: "1px solid rgba(239, 68, 68, 0.5)",
              borderRadius: "0.75rem",
              background: "#1f2937",
              padding: "1rem",
            }}
          >
            <div style={{ color: "#fca5a5", fontWeight: 700, marginBottom: "0.5rem" }}>
              Runtime error
            </div>
            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{this.state.message}</div>
            {this.state.componentStack ? (
              <pre
                style={{
                  marginTop: "0.75rem",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  background: "#111827",
                  borderRadius: "0.5rem",
                  padding: "0.75rem",
                  fontSize: "0.8rem",
                  color: "#93c5fd",
                }}
              >
                {this.state.componentStack}
              </pre>
            ) : null}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function getConvexDeploymentUrl(): string | null {
  const raw = (import.meta.env.VITE_CONVEX_URL as string | undefined)?.trim();
  if (!raw || raw.includes("your-deployment")) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return raw;
  } catch {
    return null;
  }
}

function ConvexUrlMissing() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        background: "#111827",
        color: "#f9fafb",
        fontFamily: "Montserrat, sans-serif",
      }}
    >
      <div style={{ maxWidth: "36rem" }}>
        <div style={{ color: "#fca5a5", fontWeight: 700, marginBottom: "0.75rem" }}>
          Convex URL missing or invalid
        </div>
        <p style={{ margin: "0 0 0.75rem", lineHeight: 1.5 }}>
          Set <code style={{ color: "#93c5fd" }}>VITE_CONVEX_URL</code> in{" "}
          <code style={{ color: "#93c5fd" }}>.env.local</code> to your deployment URL (from{" "}
          <code style={{ color: "#93c5fd" }}>npx convex dev</code> or the Convex dashboard). Restart
          Vite after changing env.
        </p>
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          For local development, keep <code style={{ color: "#93c5fd" }}>npx convex dev</code>{" "}
          running, or use <code style={{ color: "#93c5fd" }}>npm run dev:convex</code> to start the
          backend and Vite together.
        </p>
      </div>
    </div>
  );
}

const convexDeploymentUrl = getConvexDeploymentUrl();
const isDesktop = typeof window !== "undefined" && "electronAPI" in window;
const Router = isDesktop ? HashRouter : BrowserRouter;
const rootEl = document.getElementById("root") as HTMLElement;

if (!convexDeploymentUrl) {
  ReactDOM.createRoot(rootEl).render(<ConvexUrlMissing />);
} else {
  const convexClient = new ConvexReactClient(convexDeploymentUrl);
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <ConvexAuthProvider client={convexClient}>
          <OfflineProvider>
            <Router>
              <ThemeProvider>
                <MascotsPreferenceProvider>
                  <App />
                </MascotsPreferenceProvider>
              </ThemeProvider>
            </Router>
          </OfflineProvider>
        </ConvexAuthProvider>
      </AppErrorBoundary>
    </React.StrictMode>
  );
}

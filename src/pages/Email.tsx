import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { cardStyle, primaryButtonStyle, secondaryButtonStyle } from "../theme";

type Provider = "gmail" | "outlook";

type InboxItem = {
  id: string;
  threadId: string;
  snippet: string;
  date: number;
  isUnread: boolean;
};

type MessageDetail = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
};

function formatListDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Email() {
  const [searchParams, setSearchParams] = useSearchParams();
  const connection = useQuery(api.email.getConnection);
  const createState = useMutation(api.email.createEmailConnectionState);
  const disconnectEmail = useMutation(api.email.disconnectEmail);
  const getGmailAuthUrl = useAction(api.email.getGmailAuthUrl);
  const getOutlookAuthUrl = useAction(api.email.getOutlookAuthUrl);
  const listEmails = useAction(api.email.listEmails);
  const getMessage = useAction(api.email.getMessage);

  const [provider, setProvider] = useState<Provider>("gmail");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [emails, setEmails] = useState<InboxItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<MessageDetail | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected === "gmail" || connected === "outlook") {
      setProvider(connected);
      setStatusMsg(
        `${connected === "outlook" ? "Outlook" : "Gmail"} connected successfully.`,
      );
      setSearchParams({}, { replace: true });
    } else if (error) {
      setStatusMsg(`Connection failed: ${error.replace(/_/g, " ")}`);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const providerStatus =
    provider === "gmail" ? connection?.gmail : connection?.outlook;
  const isConnected = providerStatus?.connected === true;

  const loadInbox = useCallback(async () => {
    if (!isConnected) {
      setEmails([]);
      return;
    }
    setLoadingInbox(true);
    setInboxError(null);
    try {
      const result = await listEmails({
        provider,
        maxResults: 25,
        sortBy: "importance",
      });
      setEmails(result.emails);
      setSelectedId(null);
      setMessage(null);
    } catch (err) {
      setInboxError(err instanceof Error ? err.message : "Failed to load inbox");
      setEmails([]);
    } finally {
      setLoadingInbox(false);
    }
  }, [isConnected, listEmails, provider]);

  useEffect(() => {
    if (connection === undefined) return;
    void loadInbox();
  }, [connection, loadInbox]);

  async function connectInbox(target: Provider) {
    setConnecting(true);
    setStatusMsg(null);
    try {
      const { state } = await createState({ provider: target });
      const { authUrl } =
        target === "gmail"
          ? await getGmailAuthUrl({ state })
          : await getOutlookAuthUrl({ state });
      window.location.href = authUrl;
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Could not start sign-in");
      setConnecting(false);
    }
  }

  async function disconnectInbox() {
    await disconnectEmail({ provider });
    setEmails([]);
    setSelectedId(null);
    setMessage(null);
    setStatusMsg(`${provider === "gmail" ? "Gmail" : "Outlook"} disconnected.`);
  }

  async function openMessage(messageId: string) {
    setSelectedId(messageId);
    setLoadingMessage(true);
    setMessageError(null);
    try {
      const detail = await getMessage({ provider, messageId });
      setMessage(detail);
    } catch (err) {
      setMessage(null);
      setMessageError(err instanceof Error ? err.message : "Failed to load message");
    } finally {
      setLoadingMessage(false);
    }
  }

  if (connection === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading email settings…</p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", maxWidth: "56rem" }}>
      <h1 className="page-title" style={{ marginBottom: "0.35rem" }}>
        Email
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "1rem" }}>
        Connect Gmail or Outlook to read your inbox and open messages in Pretium.
      </p>

      {statusMsg ? (
        <div
          style={{
            ...cardStyle,
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            fontSize: "0.875rem",
            color: "var(--text-primary)",
          }}
        >
          {statusMsg}
        </div>
      ) : null}

      <section style={{ ...cardStyle, marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          {(["gmail", "outlook"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProvider(p)}
              style={{
                ...(provider === p ? primaryButtonStyle : secondaryButtonStyle),
                textTransform: "capitalize",
              }}
            >
              {p}
            </button>
          ))}
        </div>

        {isConnected ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>
              Connected
              {providerStatus && "emailAddress" in providerStatus && providerStatus.emailAddress
                ? ` as ${providerStatus.emailAddress}`
                : ""}
            </span>
            <button type="button" style={secondaryButtonStyle} onClick={() => void loadInbox()}>
              Refresh inbox
            </button>
            <button type="button" style={secondaryButtonStyle} onClick={() => void disconnectInbox()}>
              Disconnect
            </button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: "0 0 0.75rem" }}>
              Sign in with {provider === "gmail" ? "Google" : "Microsoft"} to load your inbox.
              Convex env must include{" "}
              {provider === "gmail"
                ? "GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, CONVEX_SITE_URL, and APP_URL"
                : "OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, CONVEX_SITE_URL, and APP_URL"}
              .
            </p>
            <button
              type="button"
              style={primaryButtonStyle}
              disabled={connecting}
              onClick={() => void connectInbox(provider)}
            >
              {connecting ? "Redirecting…" : `Connect ${provider === "gmail" ? "Gmail" : "Outlook"}`}
            </button>
          </div>
        )}
      </section>

      {isConnected ? (
        <section style={cardStyle}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 0.75rem" }}>Inbox</h2>
          {loadingInbox ? (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Loading messages…</p>
          ) : inboxError ? (
            <p style={{ color: "#b91c1c", fontSize: "0.875rem" }}>{inboxError}</p>
          ) : emails.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>No messages found.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {emails.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void openMessage(item.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "0.65rem 0.75rem",
                      borderRadius: "0.5rem",
                      border: `1px solid ${selectedId === item.id ? "#059669" : "var(--border-subtle)"}`,
                      backgroundColor:
                        selectedId === item.id ? "rgba(5, 150, 105, 0.08)" : "var(--surface-panel)",
                      cursor: "pointer",
                      fontFamily: "Montserrat, sans-serif",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "0.5rem",
                        marginBottom: "0.2rem",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: item.isUnread ? 700 : 500,
                          fontSize: "0.8125rem",
                          color: "var(--text-primary)",
                        }}
                      >
                        {item.isUnread ? "Unread" : "Read"}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        {formatListDate(item.date)}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "0.8125rem",
                        color: "var(--text-secondary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.snippet || "(No preview)"}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selectedId ? (
            <div
              style={{
                marginTop: "1rem",
                paddingTop: "1rem",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              {loadingMessage ? (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Loading message…</p>
              ) : messageError ? (
                <p style={{ color: "#b91c1c", fontSize: "0.875rem" }}>{messageError}</p>
              ) : message ? (
                <div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 0.35rem" }}>
                    {message.subject || "(No subject)"}
                  </h3>
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "0 0 0.25rem" }}>
                    From: {message.from || "—"}
                  </p>
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "0 0 0.75rem" }}>
                    {message.date}
                  </p>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--text-primary)",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.5,
                    }}
                  >
                    {message.body || message.snippet || "(Empty message)"}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

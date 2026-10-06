import { useState, FormEvent, useEffect, useRef } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { cardStyle, primaryButtonStyle, secondaryButtonStyle } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

function formatChatTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Assistant() {
  const currentUser = useQuery(api.users.current);
  const ask = useAction(api.appAssistant.ask);
  const conversations = useQuery(api.appAssistant.listConversations);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [selectedConversationId, setSelectedConversationId] = useState<Id<"assistantConversations"> | null>(
    null
  );
  const messages = useQuery(
    api.appAssistant.listMessagesForConversation,
    selectedConversationId ? { conversationId: selectedConversationId } : "skip"
  );

  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const activeUserIdRef = useRef(currentUser?._id);

  useEffect(() => {
    const userId = currentUser?._id;
    if (!userId) return;
    if (activeUserIdRef.current && activeUserIdRef.current !== userId) {
      setSelectedConversationId(null);
      setQuestion("");
      setError(null);
    }
    activeUserIdRef.current = userId;
  }, [currentUser?._id]);

  useEffect(() => {
    if (!selectedConversationId || conversations === undefined) return;
    const stillOwned = conversations.some((c) => c._id === selectedConversationId);
    if (!stillOwned) {
      setSelectedConversationId(null);
    }
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, selectedConversationId]);

  function startNewChat() {
    setSelectedConversationId(null);
    setQuestion("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) {
      setError("Enter a question first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await ask({
        question: q,
        conversationId: selectedConversationId ?? undefined,
      });
      setError(result.error ?? null);
      if (result.conversationId) {
        setSelectedConversationId(result.conversationId);
      }
      if (!result.error) {
        setQuestion("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: "calc(100vh - 7rem)",
        gap: "1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: "1rem",
          alignItems: "stretch",
          flex: 1,
          minHeight: 0,
          width: "100%",
        }}
      >
        <aside
          style={{
            ...cardStyle,
            width: "19rem",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            backgroundColor: isDark ? "#020617" : cardStyle.backgroundColor,
            borderColor: isDark ? "#1f2937" : (cardStyle.border as string | undefined),
            boxShadow: isDark ? "0 16px 40px rgba(0,0,0,0.7)" : cardStyle.boxShadow,
          }}
        >
          <h2
            style={{
              fontSize: "0.8125rem",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: isDark ? "#9ca3af" : "#6b7280",
              margin: 0,
              marginBottom: "0.65rem",
              flexShrink: 0,
            }}
          >
            Previous chats
          </h2>
          <button
            type="button"
            onClick={startNewChat}
            style={{
              ...secondaryButtonStyle,
              width: "100%",
              marginBottom: "0.75rem",
              fontSize: "0.8125rem",
              padding: "0.45rem 0.75rem",
              borderColor: isDark ? "rgba(5,150,105,0.35)" : secondaryButtonStyle.border as string,
              backgroundColor: isDark ? "#0f172a" : secondaryButtonStyle.backgroundColor,
              color: isDark ? "#ecfdf5" : secondaryButtonStyle.color,
            }}
          >
            New chat
          </button>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem",
              minHeight: "10rem",
              paddingRight: "0.15rem",
            }}
          >
            {conversations === undefined && (
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Loading…</p>
            )}
            {conversations?.length === 0 && (
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                No chats yet. Start one on the right.
              </p>
            )}
            {conversations?.map((c) => {
              const active = selectedConversationId === c._id;
              return (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => {
                    setSelectedConversationId(c._id);
                    setError(null);
                  }}
                  style={{
                    textAlign: "left",
                    width: "100%",
                    padding: "0.55rem 0.65rem",
                    borderRadius: "0.5rem",
                    border: active
                      ? "1px solid rgba(5, 150, 105, 0.45)"
                      : `1px solid ${isDark ? "#1e293b" : "var(--border-subtle)"}`,
                    backgroundColor: active
                      ? isDark
                        ? "rgba(5, 150, 105, 0.15)"
                        : "rgba(5, 150, 105, 0.1)"
                      : isDark
                        ? "#0f172a"
                        : "var(--surface-panel)",
                    cursor: "pointer",
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      lineHeight: 1.35,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {c.preview || "Chat"}
                  </div>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: isDark ? "#64748b" : "#9ca3af",
                      marginTop: "0.2rem",
                    }}
                  >
                    {formatChatTime(c.updatedAt)}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <header
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              flexShrink: 0,
              gap: "0.35rem",
            }}
          >
            <img
              src="/chuck-mascot.png"
              alt=""
              width={96}
              height={128}
              style={{
                height: "9.5rem",
                width: "auto",
                maxWidth: "min(17rem, 52vw)",
                objectFit: "contain",
                display: "block",
              }}
            />
            <h1
              style={{
                fontSize: "1.75rem",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: 0,
                width: "100%",
                textAlign: "center",
              }}
            >
              Chuck
            </h1>
          </header>

          <section
            style={{
              ...cardStyle,
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              backgroundColor: isDark ? "#020617" : cardStyle.backgroundColor,
              borderColor: isDark ? "#1f2937" : (cardStyle.border as string | undefined),
              boxShadow: isDark ? "0 16px 40px rgba(0,0,0,0.7)" : cardStyle.boxShadow,
            }}
          >
            <div
              ref={threadRef}
              style={{
                flex: 1,
                overflowY: "auto",
                minHeight: "8rem",
                marginBottom: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.65rem",
                paddingRight: "0.25rem",
              }}
            >
              {!selectedConversationId && (
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.8125rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.45,
                  }}
                >
                  Start a <strong>new chat</strong> below, or pick a previous chat on the left.
                </p>
              )}
              {selectedConversationId && messages === undefined && (
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Loading…</p>
              )}
              {selectedConversationId && messages?.length === 0 && (
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                  No messages in this chat.
                </p>
              )}
              {messages?.map((m) => (
                <div
                  key={m._id}
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "min(100%, 36rem)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.65rem",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: isDark ? "#64748b" : "#9ca3af",
                      marginBottom: "0.2rem",
                      textAlign: m.role === "user" ? "right" : "left",
                    }}
                  >
                    {m.role === "user" ? "You" : m.role === "error" ? "Error" : "Chuck"}
                  </div>
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      lineHeight: 1.45,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      padding: "0.5rem 0.65rem",
                      borderRadius: "0.5rem",
                      backgroundColor:
                        m.role === "user"
                          ? isDark
                            ? "rgba(5, 150, 105, 0.2)"
                            : "rgba(5, 150, 105, 0.12)"
                          : m.role === "error"
                            ? isDark
                              ? "rgba(220, 38, 38, 0.15)"
                              : "rgba(220, 38, 38, 0.08)"
                            : isDark
                              ? "#0f172a"
                              : "rgba(5, 150, 105, 0.06)",
                      border:
                        m.role === "error"
                          ? `1px solid ${isDark ? "rgba(220,38,38,0.35)" : "rgba(220,38,38,0.25)"}`
                          : m.role === "user"
                            ? `1px solid ${isDark ? "rgba(5,150,105,0.35)" : "rgba(5,150,105,0.25)"}`
                            : `1px solid ${isDark ? "#1e293b" : "rgba(5, 150, 105, 0.15)"}`,
                      color: isDark ? "#e5e7eb" : "#111827",
                    }}
                  >
                    {m.body}
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={handleSubmit}
              style={{
                display: "flex",
                flexDirection: "column",
                flexShrink: 0,
                gap: "0.75rem",
                borderTop: `1px solid ${isDark ? "#334155" : "var(--border-subtle)"}`,
                paddingTop: "1rem",
              }}
            >
              <label
                htmlFor="assistant-question"
                style={{
                  display: "block",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: isDark ? "#d1d5db" : "#374151",
                  marginBottom: 0,
                }}
              >
                {selectedConversationId ? "Add a follow-up" : "Your question"}
              </label>
              <textarea
                id="assistant-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={loading}
                rows={6}
                placeholder="e.g. Which of my projects are marked active?"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "0.65rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: isDark ? "1px solid #374151" : "1px solid #d1d5db",
                  backgroundColor: isDark ? "#0f172a" : "#fff",
                  color: isDark ? "#e5e7eb" : "#111827",
                  fontSize: "0.9375rem",
                  fontFamily: "Montserrat, sans-serif",
                  minHeight: "6rem",
                  resize: "vertical",
                }}
              />
              <button
                type="submit"
                disabled={loading}
                style={{
                  ...primaryButtonStyle,
                  alignSelf: "flex-start",
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Thinking…" : "Ask"}
              </button>
            </form>

            {error && (
              <p
                role="alert"
                style={{
                  marginTop: "0.5rem",
                  marginBottom: 0,
                  fontSize: "0.875rem",
                  color: "#dc2626",
                }}
              >
                {error}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

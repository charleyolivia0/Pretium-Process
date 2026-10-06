/**
 * Email inbox integration: Gmail and Outlook (Microsoft Graph) OAuth, list emails, create drafts.
 *
 * Convex env:
 * - GMAIL: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET. Redirect: {CONVEX_SITE_URL}/api/oauth/gmail/callback
 * - Outlook: OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET. Redirect: {CONVEX_SITE_URL}/api/oauth/outlook/callback
 * - CONVEX_SITE_URL, APP_URL (frontend URL for post-OAuth redirect)
 */
import {
  query,
  mutation,
  action,
  internalMutation,
  internalQuery,
  httpAction,
} from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { recordAuditLog } from "./auditLog";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
].join(" ");

const OUTLOOK_SCOPES = [
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
].join(" ");

function randomState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Gmail API uses base64url; decode to string. */
function decodeBase64Url(s: string): string {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  return Buffer.from(padded, "base64").toString("utf-8");
}

/** Create a one-time state for Gmail OAuth; returns state for building auth URL. */
export const createEmailConnectionState = mutation({
  args: { provider: v.union(v.literal("gmail"), v.literal("outlook")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const state = randomState();
    await ctx.db.insert("emailOauthState", {
      state,
      userId,
      provider: args.provider,
      createdAt: Date.now(),
    });
    return { state };
  },
});

const NOT_CONNECTED = {
  gmail: { connected: false as const },
  outlook: { connected: false as const },
};

/** Get connection status for current user per provider (no tokens). */
export const getConnection = query({
  args: {},
  handler: async (ctx) => {
    try {
      const userId = await getAuthUserId(ctx);
      if (!userId) return null;
      const gmail = await ctx.db
        .query("emailConnections")
        .withIndex("by_userId_provider", (q) => q.eq("userId", userId).eq("provider", "gmail"))
        .first();
      const outlook = await ctx.db
        .query("emailConnections")
        .withIndex("by_userId_provider", (q) => q.eq("userId", userId).eq("provider", "outlook"))
        .first();
      return {
        gmail: gmail
          ? { connected: true as const, emailAddress: gmail.emailAddress ?? undefined, connectedAt: gmail.connectedAt }
          : { connected: false as const },
        outlook: outlook
          ? { connected: true as const, emailAddress: outlook.emailAddress ?? undefined, connectedAt: outlook.connectedAt }
          : { connected: false as const },
      };
    } catch {
      return NOT_CONNECTED;
    }
  },
});

/** Disconnect Gmail for current user. */
export const disconnectEmail = mutation({
  args: { provider: v.union(v.literal("gmail"), v.literal("outlook")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const conn = await ctx.db
      .query("emailConnections")
      .withIndex("by_userId_provider", (q) => q.eq("userId", userId).eq("provider", args.provider))
      .first();
    if (conn) await ctx.db.delete(conn._id);
    await recordAuditLog(ctx, {
      action: "email.disconnectEmail",
      summary: args.provider,
    });
  },
});

// ----- Internal: used by HTTP callback -----
export const consumeOauthState = internalQuery({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("emailOauthState")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
    return row ? { userId: row.userId, provider: row.provider } : null;
  },
});

export const deleteOauthState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("emailOauthState")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
    if (row) await ctx.db.delete(row._id);
  },
});

export const saveConnection = internalMutation({
  args: {
    userId: v.id("users"),
    provider: v.union(v.literal("gmail"), v.literal("outlook")),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    emailAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("emailConnections")
      .withIndex("by_userId_provider", (q) => q.eq("userId", args.userId).eq("provider", args.provider))
      .first();
    const data = {
      userId: args.userId,
      provider: args.provider,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: args.expiresAt,
      emailAddress: args.emailAddress,
      connectedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, data);
    else await ctx.db.insert("emailConnections", data);
  },
});

// ----- Actions: Gmail API (need to run in action for fetch) -----

/** Build Gmail OAuth authorization URL. Call after createEmailConnectionState. */
export const getGmailAuthUrl = action({
  args: { state: v.string() },
  handler: async (_ctx, args) => {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!clientId || !siteUrl) {
      throw new Error("GMAIL_CLIENT_ID and CONVEX_SITE_URL must be set in Convex env");
    }
    const redirectUri = `${siteUrl.replace(/\/$/, "")}/api/oauth/gmail/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GMAIL_SCOPES,
      state: args.state,
      access_type: "offline",
      prompt: "consent",
    });
    return { authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
  },
});

/** Build Outlook (Microsoft) OAuth authorization URL. Call after createEmailConnectionState. */
export const getOutlookAuthUrl = action({
  args: { state: v.string() },
  handler: async (_ctx, args) => {
    const clientId = process.env.OUTLOOK_CLIENT_ID;
    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!clientId || !siteUrl) {
      throw new Error("OUTLOOK_CLIENT_ID and CONVEX_SITE_URL must be set in Convex env");
    }
    const redirectUri = `${siteUrl.replace(/\/$/, "")}/api/oauth/outlook/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: OUTLOOK_SCOPES,
      state: args.state,
      response_mode: "query",
      prompt: "consent",
    });
    return { authUrl: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}` };
  },
});

/** Refresh Gmail access token. */
async function refreshGmailToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Gmail client credentials not configured");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error("Gmail token refresh failed: " + err);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return data;
}

/** Refresh Outlook (Microsoft) access token. */
async function refreshOutlookToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const clientId = process.env.OUTLOOK_CLIENT_ID;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Outlook client credentials not configured");
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error("Outlook token refresh failed: " + err);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return data;
}

type Provider = "gmail" | "outlook";

type EmailConnection = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type EmailListItem = {
  id: string;
  threadId: string;
  snippet: string;
  date: number;
  isUnread: boolean;
};

type EmailListResult = { emails: EmailListItem[] };

/** List recent emails with optional sort (importance: unread first, then by date). */
export const listEmails = action({
  args: {
    provider: v.union(v.literal("gmail"), v.literal("outlook")),
    maxResults: v.optional(v.number()),
    sortBy: v.optional(v.union(v.literal("date"), v.literal("importance"))),
  },
  handler: async (ctx, args): Promise<EmailListResult> => {
    const user = await ctx.runQuery(api.users.current, {});
    if (!user?._id) throw new Error("Not authenticated");
    const userId = user._id;
    const conn: EmailConnection | null = await ctx.runQuery(internal.email.getConnectionForAction, {
      userId,
      provider: args.provider,
    });
    if (!conn) throw new Error(`${args.provider === "gmail" ? "Gmail" : "Outlook"} not connected. Connect your inbox first.`);
    let accessToken = conn.accessToken;
    let expiresAt = conn.expiresAt;
    if (args.provider === "gmail") {
      if (Date.now() >= expiresAt - 60_000) {
        const refreshed = await refreshGmailToken(conn.refreshToken);
        accessToken = refreshed.access_token;
        expiresAt = Date.now() + refreshed.expires_in * 1000;
        await ctx.runMutation(internal.email.updateTokens, { userId, provider: "gmail", accessToken, expiresAt });
      }
      return await listEmailsGmail(accessToken, args.maxResults, args.sortBy);
    } else {
      if (Date.now() >= expiresAt - 60_000) {
        const refreshed = await refreshOutlookToken(conn.refreshToken);
        accessToken = refreshed.access_token;
        expiresAt = Date.now() + refreshed.expires_in * 1000;
        await ctx.runMutation(internal.email.updateTokens, { userId, provider: "outlook", accessToken, expiresAt });
      }
      return await listEmailsOutlook(accessToken, args.maxResults, args.sortBy);
    }
  },
});

async function listEmailsGmail(
  accessToken: string,
  maxResults?: number,
  sortBy?: "date" | "importance"
): Promise<EmailListResult> {
  const max = Math.min(maxResults ?? 25, 50);
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&labelIds=INBOX`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) throw new Error("Gmail list failed: " + (await listRes.text()));
  const listData = (await listRes.json()) as { messages?: { id: string; threadId: string }[] };
  const messages = listData.messages ?? [];
  const withSnippets: { id: string; threadId: string; snippet?: string; internalDate?: string; labelIds?: string[] }[] = [];
  for (const m of messages.slice(0, max)) {
    const getRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!getRes.ok) continue;
    const msg = (await getRes.json()) as {
      id: string;
      threadId: string;
      snippet?: string;
      internalDate?: string;
      labelIds?: string[];
    };
    withSnippets.push({
      id: msg.id,
      threadId: msg.threadId,
      snippet: msg.snippet,
      internalDate: msg.internalDate,
      labelIds: msg.labelIds,
    });
  }
  const withHeaders = withSnippets.map((msg) => ({
    id: msg.id,
    threadId: msg.threadId,
    snippet: msg.snippet ?? "",
    date: msg.internalDate ? new Date(parseInt(msg.internalDate, 10)).getTime() : 0,
    isUnread: msg.labelIds?.includes("UNREAD") ?? false,
  }));
  if (sortBy === "importance") {
    withHeaders.sort((a, b) => (a.isUnread !== b.isUnread ? (a.isUnread ? -1 : 1) : b.date - a.date));
  } else {
    withHeaders.sort((a, b) => b.date - a.date);
  }
  return { emails: withHeaders };
}

async function listEmailsOutlook(
  accessToken: string,
  maxResults?: number,
  sortBy?: "date" | "importance"
): Promise<EmailListResult> {
  const top = Math.min(maxResults ?? 25, 50);
  const orderBy = "receivedDateTime desc";
  const listRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=${top}&$orderby=${encodeURIComponent(orderBy)}&$select=id,conversationId,subject,bodyPreview,receivedDateTime,isRead`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) throw new Error("Outlook list failed: " + (await listRes.text()));
  const data = (await listRes.json()) as {
    value?: {
      id: string;
      conversationId?: string;
      subject?: string;
      bodyPreview?: string;
      receivedDateTime?: string;
      isRead?: boolean;
    }[];
  };
  const value = data.value ?? [];
  const emails = value.map((m) => ({
    id: m.id,
    threadId: m.conversationId ?? m.id,
    snippet: m.bodyPreview ?? m.subject ?? "",
    date: m.receivedDateTime ? new Date(m.receivedDateTime).getTime() : 0,
    isUnread: !m.isRead,
  }));
  if (sortBy === "importance") {
    emails.sort((a, b) => (a.isUnread !== b.isUnread ? (a.isUnread ? -1 : 1) : b.date - a.date));
  } else {
    emails.sort((a, b) => b.date - a.date);
  }
  return { emails };
}

type EmailMessage = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
};

/** Get full message body and headers. */
export const getMessage = action({
  args: {
    provider: v.union(v.literal("gmail"), v.literal("outlook")),
    messageId: v.string(),
  },
  handler: async (ctx, args): Promise<EmailMessage> => {
    const user = await ctx.runQuery(api.users.current, {});
    if (!user?._id) throw new Error("Not authenticated");
    const userId = user._id;
    const conn: EmailConnection | null = await ctx.runQuery(internal.email.getConnectionForAction, {
      userId,
      provider: args.provider,
    });
    if (!conn) throw new Error(`${args.provider === "gmail" ? "Gmail" : "Outlook"} not connected`);
    let accessToken = conn.accessToken;
    if (Date.now() >= conn.expiresAt - 60_000) {
      const refreshed =
        args.provider === "gmail"
          ? await refreshGmailToken(conn.refreshToken)
          : await refreshOutlookToken(conn.refreshToken);
      accessToken = refreshed.access_token;
      await ctx.runMutation(internal.email.updateTokens, {
        userId,
        provider: args.provider,
        accessToken: refreshed.access_token,
        expiresAt: Date.now() + refreshed.expires_in * 1000,
      });
    }
    if (args.provider === "gmail") return await getMessageGmail(accessToken, args.messageId);
    return await getMessageOutlook(accessToken, args.messageId);
  },
});

async function getMessageGmail(
  accessToken: string,
  messageId: string
): Promise<EmailMessage> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error("Failed to fetch message: " + (await res.text()));
  const msg = (await res.json()) as {
    id: string;
    threadId: string;
    snippet?: string;
    payload?: {
      headers?: { name: string; value: string }[];
      body?: { data?: string };
      parts?: { mimeType: string; body?: { data?: string } }[];
    };
  };
  const headers = (msg.payload?.headers ?? []).reduce(
    (acc, h) => {
      acc[h.name.toLowerCase()] = h.value;
      return acc;
    },
    {} as Record<string, string>
  );
  let textBody = "";
  const parts = msg.payload?.parts ?? (msg.payload?.body?.data ? [msg.payload] : []);
  for (const part of parts) {
    if (part.body?.data) {
      const decoded = decodeBase64Url(part.body.data);
      if ((part as { mimeType?: string }).mimeType === "text/plain" || !textBody) textBody = decoded;
    }
  }
  if (!textBody && msg.payload?.body?.data) textBody = decodeBase64Url(msg.payload.body.data);
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: headers.from ?? "",
    to: headers.to ?? "",
    subject: headers.subject ?? "",
    date: headers.date ?? "",
    snippet: msg.snippet ?? "",
    body: textBody,
  };
}

async function getMessageOutlook(
  accessToken: string,
  messageId: string
): Promise<EmailMessage> {
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}?$select=id,conversationId,subject,body,from,toRecipients,receivedDateTime`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch message: " + (await res.text()));
  const msg = (await res.json()) as {
    id: string;
    conversationId?: string;
    subject?: string;
    body?: { contentType: string; content?: string };
    from?: { emailAddress?: { address?: string; name?: string } };
    toRecipients?: { emailAddress?: { address?: string; name?: string } }[];
    receivedDateTime?: string;
  };
  const fromAddr = msg.from?.emailAddress?.address ?? msg.from?.emailAddress?.name ?? "";
  const toAddr = msg.toRecipients?.map((r) => r.emailAddress?.address ?? r.emailAddress?.name ?? "").filter(Boolean).join(", ") ?? "";
  let body = "";
  if (msg.body?.content) {
    body = msg.body.contentType === "text" ? msg.body.content : stripHtml(msg.body.content);
  }
  return {
    id: msg.id,
    threadId: msg.conversationId ?? msg.id,
    from: fromAddr,
    to: toAddr,
    subject: msg.subject ?? "",
    date: msg.receivedDateTime ?? "",
    snippet: msg.body?.content?.slice(0, 200) ?? "",
    body,
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

type DraftResult = { draftId: string; messageId?: string; threadId?: string; openUrl: string };

/** Create a draft (reply or new). */
export const createDraft = action({
  args: {
    provider: v.union(v.literal("gmail"), v.literal("outlook")),
    to: v.string(),
    subject: v.string(),
    body: v.string(),
    inReplyTo: v.optional(v.string()),
    references: v.optional(v.string()),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<DraftResult> => {
    const user = await ctx.runQuery(api.users.current, {});
    if (!user?._id) throw new Error("Not authenticated");
    const userId = user._id;
    const conn: EmailConnection | null = await ctx.runQuery(internal.email.getConnectionForAction, {
      userId,
      provider: args.provider,
    });
    if (!conn) throw new Error(`${args.provider === "gmail" ? "Gmail" : "Outlook"} not connected`);
    let accessToken = conn.accessToken;
    if (Date.now() >= conn.expiresAt - 60_000) {
      const refreshed =
        args.provider === "gmail"
          ? await refreshGmailToken(conn.refreshToken)
          : await refreshOutlookToken(conn.refreshToken);
      accessToken = refreshed.access_token;
      await ctx.runMutation(internal.email.updateTokens, {
        userId,
        provider: args.provider,
        accessToken: refreshed.access_token,
        expiresAt: Date.now() + refreshed.expires_in * 1000,
      });
    }
    if (args.provider === "gmail") return await createDraftGmail(accessToken, args);
    return await createDraftOutlook(accessToken, args);
  },
});

async function createDraftGmail(
  accessToken: string,
  args: {
    to: string;
    subject: string;
    body: string;
    inReplyTo?: string;
    references?: string;
    threadId?: string;
  }
): Promise<DraftResult> {
  const rawLines: string[] = [];
  rawLines.push(`To: ${args.to}`);
  rawLines.push(`Subject: ${args.subject}`);
  if (args.inReplyTo) rawLines.push(`In-Reply-To: ${args.inReplyTo}`);
  if (args.references) rawLines.push(`References: ${args.references}`);
  rawLines.push("Content-Type: text/plain; charset=utf-8");
  rawLines.push("");
  rawLines.push(args.body);
  const raw = Buffer.from(rawLines.join("\r\n"), "utf-8").toString("base64url");
  const draftPayload: { message: { raw: string; threadId?: string } } = { message: { raw } };
  if (args.threadId) draftPayload.message.threadId = args.threadId;
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(draftPayload),
  });
  if (!res.ok) throw new Error("Failed to create draft: " + (await res.text()));
  const data = (await res.json()) as { id: string; message?: { id: string; threadId: string } };
  return {
    draftId: data.id,
    messageId: data.message?.id,
    threadId: data.message?.threadId,
    openUrl: "https://mail.google.com/mail/u/0/#drafts",
  };
}

async function createDraftOutlook(
  accessToken: string,
  args: { to: string; subject: string; body: string }
): Promise<DraftResult> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: args.subject,
      body: { contentType: "Text", content: args.body },
      toRecipients: [{ emailAddress: { address: args.to } }],
      isDraft: true,
    }),
  });
  if (!res.ok) throw new Error("Failed to create draft: " + (await res.text()));
  const data = (await res.json()) as { id: string };
  return {
    draftId: data.id,
    messageId: data.id,
    openUrl: "https://outlook.office.com/mail/0/drafts",
  };
}

// Internal: get connection with tokens (actions only)
export const getConnectionForAction = internalQuery({
  args: { userId: v.id("users"), provider: v.union(v.literal("gmail"), v.literal("outlook")) },
  handler: async (ctx, args) => {
    const conn = await ctx.db
      .query("emailConnections")
      .withIndex("by_userId_provider", (q) => q.eq("userId", args.userId).eq("provider", args.provider))
      .first();
    return conn
      ? {
          accessToken: conn.accessToken,
          refreshToken: conn.refreshToken,
          expiresAt: conn.expiresAt,
        }
      : null;
  },
});

export const updateTokens = internalMutation({
  args: {
    userId: v.id("users"),
    provider: v.union(v.literal("gmail"), v.literal("outlook")),
    accessToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const conn = await ctx.db
      .query("emailConnections")
      .withIndex("by_userId_provider", (q) => q.eq("userId", args.userId).eq("provider", args.provider))
      .first();
    if (conn) await ctx.db.patch(conn._id, { accessToken: args.accessToken, expiresAt: args.expiresAt });
  },
});

/** Gmail OAuth callback: exchange code for tokens and redirect to app. Set APP_URL in Convex env for redirect. */
export const gmailOAuthCallback = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const siteUrl = process.env.CONVEX_SITE_URL ?? "";
  const appUrl = (process.env.APP_URL ?? siteUrl).replace(/\/$/, "");
  const redirectBase = `${appUrl}/email`;

  if (error) {
    return Response.redirect(`${redirectBase}?error=${encodeURIComponent(error)}`, 302);
  }
  if (!code || !state) {
    return Response.redirect(`${redirectBase}?error=missing_params`, 302);
  }

  const stateRow = await ctx.runQuery(internal.email.consumeOauthState, { state });
  if (!stateRow) {
    return Response.redirect(`${redirectBase}?error=invalid_state`, 302);
  }

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.redirect(`${redirectBase}?error=server_config`, 302);
  }
  const redirectUri = `${siteUrl.replace(/\/$/, "")}/api/oauth/gmail/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    return Response.redirect(
      `${redirectBase}?error=${encodeURIComponent("token_exchange_failed")}`,
      302
    );
  }
  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  if (!tokens.refresh_token) {
    return Response.redirect(
      `${redirectBase}?error=no_refresh_token`,
      302
    );
  }
  const expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;
  await ctx.runMutation(internal.email.saveConnection, {
    userId: stateRow.userId,
    provider: stateRow.provider,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
    emailAddress: undefined,
  });
  await ctx.runMutation(internal.email.deleteOauthState, { state });
  return Response.redirect(`${redirectBase}?connected=gmail`, 302);
});

/** Outlook OAuth callback: exchange code for tokens and redirect to app. */
export const outlookOAuthCallback = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const siteUrl = process.env.CONVEX_SITE_URL ?? "";
  const appUrl = (process.env.APP_URL ?? siteUrl).replace(/\/$/, "");
  const redirectBase = `${appUrl}/email`;

  if (error) {
    return Response.redirect(`${redirectBase}?error=${encodeURIComponent(error)}`, 302);
  }
  if (!code || !state) {
    return Response.redirect(`${redirectBase}?error=missing_params`, 302);
  }

  const stateRow = await ctx.runQuery(internal.email.consumeOauthState, { state });
  if (!stateRow || stateRow.provider !== "outlook") {
    return Response.redirect(`${redirectBase}?error=invalid_state`, 302);
  }

  const clientId = process.env.OUTLOOK_CLIENT_ID;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.redirect(`${redirectBase}?error=server_config`, 302);
  }
  const redirectUri = `${siteUrl.replace(/\/$/, "")}/api/oauth/outlook/callback`;
  const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    return Response.redirect(`${redirectBase}?error=token_exchange_failed`, 302);
  }
  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  if (!tokens.refresh_token) {
    return Response.redirect(`${redirectBase}?error=no_refresh_token`, 302);
  }
  const expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;

  let emailAddress: string | undefined;
  try {
    const meRes = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (meRes.ok) {
      const me = (await meRes.json()) as { mail?: string; userPrincipalName?: string };
      emailAddress = me.mail ?? me.userPrincipalName;
    }
  } catch {
    // optional
  }

  await ctx.runMutation(internal.email.saveConnection, {
    userId: stateRow.userId,
    provider: "outlook",
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
    emailAddress,
  });
  await ctx.runMutation(internal.email.deleteOauthState, { state });
  return Response.redirect(`${redirectBase}?connected=outlook`, 302);
});

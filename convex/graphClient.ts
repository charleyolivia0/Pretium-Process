const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

type AppToken = {
  accessToken: string;
  /** Epoch millis when the token expires (with small safety margin). */
  expiresAt: number;
};

let cachedToken: AppToken | null = null;

function getEnv(name: string): string {
  const value = (globalThis as any).process?.env?.[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function fetchAppAccessToken(): Promise<AppToken> {
  const tenantId = getEnv("M365_TENANT_ID");
  const clientId = getEnv("M365_CLIENT_ID");
  const clientSecret = getEnv("M365_CLIENT_SECRET");

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch Graph app token: ${res.status} ${res.statusText} - ${text}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };

  const lifetimeSec = json.expires_in ?? 3600;
  const now = Date.now();
  const // subtract 2 minutes as safety margin
    expiresAt = now + (lifetimeSec - 120) * 1000;

  return {
    accessToken: json.access_token,
    expiresAt,
  };
}

async function getAppAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }
  cachedToken = await fetchAppAccessToken();
  return cachedToken.accessToken;
}

type GraphRequestOptions = Omit<RequestInit, "headers"> & {
  /** Additional headers to send to Graph. Authorization will be injected automatically. */
  headers?: Record<string, string>;
};

async function graphFetch(path: string, options: GraphRequestOptions = {}) {
  const accessToken = await getAppAccessToken();
  const url = path.startsWith("http") ? path : `${GRAPH_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    ...(options.headers ?? {}),
  };

  // Prefer JSON for request bodies unless caller explicitly sets something else.
  const init: RequestInit = {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  };

  const res = await fetch(url, init);

  // Basic retry hint for callers on rate limiting; for now just surface details.
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph request failed: ${res.status} ${res.statusText} - ${text}`);
  }

  // Some Graph endpoints (like 204 No Content) return no body.
  if (res.status === 204) return null;

  return res.json();
}

/**
 * Get a single message by ID from a user's mailbox.
 * userPrincipalName is typically the mailbox email address (e.g. alice@company.com).
 */
export async function getMessage(userPrincipalName: string, messageId: string) {
  const encodedUser = encodeURIComponent(userPrincipalName);
  const encodedId = encodeURIComponent(messageId);
  const select = [
    "id",
    "subject",
    "from",
    "toRecipients",
    "ccRecipients",
    "receivedDateTime",
    "sentDateTime",
    "importance",
    "isRead",
    "conversationId",
    "bodyPreview",
    "body",
    "flag",
    "categories",
    "internetMessageId",
    "replyTo",
  ].join(",");

  return graphFetch(
    `/users/${encodedUser}/messages/${encodedId}?$select=${encodeURIComponent(select)}`
  );
}

/**
 * Move a message to another folder within the same mailbox.
 */
export async function moveMessage(
  userPrincipalName: string,
  messageId: string,
  destinationFolderId: string
) {
  const encodedUser = encodeURIComponent(userPrincipalName);
  const encodedId = encodeURIComponent(messageId);
  return graphFetch(`/users/${encodedUser}/messages/${encodedId}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destinationId: destinationFolderId }),
  });
}

/**
 * Update message categories (labels) on a message.
 */
export async function updateMessageCategories(
  userPrincipalName: string,
  messageId: string,
  categories: string[]
) {
  const encodedUser = encodeURIComponent(userPrincipalName);
  const encodedId = encodeURIComponent(messageId);
  return graphFetch(`/users/${encodedUser}/messages/${encodedId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categories }),
  });
}

/**
 * Create a reply draft populated with the provided content.
 */
export async function createReplyDraft(
  userPrincipalName: string,
  messageId: string,
  bodyContent: string
) {
  const encodedUser = encodeURIComponent(userPrincipalName);
  const encodedId = encodeURIComponent(messageId);
  return graphFetch(`/users/${encodedUser}/messages/${encodedId}/createReply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        body: {
          contentType: "HTML",
          content: bodyContent,
        },
      },
    }),
  });
}

/**
 * Send an arbitrary email message as the app using a specific mailbox.
 */
export async function sendMail(userPrincipalName: string, message: unknown) {
  const encodedUser = encodeURIComponent(userPrincipalName);
  return graphFetch(`/users/${encodedUser}/sendMail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
}

/**
 * Create a subscription for new messages in a user's Inbox.
 * notificationUrl must be publicly reachable by Microsoft Graph.
 */
export async function createInboxSubscription(params: {
  userPrincipalName: string;
  notificationUrl: string;
  expirationDateTime: string;
  clientState?: string;
}) {
  const { userPrincipalName, notificationUrl, expirationDateTime, clientState } = params;
  const resource = `users/${userPrincipalName}/mailFolders('Inbox')/messages`;

  return graphFetch("/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      changeType: "created",
      notificationUrl,
      resource,
      expirationDateTime,
      clientState,
    }),
  });
}

export async function deleteSubscription(subscriptionId: string) {
  const encodedId = encodeURIComponent(subscriptionId);
  return graphFetch(`/subscriptions/${encodedId}`, {
    method: "DELETE",
  });
}

export async function renewSubscription(subscriptionId: string, expirationDateTime: string) {
  const encodedId = encodeURIComponent(subscriptionId);
  return graphFetch(`/subscriptions/${encodedId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expirationDateTime }),
  });
}


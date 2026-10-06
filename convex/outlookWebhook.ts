import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

type GraphNotification = {
  subscriptionId?: string;
  clientState?: string;
};

/**
 * Microsoft Graph webhook endpoint for Outlook message notifications.
 *
 * - Responds to validation challenges when subscriptions are created.
 * - Verifies each notification against stored Graph subscriptions (clientState + subscriptionId).
 */
export const graphWebhook = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const validationToken = url.searchParams.get("validationToken");

  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  let body: { value?: GraphNotification[] } | undefined;
  try {
    body = (await request.json()) as { value?: GraphNotification[] };
  } catch {
    return new Response(null, { status: 400 });
  }

  const notifications = body?.value ?? [];
  if (notifications.length === 0) {
    return new Response(null, { status: 202 });
  }

  for (const item of notifications) {
    if (!item.subscriptionId) {
      return new Response(null, { status: 401 });
    }
    const ok = await ctx.runQuery(internal.outlookSubscriptions.verifyGraphNotification, {
      subscriptionId: item.subscriptionId,
      clientState: item.clientState,
    });
    if (!ok) {
      return new Response(null, { status: 401 });
    }
  }

  return new Response(null, { status: 202 });
});

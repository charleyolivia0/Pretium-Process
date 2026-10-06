import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * JotForm (or any form) webhook: POST JSON to add one row to the Inventory table.
 * Body: { equipmentName or name, projectId, takenOutByName?, dateTaken? }
 * Body: { equipmentName or name, projectId, takenOutByName?, dateTaken? }
 * Requires Convex env JOTFORM_WEBHOOK_SECRET and header X-Webhook-Secret with the same value.
 */
export const jotformInventory = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secret = request.headers.get("X-Webhook-Secret") ?? "";
  const expectedSecret = process.env.JOTFORM_WEBHOOK_SECRET ?? "";
  if (!expectedSecret) {
    return new Response(JSON.stringify({ error: "Webhook secret not configured on server" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (secret !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (!text.trim()) {
      return new Response(JSON.stringify({ error: "Body is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const name =
    typeof body.equipmentName === "string"
      ? body.equipmentName.trim()
      : typeof body.name === "string"
        ? body.name.trim()
        : null;
  if (!name) {
    return new Response(
      JSON.stringify({ error: "Missing equipment name (send 'equipmentName' or 'name')" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const projectId =
    typeof body.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : null;
  const projectName =
    typeof body.projectName === "string" && body.projectName.trim()
      ? body.projectName.trim()
      : null;
  if (!projectId && !projectName) {
    return new Response(
      JSON.stringify({
        error: "Missing projectId or projectName (project name must match exactly)",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const takenOutByName =
    typeof body.takenOutByName === "string" && body.takenOutByName.trim()
      ? body.takenOutByName.trim()
      : undefined;

  let dateTaken: number | undefined;
  if (body.dateTaken != null) {
    if (typeof body.dateTaken === "number" && body.dateTaken > 0) {
      dateTaken = body.dateTaken;
    } else if (typeof body.dateTaken === "string") {
      const parsed = Date.parse(body.dateTaken);
      if (!Number.isNaN(parsed)) dateTaken = parsed;
    }
  }

  try {
    await ctx.runMutation(internal.safety.addEquipmentFromWebhook, {
      projectId: projectId ? (projectId as Id<"projects">) : undefined,
      projectName: projectName ?? undefined,
      name,
      takenOutByName,
      dateTaken,
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
  }
});

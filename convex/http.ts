import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { jotformInventory } from "./jotformWebhook";
import { graphWebhook } from "./outlookWebhook";
import { gmailOAuthCallback, outlookOAuthCallback } from "./email";

const http = httpRouter();
auth.addHttpRoutes(http);

http.route({
  path: "/jotform-inventory",
  method: "POST",
  handler: jotformInventory,
});

http.route({
  path: "/graph/webhook",
  method: "POST",
  handler: graphWebhook,
});

http.route({
  path: "/api/oauth/gmail/callback",
  method: "GET",
  handler: gmailOAuthCallback,
});

http.route({
  path: "/api/oauth/outlook/callback",
  method: "GET",
  handler: outlookOAuthCallback,
});

export default http;

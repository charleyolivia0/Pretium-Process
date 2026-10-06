const env = (globalThis as any).process?.env ?? {};
// Must match JWT `iss` from token generation (`requireEnv("CONVEX_SITE_URL")` in @convex-dev/auth).
// Do not use SITE_URL here: it is often http://localhost:... and breaks server JWT validation.
const domain = env.CONVEX_SITE_URL ?? env.SITE_URL ?? undefined;

export default {
  providers: [
    {
      domain,
      applicationID: "convex",
    },
  ],
};

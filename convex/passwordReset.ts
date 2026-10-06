/**
 * Password reset email provider for Convex Auth.
 * Sends a one-time code to the user's email via Resend.
 *
 * Set AUTH_RESEND_KEY in your Convex dashboard (Settings > Environment Variables)
 * and use a verified domain in Resend for production.
 */
function generateNumericToken(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  const alphabet = "0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
}

export const ResendOTPPasswordReset = {
  id: "resend-otp-password-reset",
  type: "email" as const,
  name: "Resend OTP Password Reset",
  maxAge: 24 * 60 * 60,
  apiKey: process.env.AUTH_RESEND_KEY,
  async generateVerificationToken(): Promise<string> {
    return generateNumericToken(8);
  },
  async sendVerificationRequest(params: {
    identifier: string;
    provider: { apiKey?: string; from?: string };
    token: string;
    url?: string;
    expires?: Date;
    request?: Request;
    theme?: unknown;
  }): Promise<void> {
    const { identifier: to, provider, token } = params;
    const apiKey = provider.apiKey ?? process.env.AUTH_RESEND_KEY;
    if (!apiKey) {
      throw new Error("Missing AUTH_RESEND_KEY. Set it in Convex dashboard Environment Variables.");
    }
    const from = provider.from ?? "Pretium Process <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Reset your password – Pretium Process",
        text: `Your password reset code is: ${token}\n\nEnter this code in the app to set a new password. The code expires in 24 hours.`,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error("Failed to send password reset email: " + JSON.stringify(err));
    }
  },
};

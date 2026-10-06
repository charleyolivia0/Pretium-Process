import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { DataModel } from "./_generated/dataModel";
import { ResendOTPPasswordReset } from "./passwordReset";

const defaultRole = "project_manager" as const;
const USER_ROLES = [
  "project_manager",
  "coordinator",
  "accounting",
  "safety",
  "admin",
  "principal",
  "site_superintendent",
] as const;
type UserRole = (typeof USER_ROLES)[number];

function coerceUserRole(value: unknown): UserRole {
  if (typeof value === "string" && (USER_ROLES as readonly string[]).includes(value)) {
    return value as UserRole;
  }
  return defaultRole;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password<DataModel>({
      profile(params) {
        // Disable public sign-up; only admins can create accounts via Admin → Users.
        if ((params.flow as string) === "signUp") {
          throw new Error("Sign-up is disabled. Contact your administrator for an account.");
        }
        return {
          email: params.email as string,
          name: (params.name as string) ?? undefined,
          role: coerceUserRole(params.role),
        };
      },
      reset: ResendOTPPasswordReset,
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      const profile = args.profile as {
        email?: string;
        name?: string;
        role?: UserRole;
      };
      const now = Date.now();
      if (args.existingUserId) {
        await ctx.db.patch(args.existingUserId, { lastLoginAt: now });
        return args.existingUserId;
      }
      return await ctx.db.insert("users", {
        email: profile.email,
        name: profile.name,
        role: coerceUserRole(profile.role),
        createdAt: now,
        lastLoginAt: now,
        isActive: true,
      });
    },
  },
});

import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { DataModel } from "./_generated/dataModel";

const defaultRole = "project_manager" as const;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password<DataModel>({
      profile(params) {
        return {
          email: params.email as string,
          name: (params.name as string) ?? undefined,
          role: (params.role as string) ?? defaultRole,
        };
      },
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      const profile = args.profile as {
        email?: string;
        name?: string;
        role?: string;
      };
      const now = Date.now();
      if (args.existingUserId) {
        await ctx.db.patch(args.existingUserId, { lastLoginAt: now });
        return args.existingUserId;
      }
      return await ctx.db.insert("users", {
        email: profile.email,
        name: profile.name,
        role: profile.role ?? defaultRole,
        createdAt: now,
        lastLoginAt: now,
        isActive: true,
      });
    },
  },
});

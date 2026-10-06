import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

/** One-time: backfill userId on Chuck messages. Run via Convex dashboard or CLI. */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    let totalPatched = 0;
    let totalScanned = 0;
    let batch = 0;

    while (batch < 50) {
      const result = await ctx.runMutation(internal.appAssistant.backfillMessageUserIds, {
        limit: 200,
      });
      totalPatched += result.patched;
      totalScanned += result.scanned;
      if (result.patched === 0) break;
      batch++;
    }

    return { totalPatched, totalScanned, batches: batch };
  },
});

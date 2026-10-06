import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

/** One-time: backfill version 1 for existing documents. Run via Convex dashboard or CLI. */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    let totalCreated = 0;
    let totalScanned = 0;
    let batch = 0;
    const batchSize = 200;

    while (batch < 50) {
      const result = await ctx.runMutation(internal.documentVersions.backfillDocumentVersions, {
        limit: batchSize,
      });
      totalCreated += result.created;
      totalScanned += result.scanned;
      if (result.created === 0) break;
      batch++;
    }

    return { totalCreated, totalScanned, batches: batch };
  },
});

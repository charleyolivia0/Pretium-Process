import { v } from "convex/values";

/** Shared ink markup payload for drawings and site photos. */
export const markupPayloadValidator = v.object({
  version: v.number(),
  pages: v.array(
    v.object({
      pageIndex: v.number(),
      paths: v.array(
        v.object({
          tool: v.literal("ink"),
          color: v.string(),
          strokeWidth: v.number(),
          points: v.array(v.object({ x: v.number(), y: v.number() })),
        }),
      ),
    }),
  ),
});

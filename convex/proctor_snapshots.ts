import { v } from "convex/values";
import { mutationGeneric as mutation } from "convex/server";

export const create = mutation({
  args: {
    session_id: v.string(),
    snapshot: v.any(),
  },
  handler: async (ctx, args) => {
    const snapshot = args.snapshot;
    await ctx.db.insert("proctor_snapshots", {
      snapshot_id: snapshot.snapshot_id,
      session_id: args.session_id,
      captured_at: snapshot.captured_at,
      flags: snapshot.flags,
      confidence: snapshot.confidence,
      description: snapshot.description,
      image_data_url: snapshot.image_data_url,
    });
    return null;
  },
});

import { v } from "convex/values";
import { mutationGeneric as mutation } from "convex/server";

const nowIso = () => new Date().toISOString();

export const create = mutation({
  args: {
    session_id: v.string(),
    question_index: v.number(),
    dispute_argument: v.string(),
    result: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("disputes")
      .withIndex("by_session_question", (q: any) =>
        q.eq("session_id", args.session_id).eq("question_index", args.question_index),
      )
      .unique();
    if (existing) throw new Error("This question has already been disputed.");

    await ctx.db.insert("disputes", {
      session_id: args.session_id,
      question_index: args.question_index,
      dispute_argument: args.dispute_argument,
      dispute_result: args.result,
      created_at: nowIso(),
    });
    return null;
  },
});

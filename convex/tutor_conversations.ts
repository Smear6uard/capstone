import { v } from "convex/values";
import { mutationGeneric as mutation } from "convex/server";

const nowIso = () => new Date().toISOString();

export const save = mutation({
  args: {
    session_id: v.string(),
    question_index: v.number(),
    messages: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tutor_conversations")
      .withIndex("by_session_question", (q: any) =>
        q.eq("session_id", args.session_id).eq("question_index", args.question_index),
      )
      .unique();

    const payload = {
      session_id: args.session_id,
      question_index: args.question_index,
      messages: args.messages,
      updated_at: nowIso(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return null;
    }
    await ctx.db.insert("tutor_conversations", payload);
    return null;
  },
});

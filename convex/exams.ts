import { v } from "convex/values";
import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";

export const save = mutation({
  args: {
    exam: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("exams")
      .withIndex("by_config_id", (q) => q.eq("config_id", args.exam.config_id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args.exam);
      return args.exam;
    }
    await ctx.db.insert("exams", args.exam);
    return args.exam;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const exams = await ctx.db.query("exams").collect();
    return exams.sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
});

export const get = query({
  args: {
    config_id: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("exams")
      .withIndex("by_config_id", (q) => q.eq("config_id", args.config_id))
      .unique();
  },
});

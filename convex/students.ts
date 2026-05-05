import { v } from "convex/values";
import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";

const nowIso = () => new Date().toISOString();

export const login = mutation({
  args: {
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const name = args.name.trim();
    const existing = await ctx.db
      .query("students")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        updated_at: nowIso(),
      });
      return { ...existing, name, updated_at: nowIso() };
    }

    const created_at = nowIso();
    const student = {
      student_id: crypto.randomUUID().replaceAll("-", ""),
      name,
      email,
      created_at,
      updated_at: created_at,
    };
    await ctx.db.insert("students", student);
    return student;
  },
});

export const get = query({
  args: {
    student_id: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("students")
      .withIndex("by_student_id", (q) => q.eq("student_id", args.student_id))
      .unique();
  },
});

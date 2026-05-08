import { v } from "convex/values";
import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";

const nowIso = () => new Date().toISOString();

export const saveMany = mutation({
  args: {
    config_id: v.string(),
    chunks: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    for (const chunk of args.chunks) {
      await ctx.db.insert("material_chunks", {
        chunk_id: chunk.chunk_id,
        config_id: args.config_id,
        source_filename: chunk.source_filename,
        source_type: chunk.source_type,
        source_label: chunk.source_label,
        chunk_index: chunk.chunk_index,
        text: chunk.text,
        created_at: chunk.created_at,
        updated_at: chunk.updated_at,
      });
    }
    return args.chunks;
  },
});

export const listByConfig = query({
  args: {
    config_id: v.string(),
  },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("material_chunks")
      .withIndex("by_config", (q) => q.eq("config_id", args.config_id))
      .collect();
    return chunks.sort((a, b) => a.chunk_index - b.chunk_index);
  },
});

export const updateText = mutation({
  args: {
    chunk_id: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const chunk = await ctx.db
      .query("material_chunks")
      .withIndex("by_chunk_id", (q) => q.eq("chunk_id", args.chunk_id))
      .unique();
    if (!chunk) return null;
    const updated = { ...chunk, text: args.text, updated_at: nowIso() };
    await ctx.db.patch(chunk._id, {
      text: updated.text,
      updated_at: updated.updated_at,
    });
    return updated;
  },
});

export const deleteOne = mutation({
  args: {
    chunk_id: v.string(),
  },
  handler: async (ctx, args) => {
    const chunk = await ctx.db
      .query("material_chunks")
      .withIndex("by_chunk_id", (q) => q.eq("chunk_id", args.chunk_id))
      .unique();
    if (!chunk) return false;
    await ctx.db.delete(chunk._id);
    return true;
  },
});

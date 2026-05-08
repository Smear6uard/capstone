import { v } from "convex/values";
import { mutationGeneric as mutation } from "convex/server";

const nowIso = () => new Date().toISOString();

async function getSessionDoc(ctx: any, session_id: string) {
  return await ctx.db
    .query("sessions")
    .withIndex("by_session_id", (q: any) => q.eq("session_id", session_id))
    .unique();
}

export const createForSession = mutation({
  args: {
    session_id: v.string(),
    question: v.any(),
  },
  handler: async (ctx, args) => {
    const session = await getSessionDoc(ctx, args.session_id);
    if (!session) throw new Error(`Session ${args.session_id} not found.`);

    const question = args.question;
    await ctx.db.insert("questions", {
      session_id: args.session_id,
      question_index: question.question_index,
      topic: question.topic,
      question: question.question,
      background_info: question.background_info,
      grading_rubric: question.grading_rubric,
      student_answer: question.student_answer,
      time_spent_seconds: question.time_spent_seconds,
      criterion_scores: question.criterion_scores,
      overall_score: question.overall_score,
      grading_explanation: question.grading_explanation,
      difficulty: question.difficulty,
      source_chunk_id: question.source_chunk_id ?? null,
      source_label: question.source_label ?? null,
      created_at: question.created_at ?? nowIso(),
    });
    await ctx.db.patch(session._id, {
      pending_question: null,
    });
    return null;
  },
});

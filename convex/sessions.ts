import { v } from "convex/values";
import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";

async function getSessionDoc(ctx: any, session_id: string) {
  return await ctx.db
    .query("sessions")
    .withIndex("by_session_id", (q: any) => q.eq("session_id", session_id))
    .unique();
}

async function listQuestions(ctx: any, session_id: string) {
  const questions = await ctx.db
    .query("questions")
    .withIndex("by_session", (q: any) => q.eq("session_id", session_id))
    .collect();
  const disputes = await ctx.db
    .query("disputes")
    .withIndex("by_session", (q: any) => q.eq("session_id", session_id))
    .collect();
  const disputesByIndex = new Map(
    disputes.map((dispute: any) => [dispute.question_index, dispute.dispute_result]),
  );

  return questions
    .map((question: any) => ({
      ...question,
      dispute_result: disputesByIndex.get(question.question_index) ?? null,
    }))
    .sort((a: any, b: any) => a.question_index - b.question_index);
}

async function tutorSessions(ctx: any, session_id: string) {
  const conversations = await ctx.db
    .query("tutor_conversations")
    .withIndex("by_session", (q: any) => q.eq("session_id", session_id))
    .collect();
  return Object.fromEntries(
    conversations.map((conversation: any) => [
      String(conversation.question_index),
      conversation.messages,
    ]),
  );
}

async function proctorSnapshots(ctx: any, session_id: string) {
  const snapshots = await ctx.db
    .query("proctor_snapshots")
    .withIndex("by_session", (q: any) => q.eq("session_id", session_id))
    .collect();
  return snapshots.sort((a: any, b: any) => a.captured_at.localeCompare(b.captured_at));
}

async function hydrateSession(ctx: any, session: any) {
  const questions = await listQuestions(ctx, session.session_id);
  return {
    ...session,
    questions,
    tutor_sessions: await tutorSessions(ctx, session.session_id),
    proctor_snapshots: await proctorSnapshots(ctx, session.session_id),
  };
}

export const create = mutation({
  args: {
    session: v.any(),
  },
  handler: async (ctx, args) => {
    const session = args.session;
    await ctx.db.insert("sessions", {
      session_id: session.session_id,
      student_id: session.student_id ?? null,
      student_name: session.student_name,
      domain: session.domain,
      difficulty: session.difficulty,
      current_difficulty: session.current_difficulty ?? session.difficulty,
      grade_level: session.grade_level,
      grading_personality: session.grading_personality,
      teacher_name: session.teacher_name,
      num_questions: session.num_questions,
      topics: session.topics,
      config_id: session.config_id ?? null,
      special_instructions: session.special_instructions,
      pending_question: session.pending_question ?? null,
      proctoring_status: session.proctoring_status ?? "pending",
      knowledge_map: session.knowledge_map ?? [],
      status: session.status,
      created_at: session.created_at,
    });
    return null;
  },
});

export const get = query({
  args: {
    session_id: v.string(),
    student_id: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const session = await getSessionDoc(ctx, args.session_id);
    if (!session) return null;
    if (args.student_id && session.student_id && session.student_id !== args.student_id) {
      throw new Error("Session does not belong to this student.");
    }
    return await hydrateSession(ctx, session);
  },
});

export const setPendingQuestion = mutation({
  args: {
    session_id: v.string(),
    pending_question: v.union(v.any(), v.null()),
  },
  handler: async (ctx, args) => {
    const session = await getSessionDoc(ctx, args.session_id);
    if (!session) throw new Error(`Session ${args.session_id} not found.`);
    await ctx.db.patch(session._id, {
      pending_question: args.pending_question,
    });
    return null;
  },
});

export const updateAdaptiveState = mutation({
  args: {
    session_id: v.string(),
    current_difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
  },
  handler: async (ctx, args) => {
    const session = await getSessionDoc(ctx, args.session_id);
    if (!session) throw new Error(`Session ${args.session_id} not found.`);
    await ctx.db.patch(session._id, {
      current_difficulty: args.current_difficulty,
    });
    return null;
  },
});

export const updateProctoringStatus = mutation({
  args: {
    session_id: v.string(),
    status: v.union(v.literal("pending"), v.literal("active"), v.literal("unproctored")),
  },
  handler: async (ctx, args) => {
    const session = await getSessionDoc(ctx, args.session_id);
    if (!session) throw new Error(`Session ${args.session_id} not found.`);
    await ctx.db.patch(session._id, {
      proctoring_status: args.status,
    });
    return null;
  },
});

export const complete = mutation({
  args: {
    session_id: v.string(),
    result: v.any(),
  },
  handler: async (ctx, args) => {
    const session = await getSessionDoc(ctx, args.session_id);
    if (!session) throw new Error(`Session ${args.session_id} not found.`);
    await ctx.db.patch(session._id, {
      status: "completed",
      composite_score: args.result.composite_score,
      composite_feedback: args.result.composite_feedback,
      total_time_seconds: args.result.total_time_seconds,
      completed_at: args.result.completed_at,
      knowledge_map: args.result.knowledge_map ?? [],
    });
    return null;
  },
});

export const listCompleted = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();
    const hydrated = await Promise.all(sessions.map((session) => hydrateSession(ctx, session)));
    return hydrated
      .map((session) => ({
        ...session,
        composite_score: session.composite_score ?? 0,
        composite_feedback: session.composite_feedback ?? "",
        total_time_seconds: session.total_time_seconds ?? 0,
        completed_at: session.completed_at ?? session.created_at,
        current_difficulty: session.current_difficulty ?? session.difficulty,
        proctoring_status: session.proctoring_status ?? "pending",
        knowledge_map: session.knowledge_map ?? [],
      }))
      .sort((a, b) => b.completed_at.localeCompare(a.completed_at));
  },
});

export const listByStudent = query({
  args: {
    student_id: v.string(),
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_student_status", (q: any) =>
        q.eq("student_id", args.student_id).eq("status", "completed"),
      )
      .collect();
    const hydrated = await Promise.all(sessions.map((session) => hydrateSession(ctx, session)));
    return hydrated
      .map((session) => ({
        ...session,
        composite_score: session.composite_score ?? 0,
        composite_feedback: session.composite_feedback ?? "",
        total_time_seconds: session.total_time_seconds ?? 0,
        completed_at: session.completed_at ?? session.created_at,
        current_difficulty: session.current_difficulty ?? session.difficulty,
        proctoring_status: session.proctoring_status ?? "pending",
        knowledge_map: session.knowledge_map ?? [],
      }))
      .sort((a, b) => b.completed_at.localeCompare(a.completed_at));
  },
});

export const listProctorAlerts = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("sessions").collect();
    const hydrated = await Promise.all(sessions.map((session) => hydrateSession(ctx, session)));
    return hydrated
      .filter((session) => {
        const status = session.proctoring_status ?? "pending";
        const flagged = session.proctor_snapshots.some(
          (snapshot: any) => snapshot.flags.length > 0 && snapshot.confidence >= 0.7,
        );
        return status === "unproctored" || flagged;
      })
      .map((session) => ({
        ...session,
        current_difficulty: session.current_difficulty ?? session.difficulty,
        proctoring_status: session.proctoring_status ?? "pending",
        knowledge_map: session.knowledge_map ?? [],
      }));
  },
});

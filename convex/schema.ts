import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const difficulty = v.union(v.literal("easy"), v.literal("medium"), v.literal("hard"));
const gradeLevel = v.union(
  v.literal("Middle School"),
  v.literal("High School"),
  v.literal("Undergraduate"),
  v.literal("Graduate"),
);
const gradingPersonality = v.union(
  v.literal("Strict"),
  v.literal("Balanced"),
  v.literal("Encouraging"),
);

const criterionScore = v.object({
  criterion: v.string(),
  score: v.number(),
  feedback: v.string(),
});

const disputeResult = v.object({
  dispute_accepted: v.boolean(),
  original_score: v.number(),
  revised_score: v.number(),
  reviewer_explanation: v.string(),
});

const tutorMessage = v.object({
  role: v.union(v.literal("student"), v.literal("tutor")),
  content: v.string(),
  created_at: v.string(),
});

const pendingQuestion = v.object({
  topic: v.string(),
  background_info: v.string(),
  question: v.string(),
  grading_rubric: v.array(v.string()),
});

export default defineSchema({
  students: defineTable({
    student_id: v.string(),
    name: v.string(),
    email: v.string(),
    created_at: v.string(),
    updated_at: v.string(),
  })
    .index("by_student_id", ["student_id"])
    .index("by_email", ["email"]),

  exams: defineTable({
    config_id: v.string(),
    domain: v.string(),
    topics: v.array(v.string()),
    num_questions: v.number(),
    difficulty,
    grade_level: gradeLevel,
    grading_personality: gradingPersonality,
    teacher_name: v.string(),
    special_instructions: v.string(),
    created_at: v.string(),
  }).index("by_config_id", ["config_id"]),

  sessions: defineTable({
    session_id: v.string(),
    student_id: v.optional(v.union(v.string(), v.null())),
    student_name: v.string(),
    domain: v.string(),
    difficulty,
    grade_level: gradeLevel,
    grading_personality: gradingPersonality,
    teacher_name: v.string(),
    num_questions: v.number(),
    topics: v.array(v.string()),
    config_id: v.optional(v.union(v.string(), v.null())),
    special_instructions: v.string(),
    pending_question: v.optional(v.union(pendingQuestion, v.null())),
    status: v.union(v.literal("in_progress"), v.literal("completed")),
    composite_score: v.optional(v.number()),
    composite_feedback: v.optional(v.string()),
    total_time_seconds: v.optional(v.number()),
    completed_at: v.optional(v.string()),
    created_at: v.string(),
  })
    .index("by_session_id", ["session_id"])
    .index("by_status", ["status"])
    .index("by_student_status", ["student_id", "status"]),

  questions: defineTable({
    session_id: v.string(),
    question_index: v.number(),
    topic: v.string(),
    question: v.string(),
    background_info: v.string(),
    grading_rubric: v.array(v.string()),
    student_answer: v.string(),
    time_spent_seconds: v.number(),
    criterion_scores: v.array(criterionScore),
    overall_score: v.number(),
    grading_explanation: v.string(),
    created_at: v.string(),
  })
    .index("by_session", ["session_id"])
    .index("by_session_question", ["session_id", "question_index"]),

  disputes: defineTable({
    session_id: v.string(),
    question_index: v.number(),
    dispute_argument: v.string(),
    dispute_result: disputeResult,
    created_at: v.string(),
  })
    .index("by_session_question", ["session_id", "question_index"])
    .index("by_session", ["session_id"]),

  tutor_conversations: defineTable({
    session_id: v.string(),
    question_index: v.number(),
    messages: v.array(tutorMessage),
    updated_at: v.string(),
  })
    .index("by_session_question", ["session_id", "question_index"])
    .index("by_session", ["session_id"]),
});

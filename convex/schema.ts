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
  difficulty: v.optional(difficulty),
  source_chunk_id: v.optional(v.union(v.string(), v.null())),
  source_label: v.optional(v.union(v.string(), v.null())),
});

const knowledgeMapEntry = v.object({
  topic: v.string(),
  mastery_level: v.union(
    v.literal("Not Yet"),
    v.literal("Developing"),
    v.literal("Proficient"),
    v.literal("Mastered"),
  ),
  average_score: v.number(),
  summary: v.string(),
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

  material_chunks: defineTable({
    chunk_id: v.string(),
    config_id: v.string(),
    source_filename: v.string(),
    source_type: v.union(v.literal("pdf"), v.literal("pptx")),
    source_label: v.string(),
    chunk_index: v.number(),
    text: v.string(),
    created_at: v.string(),
    updated_at: v.string(),
  })
    .index("by_chunk_id", ["chunk_id"])
    .index("by_config", ["config_id"]),

  sessions: defineTable({
    session_id: v.string(),
    student_id: v.optional(v.union(v.string(), v.null())),
    student_name: v.string(),
    domain: v.string(),
    difficulty,
    current_difficulty: v.optional(difficulty),
    grade_level: gradeLevel,
    grading_personality: gradingPersonality,
    teacher_name: v.string(),
    num_questions: v.number(),
    topics: v.array(v.string()),
    config_id: v.optional(v.union(v.string(), v.null())),
    special_instructions: v.string(),
    pending_question: v.optional(v.union(pendingQuestion, v.null())),
    proctoring_status: v.optional(
      v.union(v.literal("pending"), v.literal("active"), v.literal("unproctored")),
    ),
    knowledge_map: v.optional(v.array(knowledgeMapEntry)),
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
    difficulty: v.optional(difficulty),
    source_chunk_id: v.optional(v.union(v.string(), v.null())),
    source_label: v.optional(v.union(v.string(), v.null())),
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

  proctor_snapshots: defineTable({
    snapshot_id: v.string(),
    session_id: v.string(),
    captured_at: v.string(),
    flags: v.array(v.string()),
    confidence: v.number(),
    description: v.string(),
    image_data_url: v.string(),
  })
    .index("by_snapshot_id", ["snapshot_id"])
    .index("by_session", ["session_id"]),
});

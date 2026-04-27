# AI Exam System — Prompt Archive

CSC394 / IS376 Senior Capstone Project — Spring 2026

All prompts used with AI coding collaborators (Codex for backend, Claude Code for frontend) throughout the development of the AI Exam System.

---

## Week 1: Concept Demo

### Prompt 1 — Backend Skeleton (Codex)

Build a FastAPI server with uvicorn that does the following:
- Has a POST endpoint `/api/generate-question` that accepts a JSON body with a `domain` field (string, e.g. "Roman History") and a `difficulty` field (string: "easy", "medium", "hard")
- Calls the [together.ai](http://together.ai) chat completions API (base URL: https://api.together.xyz/v1/chat/completions) using httpx async, with the API key loaded from a .env file
- The prompt to the LLM should instruct it to return a JSON object with: `background_info` (a short paragraph of context to show the student), `question` (an essay question), and `grading_rubric` (a list of criteria the answer should meet)
- Parse the LLM's JSON response and return it to the client
- Use Llama-3.3-70B-Instruct-Turbo as the model
- Include CORS middleware allowing localhost:5173
- Include a health check endpoint at GET /

### Prompt 2 — Grading Endpoint (Codex)

Add a POST endpoint `/api/grade-answer` that accepts: `question`, `grading_rubric`, `background_info`, `student_answer`, and `time_spent_seconds`
- Constructs a prompt sending all of this to the [together.ai](http://together.ai) API, instructing the LLM to grade the essay on a 0-100 scale across each rubric criterion, provide an overall score, and write a detailed explanation of the grading
- The LLM should return JSON with: `criterion_scores` (array of {criterion, score, feedback}), `overall_score`, `grading_explanation`
- Return the parsed result to the client

### Prompt 3 — React Frontend (Claude Code)

Build a React frontend (Vite + TypeScript + Tailwind) for an AI exam system with these views:
1. **Exam Setup** — Simple form where you pick a domain (text input) and difficulty (dropdown). Submit calls POST /api/generate-question
2. **Question View** — Displays the background_info in a styled card, shows the essay question below it, has a textarea for the student to write their answer, and a timer counting up showing elapsed time. Submit button calls POST /api/grade-answer
3. **Results View** — Shows the overall score prominently, then each rubric criterion with its individual score and feedback, and the full grading explanation at the bottom
- Use clean minimal styling, nothing fancy. Keep it functional.
- Proxy API calls to localhost:8000

---

## Week 3: Core Features

### Prompt 4 — Multi-Question Exams, Teacher Mode, Difficulty, Student Improvements (Claude Code)

We have an existing AI exam system with a FastAPI/uvicorn backend and React frontend that currently supports single-question generation and grading via [together.ai](http://together.ai). I need you to add the following features:

**1. Multi-question exam flow:**
- Add a POST endpoint `/api/start-exam` that accepts `domain`, `num_questions` (integer, 1-10), `difficulty` (easy/medium/hard), and optional `topics` (list of strings to constrain what gets asked). Returns a `session_id`.
- Modify `/api/generate-question` to accept a `session_id` and track which topics have already been covered in that session so questions don't repeat. Store session state in memory for now.
- Add a POST endpoint `/api/finish-exam` that takes a `session_id`, gathers all graded answers, sends a summary to the LLM for a final composite grade, and returns the full exam report.

**2. Teacher mode:**
- Add a new page/route `/teacher` with a form where a professor can input: domain, list of topic areas to cover, number of questions, difficulty, and any special instructions or constraints for question generation.
- Add a POST endpoint `/api/configure-exam` that saves this configuration and uses it when generating questions for students.
- Add a GET endpoint `/api/exam-results` that returns all graded exams so the professor can review them.

**3. Difficulty adjustment:**
- Update the question generation prompt so that "easy" asks broad conceptual questions, "medium" asks for specific analysis or comparison, and "hard" asks for deep critical thinking with multiple concepts. Adjust the grading prompt strictness to match.

**4. Student mode improvements:**
- Track time spent per question and include it in the grading payload.
- After grading, show per-criterion scores, overall score, and specific feedback explaining what would improve the grade.

Update the React frontend to support all of this with a landing page that lets you choose Student or Teacher mode.

After building everything, run the server and test the full flow: create an exam config as a teacher, start an exam as a student, answer all questions, finish the exam, and verify the results show up in the teacher review endpoint. Fix any bugs that come up during testing.

Once everything works, commit with the message "feat: add multi-question exams, teacher mode, difficulty adjustment, student time tracking" and push to main.

---

## Week 5: Midterm Features

### Prompt 5 — Grade Disputes, Topic Input, Analytics Dashboard, Styling Fix, Grade Level, Personality, Tutoring Mode (Claude Code)

We have an AI exam system with FastAPI/uvicorn backend and React frontend using [together.ai](http://together.ai). It currently supports multi-question exams with session management, teacher mode for configuring exams, difficulty adjustment, and per-question time tracking. I need seven new features plus a styling fix.

**1. Grade Disputes / Regrading:**
- Add a POST endpoint `/api/dispute-grade` that accepts `session_id`, `question_index`, and `dispute_argument` (the student's written argument for why their grade should be reconsidered)
- Send the original question, the student's answer, the original grading result, and the student's dispute argument to the LLM. Instruct the LLM to act as an impartial appeals reviewer: evaluate whether the dispute has merit, and if so, issue a revised score with explanation. If not, uphold the original score and explain why.
- Return JSON with `dispute_accepted` (boolean), `original_score`, `revised_score` (same as original if rejected), `reviewer_explanation`
- On the frontend results view, add a "Dispute Grade" button next to each question score. Clicking it opens a text area where the student writes their argument. Show the dispute result inline after submission.
- Add a cooldown: students can only dispute each question once.

**2. Topic List Input for Question Generation:**
- In teacher mode, add a text area where the professor can paste or type a list of specific topics they want covered (one per line)
- Update `/api/configure-exam` to accept an optional `topics` array
- When topics are provided, the question generator should pull from that list, assigning one topic per question and cycling through if there are more questions than topics. The LLM prompt should constrain question generation to the specified topic for each question.
- If no topics are provided, fall back to the current behavior where the LLM picks topics within the domain on its own
- Show which topic each question was generated from in both the student view (after answering) and the teacher results dashboard

**3. Exam Results Dashboard for Teachers:**
- Add a new GET endpoint `/api/exam-analytics` that returns aggregate data across all completed exam sessions: average scores, score distribution, per-question average scores, most disputed questions, average time per question, and a list of all student sessions with their composite grades
- Build a `/teacher/dashboard` page that displays this data. Show the overall average score as a big number at the top, a bar chart or visual breakdown of the score distribution, a table of individual exam sessions (timestamp, number of questions, composite score, number of disputes), and per-question stats showing which questions students struggled with most
- This data should pull from whatever in-memory storage you're using for sessions

**4. Styling cleanup:**
- There is a red line / red border showing on some elements that looks like a debug artifact. Find and remove any red borders, outlines, or lines that aren't intentional design elements.
- While you're in the CSS, do a general cleanup pass: make sure spacing is consistent, loading states look polished, and the overall UI feels cohesive between student mode and teacher mode.

**5. Select Grade Level:**
- Add a `grade_level` dropdown to the teacher exam config: "Middle School", "High School", "Undergraduate", "Graduate"
- Update the question generation prompt so that grade level controls vocabulary complexity, expected depth of reasoning, and length expectations. A middle school question on the Roman Empire asks very differently than a graduate-level one.
- Update the grading prompt to calibrate expectations to the selected level. A high school answer shouldn't be penalized for not citing primary sources the way a graduate answer would be.

**6. Grading Personality / Teacher Identity:**
- Add a `grading_personality` option in teacher config with presets: "Strict" (scores skew lower, detailed critique, high standards), "Balanced" (fair and thorough), "Encouraging" (focuses on what the student did well, gentler on mistakes, scores skew slightly higher)
- Add an optional `teacher_name` field so feedback says "Professor Elliott's feedback:" instead of generic text
- These modify the system prompt sent to the LLM during grading. The personality affects tone, scoring thresholds, and how feedback is framed.

**7. Tutoring Mode:**
- Add a separate `/tutor` route and corresponding POST endpoint `/api/tutor-session`
- After a student finishes an exam and sees their results, they can click "Study This" on any question they scored low on
- This starts a multi-turn conversation where the LLM acts as a tutor: it re-explains the topic area, asks the student simpler follow-up questions to check understanding, gives hints rather than direct answers, and guides them toward the correct reasoning
- Store the conversation history in the session and send it with each turn so the LLM has context
- The frontend shows a chat-style interface for the tutoring conversation with a "Done Studying" button to exit

After building everything, test the full flow: configure an exam as a teacher with a specific topic list, set a grade level and grading personality, take the exam as a student, dispute one grade, use tutoring mode on a low-scoring question, then check the teacher dashboard shows accurate analytics. Fix any bugs. Commit with message "feat: grade disputes, topic generation, teacher analytics, grade levels, personality, tutoring mode" and push to main.

---

## Notes

- All prompts were fed to either Codex (backend) or Claude Code (frontend) as indicated.
- Prompts were iteratively refined based on output. If the AI produced bugs or misunderstood requirements, follow-up corrections were made in-session (not captured in this archive as separate prompts).
- [Together.ai](http://Together.ai) was used as the LLM provider throughout, primarily with the Llama-3.3-70B-Instruct-Turbo model.

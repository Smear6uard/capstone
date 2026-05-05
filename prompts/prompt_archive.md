---

## Week 8: Persistence & Authentication

### Prompt 6 — Database Migration, Student Auth, Exam History (Claude Code)

We have an AI exam system with FastAPI/uvicorn backend and React frontend using together.ai. It currently has multi-question exams, teacher mode with grade level and personality settings, topic-based generation, grade disputes, tutoring mode, and a teacher analytics dashboard. All state is currently stored in memory. I need three new features.
1. Database Integration (Convex):

Migrate all in-memory state to Convex. This includes: exam configurations (teacher settings), exam sessions (questions, answers, grades, timestamps), dispute records, and tutoring conversation histories.
Create Convex schemas/tables for: exams (config set by teacher), sessions (each student exam attempt), questions (individual questions within a session with answers and grades), disputes (linked to a question), and tutor_conversations (message history per question).
Update every existing endpoint to read from and write to Convex instead of the in-memory dicts.
Make sure the teacher analytics dashboard queries Convex for aggregate data.
The app should work exactly as before from the user's perspective, just with data that persists across server restarts.

2. Student Authentication:

Add a simple login/signup flow. Students enter a name and email to create an account or log in. No password needed for now, just use email as the unique identifier.
Add a POST endpoint /api/auth/login that accepts name and email, creates the student in Convex if they don't exist, and returns a student_id.
Store student_id in React state (or localStorage) and include it in all subsequent API calls so exam sessions are tied to a specific student.
Update the teacher dashboard so it shows student names next to their exam sessions.
Add a simple landing page where students log in before accessing exams.

3. Exam History for Students:

Add a GET endpoint /api/student/history that accepts a student_id and returns all their past exam sessions with dates, domains, composite scores, and number of questions.
Build a /student/history page that shows a list of past exams sorted by date. Each entry shows the domain, score, difficulty, and date.
Clicking on a past exam expands to show per-question scores, the feedback received, and whether any disputes were filed.
At the top of the history page, show a simple progress summary: total exams taken, average score, and whether their average is trending up or down compared to their first half of exams vs second half.

After building everything, test the full flow: sign up as a new student, take an exam, verify the session persists in Convex after restarting the server, take a second exam, check that exam history shows both exams with accurate stats, and verify the teacher dashboard displays the student's name. Fix any bugs.
Then append the following entry to the prompt archive file at /prompts/prompt_archive.md:
---

## Week 8: Persistence & Authentication

### Prompt 6 — Database Migration, Student Auth, Exam History (Claude Code)

[Paste the full text of this prompt here]
Commit with message "feat: convex database, student auth, exam history" and push to main.

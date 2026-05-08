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

---

## Week 9: Advanced Features

### Prompt 7 — Lecture Upload, AI Proctoring, Adaptive Difficulty (Claude Code)

We have an AI exam system with FastAPI/uvicorn backend, React frontend, Convex database, together.ai for LLM, student auth, exam history, teacher dashboard, tutoring mode, grade disputes, and all the existing features. I need three advanced features that push this project to the next level.
1. Lecture Material Upload → Auto Question Generation:

In teacher mode, add a file upload area that accepts PDF and PPTX files (lecture slides, textbook chapters, study guides).
On the backend, add a POST endpoint /api/upload-material that:

Accepts the uploaded file
Extracts all text content from it (use PyPDF2 or pdfplumber for PDFs, python-pptx for PowerPoint files)
Chunks the extracted text into logical sections (by slide, by page, or by paragraph breaks)
Stores the chunks in Convex linked to the exam configuration


When generating questions for an exam that has uploaded material, include the relevant text chunks in the LLM prompt so questions are generated directly from the professor's actual course content rather than the LLM's general knowledge
The LLM prompt should instruct it to: create questions that test understanding of the specific material provided, reference concepts and examples from the uploaded content in the background_info, and build rubrics based on what the material actually teaches
In the teacher config UI, show a preview of the extracted content so the professor can verify it parsed correctly. Let them delete or edit individual chunks before generating questions.
Show a tag on each generated question indicating which chunk/slide/page it was derived from

2. AI Proctoring via Webcam:

Add a proctoring system that uses the student's webcam during the exam.
On the frontend, request camera permission when the student starts an exam. Display a small live preview in the corner of the screen so the student knows they're being monitored.
Every 30 seconds, capture a frame from the webcam video feed using canvas, convert it to base64, and send it to the backend via a POST endpoint /api/proctor/analyze.
On the backend, send the image to together.ai's vision-capable model (use meta-llama/Llama-Vision-Free or any vision model available on together.ai) with a prompt instructing it to analyze the image for: multiple people visible in frame, student looking away from screen for extended period, phone or second device visible, screen or notes visible that shouldn't be there. Return a JSON object with flags (array of detected issues), confidence (0-1), and description.
Store each proctoring snapshot result in Convex linked to the exam session.
If any flag has confidence above 0.7, show a subtle yellow warning banner to the student saying "Please keep your eyes on the screen."
On the teacher dashboard, add a "Proctoring Alerts" section that shows flagged sessions with timestamps, the detected issues, a thumbnail of the captured frame, and an overall integrity score per student session.
The teacher can click "Review" to see all captured frames for a session in a timeline view.
If the student denies camera access, let them take the exam anyway but mark the session as "Unproctored" in the teacher dashboard.

3. Adaptive Difficulty Engine:

Replace the static difficulty setting with a dynamic system that adjusts in real-time based on student performance during the exam.
After each question is graded, the backend evaluates the student's running performance:

If the student scored 85+ on the last two questions, bump the next question up one difficulty level
If the student scored below 60 on the last two questions, drop the next question down one difficulty level
Otherwise, maintain the current level


Track the difficulty level of each question in the session data (store in Convex)
At the end of the exam, generate a "Knowledge Map" — send all the questions, their topics, difficulties, and scores to the LLM and ask it to produce a JSON object mapping each sub-topic to a mastery level: "Not Yet" (below 50), "Developing" (50-69), "Proficient" (70-84), "Mastered" (85+)
On the results page, render the Knowledge Map as a visual grid or radar chart showing the student's strengths and weaknesses across topics. Color code each topic by mastery level (red, yellow, light green, dark green).
In the teacher dashboard, show aggregate Knowledge Maps so the professor can see which topics the entire class is struggling with.
The teacher can still set a starting difficulty, but the system takes over from there.

After building everything, test the full flow: upload a PDF as a teacher, start an exam as a student with webcam enabled, answer questions and verify difficulty adjusts based on performance, check that proctoring alerts appear in the teacher dashboard, and verify the Knowledge Map renders correctly on the results page. Fix any bugs.
Then append this as Prompt 7 to /prompts/prompt_archive.md under the heading "## Week 9: Advanced Features" with the subheading "### Prompt 7 — Lecture Upload, AI Proctoring, Adaptive Difficulty (Claude Code)". Read the existing file first before appending so nothing gets overwritten.
Commit with message "feat: lecture upload question gen, AI webcam proctoring, adaptive difficulty engine" and push to main. push to main after done dont create worktree or branch

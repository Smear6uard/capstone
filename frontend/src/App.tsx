import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

// ── API types ────────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard'
type GradeLevel = 'Middle School' | 'High School' | 'Undergraduate' | 'Graduate'
type GradingPersonality = 'Strict' | 'Balanced' | 'Encouraging'

interface ExamConfig {
  config_id: string
  domain: string
  topics: string[]
  num_questions: number
  difficulty: Difficulty
  grade_level: GradeLevel
  grading_personality: GradingPersonality
  teacher_name: string
  special_instructions: string
  created_at: string
}

interface StartExamResponse {
  session_id: string
  student_name: string
  domain: string
  difficulty: Difficulty
  grade_level: GradeLevel
  grading_personality: GradingPersonality
  teacher_name: string
  num_questions: number
}

interface GenerateQuestionResponse {
  background_info: string
  question: string
  grading_rubric: string[]
  topic: string
  question_index: number
  total_questions: number
}

interface CriterionScore {
  criterion: string
  score: number
  feedback: string
}

interface GradeAnswerResponse {
  criterion_scores: CriterionScore[]
  overall_score: number
  grading_explanation: string
  question_index: number
}

interface GradeDisputeResponse {
  dispute_accepted: boolean
  original_score: number
  revised_score: number
  reviewer_explanation: string
}

interface QuestionReport {
  question_index: number
  topic: string
  question: string
  background_info: string
  grading_rubric: string[]
  student_answer: string
  criterion_scores: CriterionScore[]
  overall_score: number
  grading_explanation: string
  time_spent_seconds: number
  dispute_result?: GradeDisputeResponse | null
}

interface FinishExamResponse {
  session_id: string
  student_name: string
  domain: string
  difficulty: Difficulty
  grade_level: GradeLevel
  grading_personality: GradingPersonality
  teacher_name: string
  num_questions: number
  questions: QuestionReport[]
  composite_score: number
  composite_feedback: string
  total_time_seconds: number
  completed_at: string
}

interface ScoreDistributionBucket {
  label: string
  min_score: number
  max_score: number
  count: number
}

interface PerQuestionAnalytics {
  question_index: number
  attempts: number
  average_score: number
  average_time_seconds: number
  topics: string[]
}

interface DisputedQuestionAnalytics {
  question_index: number
  topic: string
  question: string
  dispute_count: number
  accepted_disputes: number
  average_original_score: number
}

interface AnalyticsSession {
  session_id: string
  student_name: string
  domain: string
  completed_at: string
  num_questions: number
  composite_score: number
  dispute_count: number
}

interface ExamAnalyticsResponse {
  completed_sessions: number
  overall_average_score: number
  average_time_per_question: number
  score_distribution: ScoreDistributionBucket[]
  per_question_average_scores: PerQuestionAnalytics[]
  most_disputed_questions: DisputedQuestionAnalytics[]
  sessions: AnalyticsSession[]
}

interface TutorMessage {
  role: 'student' | 'tutor'
  content: string
  created_at: string
}

interface TutorSessionResponse {
  session_id: string
  question_index: number
  messages: TutorMessage[]
}

// ── API helpers ──────────────────────────────────────────────────────────────

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const payload = await res.json().catch(() => null)
    throw new Error(payload?.detail || `Server error (${res.status})`)
  }
  return res.json()
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) {
    const payload = await res.json().catch(() => null)
    throw new Error(payload?.detail || `Server error (${res.status})`)
  }
  return res.json()
}

// ── Tiny router (pathname + history API) ─────────────────────────────────────

function useRoute(): [string, (path: string) => void] {
  const [path, setPath] = useState<string>(() => window.location.pathname || '/')

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname || '/')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((next: string) => {
    window.history.pushState({}, '', next)
    setPath(new URL(next, window.location.origin).pathname || '/')
  }, [])

  return [path, navigate]
}

// ── Timer ────────────────────────────────────────────────────────────────────

function useTimer() {
  const [seconds, setSeconds] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = useCallback(() => {
    setSeconds(0)
    intervalRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
  }, [])

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
  }, [])

  const formatted = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
    seconds % 60,
  ).padStart(2, '0')}`

  return { seconds, formatted, start, stop }
}

// ── Shared presentational bits ──────────────────────────────────────────────

function Masthead({
  dateLabel,
  subtitle,
}: {
  dateLabel: string
  subtitle?: string
}) {
  return (
    <header className="w-full">
      <div className="flex items-center justify-between marquee text-ink-soft">
        <span>№ 0247 · VOL. IV</span>
        <span className="hidden md:inline">BUREAU OF ORAL &amp; WRITTEN EXAMINATIONS</span>
        <span>{dateLabel}</span>
      </div>
      <div className="mt-2 rule-ink" />
      <h1 className="ink-bleed mt-6 text-center font-display text-[clamp(2.6rem,7vw,5.6rem)] leading-[0.9] tracking-tight">
        The <span className="serif-italic">Examination</span> Bureau
      </h1>
      {subtitle && (
        <p className="mt-4 text-center font-mono text-xs uppercase tracking-[0.3em] text-ink-soft">
          {subtitle}
        </p>
      )}
      <div className="mt-6 rule-ink" />
    </header>
  )
}

function Stamp({ children = 'Certified Rubric' }: { children?: React.ReactNode }) {
  return (
    <span className="stamp">
      <span className="stamp-dot" />
      {children}
    </span>
  )
}

function scoreClass(score: number): string {
  if (score >= 85) return 'text-ink'
  if (score >= 65) return 'text-ink'
  return 'text-oxblood'
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="score-track">
      <div className="score-fill" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
    </div>
  )
}

function parseTopicLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map(topic => topic.trim())
    .filter(Boolean)
    .filter((topic, index, all) => all.indexOf(topic) === index)
}

function effectiveQuestionScore(question: QuestionReport): number {
  if (question.dispute_result?.dispute_accepted) {
    return question.dispute_result.revised_score
  }
  return question.overall_score
}

function feedbackLabel(teacherName?: string): string {
  const cleaned = teacherName?.trim() ?? ''
  return cleaned ? `${cleaned}'s feedback` : "Examiner's remark"
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.round(seconds % 60)
  return `${minutes}m ${String(remaining).padStart(2, '0')}s`
}

function DifficultyPicker({
  value,
  onChange,
}: {
  value: Difficulty
  onChange: (d: Difficulty) => void
}) {
  const options: { value: Difficulty; label: string; hint: string }[] = [
    { value: 'easy', label: 'I.  Easy', hint: 'Conceptual essentials' },
    { value: 'medium', label: 'II. Medium', hint: 'Analysis + comparison' },
    { value: 'hard', label: 'III.  Hard', hint: 'Critical synthesis' },
  ]
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {options.map(o => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={
              'text-left border px-4 py-3 transition-colors ' +
              (active
                ? 'bg-ink text-ivory border-ink'
                : 'bg-transparent text-ink border-ink hover:bg-ink/5')
            }
          >
            <div className="font-mono text-xs tracking-[0.2em] uppercase">
              {o.label}
            </div>
            <div
              className={
                'font-serif italic mt-1 text-sm ' +
                (active ? 'text-ivory/80' : 'text-ink-soft')
              }
            >
              {o.hint}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function GradeLevelSelect({
  value,
  onChange,
}: {
  value: GradeLevel
  onChange: (value: GradeLevel) => void
}) {
  return (
    <select
      id="grade-level"
      value={value}
      onChange={e => onChange(e.target.value as GradeLevel)}
      className="input-field mt-2"
    >
      <option>Middle School</option>
      <option>High School</option>
      <option>Undergraduate</option>
      <option>Graduate</option>
    </select>
  )
}

function PersonalitySelect({
  value,
  onChange,
}: {
  value: GradingPersonality
  onChange: (value: GradingPersonality) => void
}) {
  return (
    <select
      id="grading-personality"
      value={value}
      onChange={e => onChange(e.target.value as GradingPersonality)}
      className="input-field mt-2"
    >
      <option>Strict</option>
      <option>Balanced</option>
      <option>Encouraging</option>
    </select>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="border border-oxblood bg-oxblood/5 px-4 py-3 text-sm text-oxblood font-serif">
      <span className="font-mono uppercase tracking-[0.2em] text-xs mr-2">Notice ·</span>
      {message}
    </div>
  )
}

// ── Landing ──────────────────────────────────────────────────────────────────

function Landing({ navigate }: { navigate: (path: string) => void }) {
  const today = useMemo(
    () =>
      new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }),
    [],
  )

  return (
    <div className="mx-auto max-w-5xl px-6 py-14 md:py-20">
      <Masthead dateLabel={today} subtitle="Essays, rubrics, and composite grades since MMXXV" />

      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
        <button
          type="button"
          className="door rise delay-2"
          onClick={() => navigate('/student')}
        >
          <span className="door-number">Entrance I — Candidate</span>
          <span className="door-title">
            I am a <span className="serif-italic">student.</span>
          </span>
          <p className="door-body">
            Sit an exam drafted by your instructor. Write essay responses, have each one marked
            against a rubric, and receive a composite grade at the end of the session.
          </p>
          <div className="mt-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">
            <span>Begin the examination</span>
            <span>→</span>
          </div>
        </button>

        <button
          type="button"
          className="door rise delay-3"
          onClick={() => navigate('/teacher')}
        >
          <span className="door-number">Entrance II — Faculty</span>
          <span className="door-title">
            I am an <span className="serif-italic">instructor.</span>
          </span>
          <p className="door-body">
            Author an exam: choose a domain, set the covered topics, the number of questions, the
            difficulty, and any special directives. Review your students' performance afterwards.
          </p>
          <div className="mt-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">
            <span>Enter the faculty lounge</span>
            <span>→</span>
          </div>
        </button>
      </div>

      <div className="mt-20 rise delay-4 flex flex-wrap items-center justify-between gap-6 font-mono text-xs uppercase tracking-[0.25em] text-ink-soft">
        <div className="flex items-center gap-3">
          <Stamp>Certified</Stamp>
          <span>Marked by the house LLM</span>
        </div>
        <div>PAPER · QUILL · INK</div>
      </div>
    </div>
  )
}

// ── Teacher — entry page ─────────────────────────────────────────────────────

function TeacherHome({ navigate }: { navigate: (p: string) => void }) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <BackLink onClick={() => navigate('/')} label="Back to foyer" />

      <h1 className="mt-6 font-display text-5xl md:text-7xl leading-[0.95]">
        Faculty <span className="serif-italic">lounge.</span>
      </h1>
      <p className="mt-4 max-w-2xl font-serif text-lg text-ink-soft">
        Author an examination for your students or review the marked papers already turned in.
      </p>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
        <button className="door rise delay-1" onClick={() => navigate('/teacher/configure')}>
          <span className="door-number">Draft</span>
          <span className="door-title">Configure an <span className="serif-italic">exam.</span></span>
          <p className="door-body">Set topics, grade level, grading style, question count, and instructions for the question-writer.</p>
        </button>
        <button className="door rise delay-2" onClick={() => navigate('/teacher/dashboard')}>
          <span className="door-number">Analyze</span>
          <span className="door-title">Open the <span className="serif-italic">dashboard.</span></span>
          <p className="door-body">Track averages, score bands, disputed questions, time spent, and per-question trouble spots.</p>
        </button>
        <button className="door rise delay-3" onClick={() => navigate('/teacher/results')}>
          <span className="door-number">Review</span>
          <span className="door-title">Read the <span className="serif-italic">marks.</span></span>
          <p className="door-body">Inspect every completed exam with its composite grade, per-question scores, and the student's answers.</p>
        </button>
      </div>
    </div>
  )
}

// ── Teacher — configure ──────────────────────────────────────────────────────

function TeacherConfigure({ navigate }: { navigate: (p: string) => void }) {
  const [domain, setDomain] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>('Undergraduate')
  const [gradingPersonality, setGradingPersonality] = useState<GradingPersonality>('Balanced')
  const [teacherName, setTeacherName] = useState('')
  const [numQuestions, setNumQuestions] = useState<number>(3)
  const [topicsText, setTopicsText] = useState('')
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<ExamConfig | null>(null)
  const topics = useMemo(() => parseTopicLines(topicsText), [topicsText])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await apiPost<ExamConfig>('/api/configure-exam', {
        domain: domain.trim(),
        topics,
        num_questions: numQuestions,
        difficulty,
        grade_level: gradeLevel,
        grading_personality: gradingPersonality,
        teacher_name: teacherName.trim(),
        special_instructions: specialInstructions.trim(),
      })
      setSaved(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <BackLink onClick={() => navigate('/teacher')} label="Back to lounge" />

      <h1 className="mt-6 font-display text-5xl md:text-6xl leading-[0.95]">
        Draft an <span className="serif-italic">examination.</span>
      </h1>
      <p className="mt-3 font-serif text-ink-soft">
        Every field becomes part of the prompt sent to the examiner. Be specific.
      </p>

      {saved ? (
        <div className="paper paper-margin mt-10 p-8 md:p-10 rise">
          <div className="flex items-center gap-3">
            <Stamp>Filed</Stamp>
            <span className="font-mono text-xs tracking-[0.2em] uppercase text-ink-soft">
              Config № {saved.config_id.slice(0, 8)}
            </span>
          </div>
          <h2 className="mt-6 font-display text-4xl">{saved.domain}</h2>
          <dl className="mt-6 grid grid-cols-2 gap-y-3 gap-x-10 text-sm">
            <dt className="field-label">Difficulty</dt>
            <dd className="font-serif capitalize">{saved.difficulty}</dd>
            <dt className="field-label">Grade level</dt>
            <dd className="font-serif">{saved.grade_level}</dd>
            <dt className="field-label">Grading style</dt>
            <dd className="font-serif">{saved.grading_personality}</dd>
            <dt className="field-label">Teacher</dt>
            <dd className="font-serif">{saved.teacher_name || '—'}</dd>
            <dt className="field-label">Questions</dt>
            <dd className="font-serif">{saved.num_questions}</dd>
            <dt className="field-label">Topics</dt>
            <dd className="font-serif">{saved.topics.length ? saved.topics.join(', ') : '—'}</dd>
            <dt className="field-label">Instructions</dt>
            <dd className="font-serif">{saved.special_instructions || '—'}</dd>
          </dl>
          <div className="mt-8 flex flex-wrap gap-3">
            <button className="btn-primary" onClick={() => navigate('/student?config=' + saved.config_id)}>
              Preview as student →
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setSaved(null)
                setDomain('')
                setGradeLevel('Undergraduate')
                setGradingPersonality('Balanced')
                setTeacherName('')
                setTopicsText('')
                setSpecialInstructions('')
              }}
            >
              Draft another
            </button>
            <button className="btn-ghost" onClick={() => navigate('/teacher/results')}>
              Review marked papers
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="paper paper-margin mt-10 p-8 md:p-10 space-y-8 rise">
          <div>
            <label className="field-label" htmlFor="domain">Domain</label>
            <input
              id="domain"
              type="text"
              required
              maxLength={200}
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="e.g. The French Revolution, Molecular Genetics, Macroeconomics"
              className="input-field mt-2"
            />
          </div>

          <div>
            <span className="field-label">Difficulty</span>
            <div className="mt-3">
              <DifficultyPicker value={difficulty} onChange={setDifficulty} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="field-label" htmlFor="grade-level">Grade level</label>
              <GradeLevelSelect value={gradeLevel} onChange={setGradeLevel} />
              <p className="mt-2 font-serif italic text-sm text-ink-soft">
                Controls vocabulary, reasoning depth, and expected answer length.
              </p>
            </div>
            <div>
              <label className="field-label" htmlFor="teacher-name">Teacher name (optional)</label>
              <input
                id="teacher-name"
                type="text"
                maxLength={120}
                value={teacherName}
                onChange={e => setTeacherName(e.target.value)}
                placeholder="Professor Elliott"
                className="input-field mt-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="field-label" htmlFor="num">Number of questions</label>
              <input
                id="num"
                type="number"
                min={1}
                max={10}
                value={numQuestions}
                onChange={e => setNumQuestions(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                className="input-field mt-2"
              />
              <p className="mt-2 font-serif italic text-sm text-ink-soft">1 to 10 questions per sitting.</p>
            </div>
            <div>
              <label className="field-label" htmlFor="grading-personality">Grading personality</label>
              <PersonalitySelect value={gradingPersonality} onChange={setGradingPersonality} />
              <p className="mt-2 font-serif italic text-sm text-ink-soft">
                Sets tone, critique depth, and scoring thresholds during grading.
              </p>
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="topics">Specific topics (optional, one per line)</label>
            <textarea
              id="topics"
              rows={6}
              value={topicsText}
              onChange={e => setTopicsText(e.target.value)}
              placeholder={'Pax Romana\nCauses of the Western Empire collapse\nRoman engineering'}
              className="input-field mt-2"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {topics.length === 0 ? (
                <span className="font-serif italic text-sm text-ink-soft">
                  No topics set — the examiner will choose distinct subtopics on its own.
                </span>
              ) : (
                topics.map(t => <span key={t} className="chip">{t}</span>)
              )}
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="instructions">Special instructions (optional)</label>
            <textarea
              id="instructions"
              rows={5}
              value={specialInstructions}
              onChange={e => setSpecialInstructions(e.target.value)}
              placeholder="e.g. Reward use of primary sources. Avoid 20th-century examples."
              className="input-field mt-2"
            />
          </div>

          {error && <ErrorBanner message={error} />}

          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-[0.22em] text-ink-soft">
              Config saved in volatile memory
            </span>
            <button type="submit" disabled={loading || !domain.trim()} className="btn-primary">
              {loading ? 'Filing…' : 'File exam →'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── Teacher — results ────────────────────────────────────────────────────────

function TeacherResults({ navigate }: { navigate: (p: string) => void }) {
  const [exams, setExams] = useState<FinishExamResponse[] | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<FinishExamResponse | null>(null)

  useEffect(() => {
    let alive = true
    apiGet<{ exams: FinishExamResponse[] }>('/api/exam-results')
      .then(data => {
        if (alive) setExams(data.exams)
      })
      .catch(err => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load results.')
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <BackLink onClick={() => navigate('/teacher')} label="Back to lounge" />

      <div className="mt-6 flex items-end justify-between gap-6 flex-wrap">
        <h1 className="font-display text-5xl md:text-6xl leading-[0.95]">
          Marked <span className="serif-italic">papers.</span>
        </h1>
        <Stamp>Examiner's desk</Stamp>
      </div>

      {error && <div className="mt-8"><ErrorBanner message={error} /></div>}

      {exams === null && !error && (
        <p className="mt-8 font-serif italic text-ink-soft">Opening the filing cabinet…</p>
      )}

      {exams && exams.length === 0 && (
        <p className="mt-8 font-serif italic text-ink-soft">
          No papers submitted yet. Send students to <span className="underline">/student</span>.
        </p>
      )}

      {exams && exams.length > 0 && !selected && (
        <div className="mt-10 paper paper-margin p-6 md:p-8 rise">
          <table className="w-full text-left font-serif">
            <thead>
              <tr className="border-b border-ink/40">
                <th className="py-3 field-label">#</th>
                <th className="py-3 field-label">Candidate</th>
                <th className="py-3 field-label">Domain</th>
                <th className="py-3 field-label">Diff.</th>
                <th className="py-3 field-label">Qs</th>
                <th className="py-3 field-label">Composite</th>
                <th className="py-3 field-label">Filed</th>
                <th className="py-3"></th>
              </tr>
            </thead>
            <tbody>
              {exams.map((ex, i) => (
                <tr key={ex.session_id} className="border-b border-ink/10 hover:bg-ink/5">
                  <td className="py-3 font-mono text-xs">{String(i + 1).padStart(3, '0')}</td>
                  <td className="py-3">{ex.student_name}</td>
                  <td className="py-3">{ex.domain}</td>
                  <td className="py-3 capitalize">{ex.difficulty}</td>
                  <td className="py-3 font-mono">{ex.num_questions}</td>
                  <td className={'py-3 font-display text-2xl ' + scoreClass(ex.composite_score)}>
                    {ex.composite_score}
                  </td>
                  <td className="py-3 font-mono text-xs text-ink-soft">
                    {new Date(ex.completed_at).toLocaleString()}
                  </td>
                  <td className="py-3 text-right">
                    <button className="btn-ghost" onClick={() => setSelected(ex)}>Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <ExamReport
          report={selected}
          onClose={() => setSelected(null)}
          closeLabel="Back to roster"
        />
      )}
    </div>
  )
}

// ── Teacher — analytics dashboard ────────────────────────────────────────────

function TeacherDashboard({ navigate }: { navigate: (p: string) => void }) {
  const [analytics, setAnalytics] = useState<ExamAnalyticsResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    apiGet<ExamAnalyticsResponse>('/api/exam-analytics')
      .then(data => {
        if (alive) setAnalytics(data)
      })
      .catch(err => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load analytics.')
      })
    return () => {
      alive = false
    }
  }, [])

  const maxBucket = Math.max(
    1,
    ...(analytics?.score_distribution.map(bucket => bucket.count) ?? [0]),
  )

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <BackLink onClick={() => navigate('/teacher')} label="Back to lounge" />

      <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-5xl md:text-6xl leading-[0.95]">
            Exam <span className="serif-italic">analytics.</span>
          </h1>
          <p className="mt-3 font-serif text-ink-soft">
            Aggregate results from completed sessions in memory.
          </p>
        </div>
        <button className="btn-ghost" onClick={() => navigate('/teacher/results')}>
          Open papers
        </button>
      </div>

      {error && <div className="mt-8"><ErrorBanner message={error} /></div>}
      {!analytics && !error && <LoadingPaper headline="Calculating the class ledger…" />}

      {analytics && analytics.completed_sessions === 0 && (
        <div className="paper paper-margin mt-10 p-8 md:p-10">
          <div className="field-label">No completed exams</div>
          <p className="mt-3 font-serif text-lg text-ink-soft">
            The dashboard will populate after students finish at least one exam.
          </p>
        </div>
      )}

      {analytics && analytics.completed_sessions > 0 && (
        <div className="mt-10 space-y-8">
          <section className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-6">
            <div className="paper paper-margin p-8">
              <div className="field-label">Overall average</div>
              <div className={'mt-3 font-display text-[6rem] leading-none ' + scoreClass(analytics.overall_average_score)}>
                {analytics.overall_average_score}
              </div>
              <div className="mt-3 font-mono text-xs uppercase tracking-[0.22em] text-ink-soft">
                {analytics.completed_sessions} completed session{analytics.completed_sessions === 1 ? '' : 's'}
              </div>
              <div className="mt-6 field-label">Average time per question</div>
              <div className="mt-2 font-display text-3xl">
                {formatSeconds(analytics.average_time_per_question)}
              </div>
            </div>

            <div className="paper paper-margin p-8">
              <div className="field-label">Score distribution</div>
              <div className="mt-6 space-y-4">
                {analytics.score_distribution.map(bucket => (
                  <div key={bucket.label} className="grid grid-cols-[5rem_1fr_3rem] items-center gap-3">
                    <span className="font-mono text-xs text-ink-soft">{bucket.label}</span>
                    <div className="score-track">
                      <div
                        className="score-fill"
                        style={{ width: `${(bucket.count / maxBucket) * 100}%` }}
                      />
                    </div>
                    <span className="font-display text-2xl text-right">{bucket.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="paper paper-margin p-6 md:p-8">
            <div className="field-label">Individual sessions</div>
            <div className="table-wrap mt-4">
              <table className="w-full text-left font-serif">
                <thead>
                  <tr className="border-b border-ink/30">
                    <th className="py-3 field-label">Timestamp</th>
                    <th className="py-3 field-label">Student</th>
                    <th className="py-3 field-label">Domain</th>
                    <th className="py-3 field-label">Qs</th>
                    <th className="py-3 field-label">Composite</th>
                    <th className="py-3 field-label">Disputes</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.sessions.map(session => (
                    <tr key={session.session_id} className="border-b border-ink/10">
                      <td className="py-3 font-mono text-xs text-ink-soft">
                        {new Date(session.completed_at).toLocaleString()}
                      </td>
                      <td className="py-3">{session.student_name}</td>
                      <td className="py-3">{session.domain}</td>
                      <td className="py-3 font-mono">{session.num_questions}</td>
                      <td className={'py-3 font-display text-2xl ' + scoreClass(session.composite_score)}>
                        {session.composite_score}
                      </td>
                      <td className="py-3 font-mono">{session.dispute_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="paper paper-margin p-6 md:p-8">
              <div className="field-label">Per-question stats</div>
              <div className="mt-4 space-y-4">
                {analytics.per_question_average_scores.map(item => (
                  <div key={item.question_index} className="border border-ink/15 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-mono text-xs uppercase tracking-[0.22em] text-ink-soft">
                          Question {item.question_index + 1} · {item.attempts} attempt{item.attempts === 1 ? '' : 's'}
                        </div>
                        <div className="mt-2 font-serif text-sm text-ink-soft">
                          {item.topics.length ? item.topics.join(', ') : 'No topic labels'}
                        </div>
                      </div>
                      <div className={'font-display text-4xl ' + scoreClass(item.average_score)}>
                        {item.average_score}
                      </div>
                    </div>
                    <ScoreBar score={item.average_score} />
                    <div className="mt-2 font-mono text-xs text-ink-soft">
                      Average time: {formatSeconds(item.average_time_seconds)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="paper paper-margin p-6 md:p-8">
              <div className="field-label">Most disputed questions</div>
              <div className="mt-4 space-y-4">
                {analytics.most_disputed_questions.length === 0 && (
                  <p className="font-serif italic text-ink-soft">No disputes have been filed yet.</p>
                )}
                {analytics.most_disputed_questions.map((item, index) => (
                  <div key={`${item.question}-${index}`} className="border border-ink/15 p-4">
                    <div className="font-mono text-xs uppercase tracking-[0.22em] text-ink-soft">
                      Q{item.question_index + 1} · {item.topic}
                    </div>
                    <p className="mt-2 font-serif leading-relaxed">{item.question}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="chip">{item.dispute_count} dispute{item.dispute_count === 1 ? '' : 's'}</span>
                      <span className="chip">{item.accepted_disputes} accepted</span>
                      <span className="chip">avg original {item.average_original_score}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

// ── Student — entry/setup ────────────────────────────────────────────────────

function StudentSetup({
  navigate,
  initialConfigId,
  onStarted,
}: {
  navigate: (p: string) => void
  initialConfigId: string | null
  onStarted: (config: {
    session: StartExamResponse
    totalQuestions: number
  }) => void
}) {
  const [configs, setConfigs] = useState<ExamConfig[] | null>(null)
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(initialConfigId)
  const [studentName, setStudentName] = useState('')
  const [domain, setDomain] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>('Undergraduate')
  const [gradingPersonality, setGradingPersonality] = useState<GradingPersonality>('Balanced')
  const [teacherName, setTeacherName] = useState('')
  const [numQuestions, setNumQuestions] = useState(3)
  const [topics, setTopics] = useState<string[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    apiGet<ExamConfig[]>('/api/exam-configs')
      .then(data => {
        if (!alive) return
        setConfigs(data)
        // Pre-select initialConfigId if present, else the most recent.
        const pick = initialConfigId
          ? data.find(c => c.config_id === initialConfigId) ?? null
          : data[0] ?? null
        if (pick) {
          setSelectedConfigId(pick.config_id)
          setDomain(pick.domain)
          setDifficulty(pick.difficulty)
          setGradeLevel(pick.grade_level)
          setGradingPersonality(pick.grading_personality)
          setTeacherName(pick.teacher_name)
          setNumQuestions(pick.num_questions)
          setTopics(pick.topics)
        }
      })
      .catch(err => {
        if (alive) setError(err instanceof Error ? err.message : 'Could not load exam configs.')
      })
    return () => {
      alive = false
    }
  }, [initialConfigId])

  function handleConfigChange(id: string) {
    if (id === '__custom__') {
      setSelectedConfigId(null)
      return
    }
    const cfg = configs?.find(c => c.config_id === id)
    if (!cfg) return
    setSelectedConfigId(cfg.config_id)
    setDomain(cfg.domain)
    setDifficulty(cfg.difficulty)
    setGradeLevel(cfg.grade_level)
    setGradingPersonality(cfg.grading_personality)
    setTeacherName(cfg.teacher_name)
    setNumQuestions(cfg.num_questions)
    setTopics(cfg.topics)
  }

  async function handleStart(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const session = await apiPost<StartExamResponse>('/api/start-exam', {
        domain: domain.trim(),
        num_questions: numQuestions,
        difficulty,
        grade_level: gradeLevel,
        grading_personality: gradingPersonality,
        teacher_name: teacherName,
        topics,
        student_name: studentName.trim() || 'Anonymous Student',
        config_id: selectedConfigId,
      })
      onStarted({ session, totalQuestions: session.num_questions })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the exam.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <BackLink onClick={() => navigate('/')} label="Back to foyer" />

      <h1 className="mt-6 font-display text-5xl md:text-6xl leading-[0.95]">
        Candidate <span className="serif-italic">registration.</span>
      </h1>
      <p className="mt-3 font-serif text-ink-soft">
        Sign the roll, pick an exam, and commence.
      </p>

      <form onSubmit={handleStart} className="paper paper-margin mt-10 p-8 md:p-10 space-y-8 rise">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <label className="field-label" htmlFor="student-name">Your name</label>
            <input
              id="student-name"
              type="text"
              value={studentName}
              onChange={e => setStudentName(e.target.value)}
              placeholder="Jane Doe"
              className="input-field mt-2"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="config">Exam script</label>
            <select
              id="config"
              value={selectedConfigId ?? '__custom__'}
              onChange={e => handleConfigChange(e.target.value)}
              className="input-field mt-2"
            >
              {configs && configs.length > 0 && configs.map(c => (
                <option key={c.config_id} value={c.config_id}>
                  {c.domain} · {c.grade_level} · {c.difficulty} · {c.num_questions}Q
                </option>
              ))}
              <option value="__custom__">Custom (self-directed)</option>
            </select>
            {configs && configs.length === 0 && (
              <p className="mt-2 font-serif italic text-sm text-ink-soft">
                No instructor-filed exams yet. Compose your own.
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="domain">Domain</label>
          <input
            id="domain"
            type="text"
            required
            maxLength={200}
            value={domain}
            onChange={e => setDomain(e.target.value)}
            placeholder="e.g. Moral Philosophy, Thermodynamics"
            className="input-field mt-2"
          />
        </div>

        <div>
          <span className="field-label">Difficulty</span>
          <div className="mt-3">
            <DifficultyPicker value={difficulty} onChange={setDifficulty} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <label className="field-label" htmlFor="num">Questions in this sitting</label>
            <input
              id="num"
              type="number"
              min={1}
              max={10}
              value={numQuestions}
              onChange={e => setNumQuestions(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="input-field mt-2"
            />
          </div>
          <div>
            <span className="field-label">Topics covered</span>
            <div className="mt-3 flex flex-wrap gap-2">
              {topics.length === 0 ? (
                <span className="font-serif italic text-sm text-ink-soft">
                  The examiner will select distinct subtopics.
                </span>
              ) : (
                topics.map(t => <span key={t} className="chip">{t}</span>)
              )}
            </div>
          </div>
        </div>

        {error && <ErrorBanner message={error} />}

        <div className="flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-[0.22em] text-ink-soft">
            Good luck.
          </span>
          <button type="submit" disabled={loading || !domain.trim()} className="btn-primary">
            {loading ? 'Seating you…' : 'Begin the exam →'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Student — running exam ───────────────────────────────────────────────────

type ExamPhase =
  | { kind: 'loading-question' }
  | { kind: 'writing'; question: GenerateQuestionResponse }
  | { kind: 'grading'; question: GenerateQuestionResponse; answer: string; elapsed: number }
  | { kind: 'reviewing'; question: GenerateQuestionResponse; grade: GradeAnswerResponse; answer: string }
  | { kind: 'finalizing' }
  | { kind: 'finished'; report: FinishExamResponse }
  | { kind: 'error'; message: string; retryable: boolean }

function StudentExam({
  session,
  totalQuestions,
  onExit,
  onFinished,
  onStudy,
}: {
  session: StartExamResponse
  totalQuestions: number
  onExit: () => void
  onFinished: (report: FinishExamResponse) => void
  onStudy: (questionIndex: number) => void
}) {
  const [phase, setPhase] = useState<ExamPhase>({ kind: 'loading-question' })
  const [answeredCount, setAnsweredCount] = useState(0)

  const requestQuestion = useCallback(() => {
    return apiPost<GenerateQuestionResponse>('/api/generate-question', {
        session_id: session.session_id,
      })
  }, [session.session_id])

  const fetchNextQuestion = useCallback(async () => {
    setPhase({ kind: 'loading-question' })
    try {
      const q = await requestQuestion()
      setPhase({ kind: 'writing', question: q })
    } catch (err) {
      setPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not generate the next question.',
        retryable: true,
      })
    }
  }, [requestQuestion])

  useEffect(() => {
    let cancelled = false
    async function loadInitialQuestion() {
      try {
        const q = await requestQuestion()
        if (!cancelled) setPhase({ kind: 'writing', question: q })
      } catch (err) {
        if (!cancelled) {
          setPhase({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Could not generate the next question.',
            retryable: true,
          })
        }
      }
    }
    loadInitialQuestion()
    return () => {
      cancelled = true
    }
  }, [requestQuestion])

  const handleSubmit = useCallback(
    async (answer: string, elapsed: number, question: GenerateQuestionResponse) => {
      setPhase({ kind: 'grading', question, answer, elapsed })
      try {
        const grade = await apiPost<GradeAnswerResponse>('/api/grade-answer', {
          session_id: session.session_id,
          student_answer: answer,
          time_spent_seconds: elapsed,
        })
        setPhase({ kind: 'reviewing', question, grade, answer })
        setAnsweredCount(c => c + 1)
      } catch (err) {
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Grading failed.',
          retryable: false,
        })
      }
    },
    [session.session_id],
  )

  const handleFinish = useCallback(async () => {
    setPhase({ kind: 'finalizing' })
    try {
      const report = await apiPost<FinishExamResponse>('/api/finish-exam', {
        session_id: session.session_id,
      })
      setPhase({ kind: 'finished', report })
      onFinished(report)
    } catch (err) {
      setPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not finalize the exam.',
        retryable: false,
      })
    }
  }, [onFinished, session.session_id])

  const progressText = `Q. ${String(Math.min(answeredCount + 1, totalQuestions)).padStart(2, '0')} / ${String(totalQuestions).padStart(2, '0')}`

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div className="q-marker">{progressText} · {session.domain}</div>
        <div className="font-mono text-xs tracking-[0.22em] uppercase text-ink-soft">
          {session.student_name}
        </div>
      </div>
      <div className="mt-3 score-track">
        <div
          className="score-fill"
          style={{ width: `${(answeredCount / totalQuestions) * 100}%` }}
        />
      </div>

      <div className="mt-8">
        {phase.kind === 'loading-question' && (
          <LoadingPaper headline="Composing your question…" />
        )}
        {phase.kind === 'writing' && (
          <WritingPaper
            question={phase.question}
            onSubmit={(a, e) => handleSubmit(a, e, phase.question)}
          />
        )}
        {phase.kind === 'grading' && (
          <LoadingPaper headline="Red pen, red ink — grading…" />
        )}
        {phase.kind === 'reviewing' && (
          <ReviewPaper
            question={phase.question}
            grade={phase.grade}
            teacherName={session.teacher_name}
            isLast={answeredCount >= totalQuestions}
            onNext={() => fetchNextQuestion()}
            onFinish={handleFinish}
          />
        )}
        {phase.kind === 'finalizing' && (
          <LoadingPaper headline="Assembling your composite mark…" />
        )}
        {phase.kind === 'finished' && (
          <ExamReport
            report={phase.report}
            onClose={onExit}
            closeLabel="Return to foyer"
            allowDisputes
            onStudy={onStudy}
            onReportUpdated={report => {
              onFinished(report)
              setPhase({ kind: 'finished', report })
            }}
          />
        )}
        {phase.kind === 'error' && (
          <div className="paper paper-margin p-8 space-y-6">
            <ErrorBanner message={phase.message} />
            <div className="flex gap-3">
              {phase.retryable && (
                <button className="btn-primary" onClick={() => fetchNextQuestion()}>
                  Retry
                </button>
              )}
              <button className="btn-ghost" onClick={onExit}>Exit the hall</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LoadingPaper({ headline }: { headline: string }) {
  return (
    <div className="paper paper-margin p-10 rise">
      <div className="flex items-center gap-3">
        <span className="stamp-dot" />
        <span className="font-mono uppercase tracking-[0.22em] text-xs text-oxblood">
          In progress
        </span>
      </div>
      <p className="mt-6 font-display text-3xl md:text-4xl">{headline}</p>
      <div className="mt-8 h-1 bg-ink/10 overflow-hidden">
        <div className="h-full w-1/3 bg-oxblood animate-[pulse_1.5s_ease-in-out_infinite]" />
      </div>
    </div>
  )
}

function WritingPaper({
  question,
  onSubmit,
}: {
  question: GenerateQuestionResponse
  onSubmit: (answer: string, elapsed: number) => void
}) {
  const [answer, setAnswer] = useState('')
  const { seconds, formatted, start, stop } = useTimer()

  useEffect(() => {
    start()
    return () => stop()
  }, [start, stop])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!answer.trim()) return
    stop()
    onSubmit(answer.trim(), seconds)
  }

  return (
    <form onSubmit={handleSubmit} className="paper paper-margin p-8 md:p-10 rise">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="chip">{question.topic}</span>
          <span className="font-mono text-xs tracking-[0.2em] uppercase text-ink-soft">
            Q{String(question.question_index + 1).padStart(2, '0')} of {String(question.total_questions).padStart(2, '0')}
          </span>
        </div>
        <div className="font-mono text-base tracking-wider text-oxblood">
          ⏱ {formatted}
        </div>
      </div>

      <div className="mt-6">
        <div className="field-label">Context</div>
        <p className="mt-2 font-serif italic text-ink-soft leading-relaxed">
          {question.background_info}
        </p>
      </div>

      <h2 className="mt-6 font-display text-3xl md:text-[2.6rem] leading-[1.05]">
        {question.question}
      </h2>

      <div className="mt-6">
        <label htmlFor="answer" className="field-label flex items-center justify-between">
          <span>Your answer</span>
          <span className="font-mono text-[10px] text-ink-soft">
            {answer.trim().split(/\s+/).filter(Boolean).length} words
          </span>
        </label>
        <textarea
          id="answer"
          rows={12}
          required
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          placeholder="Compose your essay…"
          className="input-field mt-2"
        />
      </div>

      <div className="mt-6">
        <div className="field-label">Marked against</div>
        <ul className="mt-2 space-y-1 font-serif text-ink-soft">
          {question.grading_rubric.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-mono text-xs text-oxblood">[{String(i + 1).padStart(2, '0')}]</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.22em] text-ink-soft">
          Once submitted, the paper is sealed.
        </span>
        <button type="submit" disabled={!answer.trim()} className="btn-primary">
          Submit for marking →
        </button>
      </div>
    </form>
  )
}

function ReviewPaper({
  question,
  grade,
  teacherName,
  isLast,
  onNext,
  onFinish,
}: {
  question: GenerateQuestionResponse
  grade: GradeAnswerResponse
  teacherName: string
  isLast: boolean
  onNext: () => void
  onFinish: () => void
}) {
  return (
    <div className="paper paper-margin p-8 md:p-10 rise space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Stamp>Marked</Stamp>
          <span className="font-mono text-xs tracking-[0.2em] uppercase text-ink-soft">
            {question.topic}
          </span>
        </div>
        <div className="text-right">
          <div className="field-label">Overall score</div>
          <div className={'font-display text-6xl leading-none ' + scoreClass(grade.overall_score)}>
            {grade.overall_score}
            <span className="text-ink-soft text-2xl"> / 100</span>
          </div>
        </div>
      </div>

      <ScoreBar score={grade.overall_score} />

      <div>
        <div className="field-label">Per-criterion marks</div>
        <div className="mt-3 space-y-4">
          {grade.criterion_scores.map((c, i) => (
            <div key={i} className="border border-ink/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-xs tracking-[0.2em] uppercase text-oxblood">
                    [{String(i + 1).padStart(2, '0')}]
                  </div>
                  <div className="font-serif text-base mt-1">{c.criterion}</div>
                </div>
                <div className={'font-display text-3xl ' + scoreClass(c.score)}>
                  {c.score}
                  <span className="text-ink-soft text-sm">/100</span>
                </div>
              </div>
              <ScoreBar score={c.score} />
              <p className="mt-3 font-serif text-ink-soft leading-relaxed">{c.feedback}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="field-label">{feedbackLabel(teacherName)}</div>
        <p className="mt-2 font-serif leading-relaxed whitespace-pre-line">
          {grade.grading_explanation}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.22em] text-ink-soft">
          Question {grade.question_index + 1} filed.
        </span>
        {isLast ? (
          <button className="btn-primary" onClick={onFinish}>
            Finish exam · Composite mark →
          </button>
        ) : (
          <button className="btn-primary" onClick={onNext}>
            Next question →
          </button>
        )}
      </div>
    </div>
  )
}

function ExamReport({
  report,
  onClose,
  closeLabel,
  allowDisputes = false,
  onReportUpdated,
  onStudy,
}: {
  report: FinishExamResponse
  onClose: () => void
  closeLabel: string
  allowDisputes?: boolean
  onReportUpdated?: (report: FinishExamResponse) => void
  onStudy?: (questionIndex: number) => void
}) {
  const [displayReport, setDisplayReport] = useState(report)
  const [openDisputeIndex, setOpenDisputeIndex] = useState<number | null>(null)
  const [disputeDraft, setDisputeDraft] = useState('')
  const [disputeLoadingIndex, setDisputeLoadingIndex] = useState<number | null>(null)
  const [disputeError, setDisputeError] = useState('')
  const totalMinutes = Math.round(displayReport.total_time_seconds / 60)

  useEffect(() => {
    setDisplayReport(report)
  }, [report])

  async function submitDispute(question: QuestionReport) {
    if (!disputeDraft.trim()) return
    setDisputeLoadingIndex(question.question_index)
    setDisputeError('')
    try {
      const result = await apiPost<GradeDisputeResponse>('/api/dispute-grade', {
        session_id: displayReport.session_id,
        question_index: question.question_index,
        dispute_argument: disputeDraft.trim(),
      })
      const nextReport = {
        ...displayReport,
        questions: displayReport.questions.map(q =>
          q.question_index === question.question_index
            ? { ...q, dispute_result: result }
            : q,
        ),
      }
      setDisplayReport(nextReport)
      onReportUpdated?.(nextReport)
      setOpenDisputeIndex(null)
      setDisputeDraft('')
    } catch (err) {
      setDisputeError(err instanceof Error ? err.message : 'Could not submit the dispute.')
    } finally {
      setDisputeLoadingIndex(null)
    }
  }

  return (
    <div className="paper paper-margin p-8 md:p-12 rise space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <Stamp>Sealed &amp; Filed</Stamp>
            <span className="font-mono text-xs tracking-[0.22em] uppercase text-ink-soft">
              {new Date(displayReport.completed_at).toLocaleString()}
            </span>
          </div>
          <h2 className="mt-4 font-display text-5xl md:text-6xl leading-[0.95]">
            Composite <span className="serif-italic">mark.</span>
          </h2>
          <p className="mt-2 font-serif italic text-ink-soft">
            {displayReport.student_name} · {displayReport.domain} · {displayReport.grade_level} · {displayReport.difficulty}
          </p>
        </div>
        <div className="text-right">
          <div className="field-label">Final</div>
          <div className={'font-display text-[5.5rem] leading-none ' + scoreClass(displayReport.composite_score)}>
            {displayReport.composite_score}
          </div>
          <div className="font-mono text-xs tracking-[0.22em] uppercase text-ink-soft">
            out of 100
          </div>
        </div>
      </div>

      <ScoreBar score={displayReport.composite_score} />

      <div>
        <div className="field-label">{feedbackLabel(displayReport.teacher_name)} · composite</div>
        <p className="mt-3 font-serif text-lg leading-relaxed whitespace-pre-line">
          {displayReport.composite_feedback}
        </p>
      </div>

      <div>
        <div className="field-label">Question-by-question</div>
        <div className="mt-4 space-y-4">
          {displayReport.questions.map((q, i) => {
            const effectiveScore = effectiveQuestionScore(q)
            const disputeOpen = openDisputeIndex === q.question_index
            return (
            <div key={i} className="border border-ink/20 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-xs tracking-[0.22em] uppercase text-oxblood">
                    Q{String(i + 1).padStart(2, '0')} · {q.topic}
                  </div>
                  <div className="mt-2 font-display text-xl md:text-2xl leading-tight">
                    {q.question}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="flex items-start justify-end gap-3">
                    <div>
                      <div className={'font-display text-4xl leading-none ' + scoreClass(effectiveScore)}>
                        {effectiveScore}
                      </div>
                      {q.dispute_result?.dispute_accepted && (
                        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                          revised from {q.dispute_result.original_score}
                        </div>
                      )}
                    </div>
                    {allowDisputes && (
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={!!q.dispute_result || disputeLoadingIndex === q.question_index}
                        onClick={() => {
                          setOpenDisputeIndex(q.question_index)
                          setDisputeDraft('')
                          setDisputeError('')
                        }}
                      >
                        {q.dispute_result ? 'Disputed' : 'Dispute Grade'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {q.criterion_scores.map((c, j) => (
                  <div key={j} className="border border-ink/10 p-2">
                    <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-soft">
                      {c.criterion}
                    </div>
                    <div className={'font-display text-xl ' + scoreClass(c.score)}>
                      {c.score}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 font-mono text-xs text-ink-soft">
                ⏱ {Math.round(q.time_spent_seconds)}s
              </div>
              {q.dispute_result && (
                <div className="mt-4 bg-ink/5 border border-ink/15 p-4">
                  <div className="field-label">
                    {q.dispute_result.dispute_accepted ? 'Dispute accepted' : 'Dispute rejected'}
                  </div>
                  <p className="mt-2 font-serif text-ink-soft leading-relaxed">
                    {q.dispute_result.dispute_accepted
                      ? `Revised score: ${q.dispute_result.revised_score}.`
                      : `Original score upheld at ${q.dispute_result.original_score}.`}
                    {' '}
                    {q.dispute_result.reviewer_explanation}
                  </p>
                </div>
              )}
              {disputeOpen && !q.dispute_result && (
                <div className="mt-4 bg-ink/5 border border-ink/15 p-4">
                  <label className="field-label" htmlFor={`dispute-${q.question_index}`}>
                    Student dispute argument
                  </label>
                  <textarea
                    id={`dispute-${q.question_index}`}
                    rows={5}
                    value={disputeDraft}
                    onChange={e => setDisputeDraft(e.target.value)}
                    placeholder="Explain what the grader overlooked or how the rubric was misapplied."
                    className="input-field mt-2"
                  />
                  {disputeError && <div className="mt-3"><ErrorBanner message={disputeError} /></div>}
                  <div className="mt-4 flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setOpenDisputeIndex(null)
                        setDisputeDraft('')
                        setDisputeError('')
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!disputeDraft.trim() || disputeLoadingIndex === q.question_index}
                      onClick={() => submitDispute(q)}
                    >
                      {disputeLoadingIndex === q.question_index ? 'Reviewing…' : 'Submit dispute'}
                    </button>
                  </div>
                </div>
              )}
              {onStudy && effectiveScore < 80 && (
                <div className="mt-4">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => onStudy(q.question_index)}
                  >
                    Study This
                  </button>
                </div>
              )}
            </div>
          )})}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.22em] text-ink-soft">
          Total time: {totalMinutes} minute{totalMinutes === 1 ? '' : 's'}
        </span>
        <button className="btn-primary" onClick={onClose}>
          {closeLabel} →
        </button>
      </div>
    </div>
  )
}

// ── Tutor ────────────────────────────────────────────────────────────────────

function TutorPage({
  sessionId,
  questionIndex,
  onDone,
}: {
  sessionId: string | null
  questionIndex: number | null
  onDone: () => void
}) {
  const [messages, setMessages] = useState<TutorMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const canLoad = Boolean(sessionId) && questionIndex !== null

  const sendTutorMessage = useCallback(
    async (message: string) => {
      if (!sessionId || questionIndex === null) return
      setLoading(true)
      setError('')
      try {
        const response = await apiPost<TutorSessionResponse>('/api/tutor-session', {
          session_id: sessionId,
          question_index: questionIndex,
          message,
        })
        setMessages(response.messages)
        setDraft('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The tutor could not respond.')
      } finally {
        setLoading(false)
      }
    },
    [questionIndex, sessionId],
  )

  useEffect(() => {
    if (!canLoad) return
    sendTutorMessage('')
  }, [canLoad, sendTutorMessage])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!draft.trim()) return
    sendTutorMessage(draft.trim())
  }

  if (!canLoad) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <BackLink onClick={onDone} label="Leave tutoring" />
        <div className="mt-8"><ErrorBanner message="No tutoring session was selected." /></div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <BackLink onClick={onDone} label="Done studying" />
        <span className="q-marker">Study hall · Q{String(questionIndex + 1).padStart(2, '0')}</span>
      </div>

      <div className="paper paper-margin mt-8 p-6 md:p-8">
        <div className="field-label">Tutoring conversation</div>
        <div className="mt-5 space-y-4">
          {messages.length === 0 && !error && (
            <p className="font-serif italic text-ink-soft">The tutor is reading your answer…</p>
          )}
          {messages.map((message, index) => (
            <div
              key={`${message.created_at}-${index}`}
              className={
                'chat-bubble ' +
                (message.role === 'student' ? 'chat-bubble-student' : 'chat-bubble-tutor')
              }
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                {message.role === 'student' ? 'You' : 'Tutor'}
              </div>
              <p className="mt-2 font-serif leading-relaxed whitespace-pre-line">{message.content}</p>
            </div>
          ))}
        </div>

        {error && <div className="mt-5"><ErrorBanner message={error} /></div>}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="field-label" htmlFor="tutor-message">Your reply</label>
          <textarea
            id="tutor-message"
            rows={4}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Try answering the tutor's follow-up question, or ask for a hint."
            className="input-field"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className="btn-ghost" onClick={onDone}>
              Done Studying
            </button>
            <button type="submit" className="btn-primary" disabled={!draft.trim() || loading}>
              {loading ? 'Thinking…' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="font-mono text-xs uppercase tracking-[0.25em] text-ink-soft hover:text-oxblood"
    >
      ← {label}
    </button>
  )
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [pathname, navigate] = useRoute()

  const [examSession, setExamSession] = useState<StartExamResponse | null>(null)
  const [finishedReport, setFinishedReport] = useState<FinishExamResponse | null>(null)
  const [tutorTarget, setTutorTarget] = useState<{ sessionId: string; questionIndex: number } | null>(null)

  function exitExam() {
    setExamSession(null)
    setFinishedReport(null)
    setTutorTarget(null)
    navigate('/')
  }

  function startStudy(questionIndex: number) {
    if (!finishedReport) return
    const target = { sessionId: finishedReport.session_id, questionIndex }
    setTutorTarget(target)
    navigate(`/tutor?session=${target.sessionId}&question=${target.questionIndex}`)
  }

  function doneStudying() {
    navigate(finishedReport ? '/student/results' : '/student')
  }

  const params = new URLSearchParams(window.location.search)
  const queryQuestion = params.get('question')
  const tutorSessionId = tutorTarget?.sessionId ?? params.get('session')
  const tutorQuestionIndex =
    tutorTarget?.questionIndex ??
    (queryQuestion === null ? null : Number.parseInt(queryQuestion, 10))
  const hasTutorQuestion =
    tutorQuestionIndex !== null && Number.isFinite(tutorQuestionIndex)

  return (
    <div className="min-h-screen page-surface">
      {pathname === '/' && <Landing navigate={navigate} />}

      {pathname === '/teacher' && <TeacherHome navigate={navigate} />}
      {pathname === '/teacher/configure' && <TeacherConfigure navigate={navigate} />}
      {pathname === '/teacher/dashboard' && <TeacherDashboard navigate={navigate} />}
      {pathname === '/teacher/results' && <TeacherResults navigate={navigate} />}

      {pathname === '/student/results' && finishedReport && (
        <div className="mx-auto max-w-3xl px-6 py-10">
          <ExamReport
            report={finishedReport}
            onClose={exitExam}
            closeLabel="Return to foyer"
            allowDisputes
            onStudy={startStudy}
            onReportUpdated={setFinishedReport}
          />
        </div>
      )}

      {pathname.startsWith('/student') && pathname !== '/student/results' && !examSession && (
        <StudentSetup
          navigate={navigate}
          initialConfigId={new URLSearchParams(window.location.search).get('config')}
          onStarted={({ session }) => {
            setFinishedReport(null)
            setTutorTarget(null)
            setExamSession(session)
          }}
        />
      )}
      {pathname.startsWith('/student') && pathname !== '/student/results' && examSession && (
        <StudentExam
          session={examSession}
          totalQuestions={examSession.num_questions}
          onExit={exitExam}
          onFinished={setFinishedReport}
          onStudy={startStudy}
        />
      )}

      {pathname === '/tutor' && (
        <TutorPage
          sessionId={tutorSessionId}
          questionIndex={hasTutorQuestion ? tutorQuestionIndex : null}
          onDone={doneStudying}
        />
      )}

      {!['/', '/teacher', '/teacher/configure', '/teacher/dashboard', '/teacher/results', '/tutor', '/student/results'].includes(pathname) &&
        !pathname.startsWith('/student') && <Landing navigate={navigate} />}
    </div>
  )
}

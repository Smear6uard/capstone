import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

// ── API types ────────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard'

interface ExamConfig {
  config_id: string
  domain: string
  topics: string[]
  num_questions: number
  difficulty: Difficulty
  special_instructions: string
  created_at: string
}

interface StartExamResponse {
  session_id: string
  student_name: string
  domain: string
  difficulty: Difficulty
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
}

interface FinishExamResponse {
  session_id: string
  student_name: string
  domain: string
  difficulty: Difficulty
  num_questions: number
  questions: QuestionReport[]
  composite_score: number
  composite_feedback: string
  total_time_seconds: number
  completed_at: string
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
    setPath(next)
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

      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5">
        <button className="door rise delay-1" onClick={() => navigate('/teacher/configure')}>
          <span className="door-number">Draft</span>
          <span className="door-title">Configure an <span className="serif-italic">exam.</span></span>
          <p className="door-body">Set topic, difficulty, number of questions, and any instructions for the question-writer.</p>
        </button>
        <button className="door rise delay-2" onClick={() => navigate('/teacher/results')}>
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
  const [numQuestions, setNumQuestions] = useState<number>(3)
  const [topics, setTopics] = useState<string[]>([])
  const [topicDraft, setTopicDraft] = useState('')
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<ExamConfig | null>(null)

  function addTopic() {
    const t = topicDraft.trim()
    if (!t) return
    setTopics(prev => (prev.includes(t) ? prev : [...prev, t]))
    setTopicDraft('')
  }

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
                setTopics([])
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
              <label className="field-label" htmlFor="topic">Topics (optional)</label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  id="topic"
                  type="text"
                  value={topicDraft}
                  onChange={e => setTopicDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTopic()
                    }
                  }}
                  placeholder="e.g. Causes of war"
                  className="input-field"
                />
                <button type="button" className="btn-ghost" onClick={addTopic}>Add</button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {topics.map(t => (
                  <span key={t} className="chip">
                    {t}
                    <span
                      role="button"
                      className="chip-remove"
                      onClick={() => setTopics(prev => prev.filter(x => x !== t))}
                    >
                      ×
                    </span>
                  </span>
                ))}
                {topics.length === 0 && (
                  <span className="font-serif italic text-sm text-ink-soft">
                    No topics set — the examiner will choose distinct subtopics on its own.
                  </span>
                )}
              </div>
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
                  {c.domain} · {c.difficulty} · {c.num_questions}Q
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
}: {
  session: StartExamResponse
  totalQuestions: number
  onExit: () => void
}) {
  const [phase, setPhase] = useState<ExamPhase>({ kind: 'loading-question' })
  const [answeredCount, setAnsweredCount] = useState(0)

  const fetchNextQuestion = useCallback(async () => {
    setPhase({ kind: 'loading-question' })
    try {
      const q = await apiPost<GenerateQuestionResponse>('/api/generate-question', {
        session_id: session.session_id,
      })
      setPhase({ kind: 'writing', question: q })
    } catch (err) {
      setPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not generate the next question.',
        retryable: true,
      })
    }
  }, [session.session_id])

  useEffect(() => {
    fetchNextQuestion()
  }, [fetchNextQuestion])

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
    } catch (err) {
      setPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not finalize the exam.',
        retryable: false,
      })
    }
  }, [session.session_id])

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
            isLast={answeredCount >= totalQuestions}
            onNext={fetchNextQuestion}
            onFinish={handleFinish}
          />
        )}
        {phase.kind === 'finalizing' && (
          <LoadingPaper headline="Assembling your composite mark…" />
        )}
        {phase.kind === 'finished' && (
          <ExamReport report={phase.report} onClose={onExit} closeLabel="Return to foyer" />
        )}
        {phase.kind === 'error' && (
          <div className="paper paper-margin p-8 space-y-6">
            <ErrorBanner message={phase.message} />
            <div className="flex gap-3">
              {phase.retryable && (
                <button className="btn-primary" onClick={fetchNextQuestion}>
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
  isLast,
  onNext,
  onFinish,
}: {
  question: GenerateQuestionResponse
  grade: GradeAnswerResponse
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
        <div className="field-label">Examiner's remark</div>
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
}: {
  report: FinishExamResponse
  onClose: () => void
  closeLabel: string
}) {
  const totalMinutes = Math.round(report.total_time_seconds / 60)
  return (
    <div className="paper paper-margin p-8 md:p-12 rise space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <Stamp>Sealed &amp; Filed</Stamp>
            <span className="font-mono text-xs tracking-[0.22em] uppercase text-ink-soft">
              {new Date(report.completed_at).toLocaleString()}
            </span>
          </div>
          <h2 className="mt-4 font-display text-5xl md:text-6xl leading-[0.95]">
            Composite <span className="serif-italic">mark.</span>
          </h2>
          <p className="mt-2 font-serif italic text-ink-soft">
            {report.student_name} · {report.domain} · {report.difficulty}
          </p>
        </div>
        <div className="text-right">
          <div className="field-label">Final</div>
          <div className={'font-display text-[5.5rem] leading-none ' + scoreClass(report.composite_score)}>
            {report.composite_score}
          </div>
          <div className="font-mono text-xs tracking-[0.22em] uppercase text-ink-soft">
            out of 100
          </div>
        </div>
      </div>

      <ScoreBar score={report.composite_score} />

      <div>
        <div className="field-label">Examiner's composite feedback</div>
        <p className="mt-3 font-serif text-lg leading-relaxed whitespace-pre-line">
          {report.composite_feedback}
        </p>
      </div>

      <div>
        <div className="field-label">Question-by-question</div>
        <div className="mt-4 space-y-4">
          {report.questions.map((q, i) => (
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
                <div className={'font-display text-4xl shrink-0 ' + scoreClass(q.overall_score)}>
                  {q.overall_score}
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
            </div>
          ))}
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

  function exitExam() {
    setExamSession(null)
    navigate('/')
  }

  return (
    <div className="min-h-screen page-surface">
      {pathname === '/' && <Landing navigate={navigate} />}

      {pathname === '/teacher' && <TeacherHome navigate={navigate} />}
      {pathname === '/teacher/configure' && <TeacherConfigure navigate={navigate} />}
      {pathname === '/teacher/results' && <TeacherResults navigate={navigate} />}

      {pathname.startsWith('/student') && !examSession && (
        <StudentSetup
          navigate={navigate}
          initialConfigId={new URLSearchParams(window.location.search).get('config')}
          onStarted={({ session }) => setExamSession(session)}
        />
      )}
      {pathname.startsWith('/student') && examSession && (
        <StudentExam
          session={examSession}
          totalQuestions={examSession.num_questions}
          onExit={exitExam}
        />
      )}

      {!['/', '/teacher', '/teacher/configure', '/teacher/results'].includes(pathname) &&
        !pathname.startsWith('/student') && <Landing navigate={navigate} />}
    </div>
  )
}

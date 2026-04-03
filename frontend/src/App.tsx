import React, { useState, useEffect, useRef, useCallback } from 'react'

// ── API Types ────────────────────────────────────────────────────────────────

interface GenerateQuestionResponse {
  background_info: string
  question: string
  grading_rubric: string[]
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
}

// ── View State ───────────────────────────────────────────────────────────────

type View = 'setup' | 'question' | 'results'

// ── Timer Hook ───────────────────────────────────────────────────────────────

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

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const formatted = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  return { seconds, formatted, start, stop }
}

// ── Exam Setup ───────────────────────────────────────────────────────────────

function ExamSetup({ onStart }: {
  onStart: (data: GenerateQuestionResponse) => void
}) {
  const [domain, setDomain] = useState('')
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domain.trim(), difficulty }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail || `Server error (${res.status})`)
      }

      const data: GenerateQuestionResponse = await res.json()
      onStart(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Exam Setup</h1>

      <div>
        <label htmlFor="domain" className="block text-sm font-medium text-gray-700 mb-1">
          Domain
        </label>
        <input
          id="domain"
          type="text"
          required
          maxLength={200}
          value={domain}
          onChange={e => setDomain(e.target.value)}
          placeholder="e.g. World War II, Organic Chemistry"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
      </div>

      <div>
        <label htmlFor="difficulty" className="block text-sm font-medium text-gray-700 mb-1">
          Difficulty
        </label>
        <select
          id="difficulty"
          value={difficulty}
          onChange={e => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !domain.trim()}
        className="w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Generating...' : 'Generate Question'}
      </button>
    </form>
  )
}

// ── Question View ────────────────────────────────────────────────────────────

function QuestionView({ questionData, onSubmit }: {
  questionData: GenerateQuestionResponse
  onSubmit: (results: GradeAnswerResponse) => void
}) {
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { seconds, formatted, start, stop } = useTimer()

  useEffect(() => {
    start()
    return () => stop()
  }, [start, stop])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    stop()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/grade-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: questionData.question,
          grading_rubric: questionData.grading_rubric,
          background_info: questionData.background_info,
          student_answer: answer.trim(),
          time_spent_seconds: seconds,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail || `Server error (${res.status})`)
      }

      const data: GradeAnswerResponse = await res.json()
      onSubmit(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      start()
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Question</h1>
        <span className="font-mono text-sm text-gray-500">{formatted}</span>
      </div>

      <div className="rounded border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">Background</h2>
        <p className="text-sm text-gray-700 leading-relaxed">{questionData.background_info}</p>
      </div>

      <p className="text-base font-medium text-gray-900">{questionData.question}</p>

      <div>
        <label htmlFor="answer" className="block text-sm font-medium text-gray-700 mb-1">
          Your Answer
        </label>
        <textarea
          id="answer"
          required
          rows={10}
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          placeholder="Write your essay here..."
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-gray-400 resize-y"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !answer.trim()}
        className="w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Grading...' : 'Submit Answer'}
      </button>
    </form>
  )
}

// ── Results View ─────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-700'
  if (score >= 60) return 'text-yellow-700'
  return 'text-red-700'
}

function ResultsView({ results, onReset }: {
  results: GradeAnswerResponse
  onReset: () => void
}) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Results</h1>

      <div className="text-center py-6">
        <p className="text-sm text-gray-500 mb-1">Overall Score</p>
        <p className={`text-5xl font-bold ${scoreColor(results.overall_score)}`}>
          {results.overall_score}
          <span className="text-lg font-normal text-gray-400">/100</span>
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">Rubric Scores</h2>
        {results.criterion_scores.map((cs, i) => (
          <div key={i} className="rounded border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-4 mb-2">
              <p className="text-sm font-medium text-gray-900">{cs.criterion}</p>
              <span className={`text-sm font-semibold shrink-0 ${scoreColor(cs.score)}`}>
                {cs.score}/100
              </span>
            </div>
            <p className="text-sm text-gray-600">{cs.feedback}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-2">Grading Explanation</h2>
        <div className="rounded border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
            {results.grading_explanation}
          </p>
        </div>
      </div>

      <button
        onClick={onReset}
        className="w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Start New Exam
      </button>
    </div>
  )
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>('setup')
  const [questionData, setQuestionData] = useState<GenerateQuestionResponse | null>(null)
  const [results, setResults] = useState<GradeAnswerResponse | null>(null)

  function handleQuestionGenerated(data: GenerateQuestionResponse) {
    setQuestionData(data)
    setView('question')
  }

  function handleGraded(data: GradeAnswerResponse) {
    setResults(data)
    setView('results')
  }

  function handleReset() {
    setQuestionData(null)
    setResults(null)
    setView('setup')
  }

  return (
    <div className="min-h-screen bg-white px-4 py-12">
      {view === 'setup' && (
        <ExamSetup onStart={handleQuestionGenerated} />
      )}
      {view === 'question' && questionData && (
        <QuestionView questionData={questionData} onSubmit={handleGraded} />
      )}
      {view === 'results' && results && (
        <ResultsView results={results} onReset={handleReset} />
      )}
    </div>
  )
}

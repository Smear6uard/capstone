import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'

const startExamResponse = {
  session_id: 'test-session-1',
  student_name: 'Livia',
  domain: 'Roman History',
  difficulty: 'medium' as const,
  grade_level: 'High School' as const,
  grading_personality: 'Balanced' as const,
  teacher_name: 'Professor Elliott',
  num_questions: 1,
}

const generatedQuestion = {
  background_info: 'Students studied late Roman political instability.',
  question: 'Why did the Western Roman Empire fall?',
  grading_rubric: ['Explains multiple causes', 'Uses supporting evidence'],
  topic: 'Fall of Rome',
  question_index: 0,
  total_questions: 1,
}

const gradedAnswer = {
  criterion_scores: [
    {
      criterion: 'Explains multiple causes',
      score: 90,
      feedback: 'Mention administrative reforms under Diocletian.',
    },
    {
      criterion: 'Uses supporting evidence',
      score: 84,
      feedback: 'Cite at least one primary source for stronger support.',
    },
  ],
  overall_score: 87,
  grading_explanation: 'Solid coverage; add one primary source to push into A-range.',
  question_index: 0,
}

const finishedExam = {
  session_id: 'test-session-1',
  student_name: 'Livia',
  domain: 'Roman History',
  difficulty: 'medium' as const,
  grade_level: 'High School' as const,
  grading_personality: 'Balanced' as const,
  teacher_name: 'Professor Elliott',
  num_questions: 1,
  questions: [
    {
      question_index: 0,
      topic: 'Fall of Rome',
      question: 'Why did the Western Roman Empire fall?',
      background_info: 'Late-antique political instability.',
      grading_rubric: ['Explains multiple causes', 'Uses supporting evidence'],
      student_answer: 'The empire weakened because of leadership issues and invasions.',
      criterion_scores: gradedAnswer.criterion_scores,
      overall_score: 87,
      grading_explanation: gradedAnswer.grading_explanation,
      time_spent_seconds: 240,
      dispute_result: null,
    },
  ],
  composite_score: 88,
  composite_feedback: 'Composite: solid synthesis of political and military causes.',
  total_time_seconds: 240,
  completed_at: '2026-04-16T10:15:00.000Z',
}

const configuredExam = {
  config_id: 'config-1',
  domain: 'Roman History',
  topics: ['Pax Romana', 'Fall of Rome'],
  num_questions: 1,
  difficulty: 'medium' as const,
  grade_level: 'High School' as const,
  grading_personality: 'Strict' as const,
  teacher_name: 'Professor Elliott',
  special_instructions: 'Keep prompts essay-based.',
  created_at: '2026-04-16T10:00:00.000Z',
}

function mockFetchResponse(body: unknown, options?: { ok?: boolean; status?: number }) {
  return {
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

beforeEach(() => {
  window.history.pushState({}, '', '/')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('routes from the landing page to student setup and back to teacher lounge', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(screen.getByText(/begin the examination/i)).toBeInTheDocument()

    await user.click(screen.getByText(/begin the examination/i))
    expect(await screen.findByText(/sign the roll, pick an exam/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /back to foyer/i }))
    await user.click(screen.getByText(/enter the faculty lounge/i))
    expect(
      await screen.findByText(/author an examination for your students/i),
    ).toBeInTheDocument()
  })

  it('completes a student exam end-to-end, showing per-criterion feedback and composite', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/exam-configs') {
        return Promise.resolve(mockFetchResponse([]))
      }
      if (url === '/api/start-exam') {
        return Promise.resolve(mockFetchResponse(startExamResponse))
      }
      if (url === '/api/generate-question') {
        return Promise.resolve(mockFetchResponse(generatedQuestion))
      }
      if (url === '/api/grade-answer') {
        return Promise.resolve(mockFetchResponse(gradedAnswer))
      }
      if (url === '/api/finish-exam') {
        return Promise.resolve(mockFetchResponse(finishedExam))
      }
      return Promise.reject(new Error(`unexpected url ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    window.history.pushState({}, '', '/student')
    render(<App />)

    await screen.findByText(/sign the roll, pick an exam/i)

    await user.type(screen.getByLabelText(/your name/i), 'Livia')
    await user.type(screen.getByLabelText(/^domain$/i), 'Roman History')
    await user.click(screen.getByRole('button', { name: /begin the exam/i }))

    await screen.findByText(/western roman empire fall/i)
    await user.type(
      screen.getByLabelText(/your answer/i),
      'Leadership instability, economic decline, and invasions contributed.',
    )
    await user.click(screen.getByRole('button', { name: /submit for marking/i }))

    expect((await screen.findAllByText(/professor elliott's feedback/i)).length).toBeGreaterThan(0)
    // Per-criterion feedback visible
    expect(
      screen.getByText(/mention administrative reforms under diocletian/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/cite at least one primary source/i)).toBeInTheDocument()
    // Overall score visible
    expect(screen.getAllByText('87').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /finish exam/i }))

    await screen.findByText(/professor elliott's feedback · composite/i)
    expect(screen.getByText(/composite: solid synthesis/i)).toBeInTheDocument()
    expect(screen.getByText('88')).toBeInTheDocument()

    const startCall = fetchMock.mock.calls.find(c => c[0] === '/api/start-exam')
    expect(startCall).toBeTruthy()
    const startBody = JSON.parse((startCall![1] as RequestInit).body as string)
    expect(startBody).toMatchObject({
      domain: 'Roman History',
      student_name: 'Livia',
      num_questions: 3,
      difficulty: 'medium',
      grade_level: 'Undergraduate',
      grading_personality: 'Balanced',
      teacher_name: '',
    })

    const gradeCall = fetchMock.mock.calls.find(c => c[0] === '/api/grade-answer')
    const gradeBody = JSON.parse((gradeCall![1] as RequestInit).body as string)
    expect(gradeBody.session_id).toBe('test-session-1')
    expect(gradeBody.time_spent_seconds).toEqual(expect.any(Number))
    expect(gradeBody.time_spent_seconds).toBeGreaterThanOrEqual(0)
  })

  it('shows an error message when start-exam fails', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/exam-configs') return Promise.resolve(mockFetchResponse([]))
      if (url === '/api/start-exam') {
        return Promise.resolve(
          mockFetchResponse({ detail: 'Start-exam failed upstream.' }, { ok: false, status: 502 }),
        )
      }
      return Promise.reject(new Error(`unexpected url ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    window.history.pushState({}, '', '/student')
    render(<App />)

    await screen.findByText(/sign the roll, pick an exam/i)
    await user.type(screen.getByLabelText(/^domain$/i), 'Math')
    await user.click(screen.getByRole('button', { name: /begin the exam/i }))

    expect(await screen.findByText(/start-exam failed upstream/i)).toBeInTheDocument()
  })

  it('supports teacher topic config, student dispute, tutor launch, and analytics dashboard', async () => {
    const user = userEvent.setup()
    const lowGrade = {
      ...gradedAnswer,
      criterion_scores: gradedAnswer.criterion_scores.map(c => ({ ...c, score: 72 })),
      overall_score: 72,
      grading_explanation: "Professor Elliott's feedback: Good start; add evidence.",
    }
    const lowFinishedExam = {
      ...finishedExam,
      questions: [
        {
          ...finishedExam.questions[0],
          overall_score: 72,
          criterion_scores: lowGrade.criterion_scores,
          grading_explanation: lowGrade.grading_explanation,
        },
      ],
      composite_score: 72,
      composite_feedback: "Professor Elliott's feedback: Review the evidence chain.",
    }
    const disputeResult = {
      dispute_accepted: true,
      original_score: 72,
      revised_score: 78,
      reviewer_explanation: 'The answer included a relevant trade example.',
    }
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/configure-exam') {
        return Promise.resolve(mockFetchResponse(configuredExam))
      }
      if (url === '/api/exam-configs') {
        return Promise.resolve(mockFetchResponse([configuredExam]))
      }
      if (url === '/api/start-exam') {
        return Promise.resolve(mockFetchResponse({
          ...startExamResponse,
          num_questions: 1,
          grade_level: configuredExam.grade_level,
          grading_personality: configuredExam.grading_personality,
          teacher_name: configuredExam.teacher_name,
        }))
      }
      if (url === '/api/generate-question') {
        return Promise.resolve(mockFetchResponse(generatedQuestion))
      }
      if (url === '/api/grade-answer') {
        return Promise.resolve(mockFetchResponse(lowGrade))
      }
      if (url === '/api/finish-exam') {
        return Promise.resolve(mockFetchResponse(lowFinishedExam))
      }
      if (url === '/api/dispute-grade') {
        return Promise.resolve(mockFetchResponse(disputeResult))
      }
      if (url === '/api/tutor-session') {
        return Promise.resolve(mockFetchResponse({
          session_id: 'test-session-1',
          question_index: 0,
          messages: [
            {
              role: 'tutor',
              content: 'Let us break the topic into one simpler step.',
              created_at: '2026-04-16T10:20:00.000Z',
            },
          ],
        }))
      }
      if (url === '/api/exam-analytics') {
        return Promise.resolve(mockFetchResponse({
          completed_sessions: 1,
          overall_average_score: 75,
          average_time_per_question: 240,
          score_distribution: [
            { label: '0-59', min_score: 0, max_score: 59, count: 0 },
            { label: '60-69', min_score: 60, max_score: 69, count: 0 },
            { label: '70-79', min_score: 70, max_score: 79, count: 1 },
            { label: '80-89', min_score: 80, max_score: 89, count: 0 },
            { label: '90-100', min_score: 90, max_score: 100, count: 0 },
          ],
          per_question_average_scores: [
            {
              question_index: 0,
              attempts: 1,
              average_score: 78,
              average_time_seconds: 240,
              topics: ['Fall of Rome'],
            },
          ],
          most_disputed_questions: [
            {
              question_index: 0,
              topic: 'Fall of Rome',
              question: 'Why did the Western Roman Empire fall?',
              dispute_count: 1,
              accepted_disputes: 1,
              average_original_score: 72,
            },
          ],
          sessions: [
            {
              session_id: 'test-session-1',
              student_name: 'Livia',
              domain: 'Roman History',
              completed_at: '2026-04-16T10:15:00.000Z',
              num_questions: 1,
              composite_score: 75,
              dispute_count: 1,
            },
          ],
        }))
      }
      return Promise.reject(new Error(`unexpected url ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    window.history.pushState({}, '', '/teacher/configure')
    const { unmount } = render(<App />)

    await user.type(screen.getByLabelText(/^domain$/i), 'Roman History')
    await user.clear(screen.getByLabelText(/number of questions/i))
    await user.type(screen.getByLabelText(/number of questions/i), '1')
    await user.selectOptions(screen.getByLabelText(/grade level/i), 'High School')
    await user.selectOptions(screen.getByLabelText(/grading personality/i), 'Strict')
    await user.type(screen.getByLabelText(/teacher name/i), 'Professor Elliott')
    await user.type(screen.getByLabelText(/specific topics/i), 'Pax Romana\nFall of Rome')
    await user.click(screen.getByRole('button', { name: /file exam/i }))

    expect(await screen.findByText(/config №/i)).toBeInTheDocument()
    const configCall = fetchMock.mock.calls.find(c => c[0] === '/api/configure-exam')
    const configBody = JSON.parse((configCall![1] as RequestInit).body as string)
    expect(configBody).toMatchObject({
      topics: ['Pax Romana', 'Fall of Rome'],
      grade_level: 'High School',
      grading_personality: 'Strict',
      teacher_name: 'Professor Elliott',
    })

    await user.click(screen.getByRole('button', { name: /preview as student/i }))
    await screen.findByText(/sign the roll/i)
    await user.type(screen.getByLabelText(/your name/i), 'Livia')
    await user.click(screen.getByRole('button', { name: /begin the exam/i }))

    await screen.findByText(/western roman empire fall/i)
    await user.type(screen.getByLabelText(/your answer/i), 'Trade stability mattered.')
    await user.click(screen.getByRole('button', { name: /submit for marking/i }))
    expect((await screen.findAllByText(/professor elliott's feedback/i)).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /finish exam/i }))

    await screen.findByText(/question-by-question/i)
    await user.click(screen.getByRole('button', { name: /dispute grade/i }))
    await user.type(
      screen.getByLabelText(/student dispute argument/i),
      'The answer included a relevant trade example.',
    )
    await user.click(screen.getByRole('button', { name: /submit dispute/i }))
    expect(await screen.findByText(/dispute accepted/i)).toBeInTheDocument()
    expect(screen.getByText(/revised score: 78/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /study this/i }))
    expect(await screen.findByText(/study hall/i)).toBeInTheDocument()
    expect(screen.getByText(/break the topic into one simpler step/i)).toBeInTheDocument()

    unmount()
    window.history.pushState({}, '', '/teacher/dashboard')
    render(<App />)

    expect(await screen.findByText(/overall average/i)).toBeInTheDocument()
    expect(screen.getByText(/most disputed questions/i)).toBeInTheDocument()
    expect(screen.getByText(/livia/i)).toBeInTheDocument()
  })
})

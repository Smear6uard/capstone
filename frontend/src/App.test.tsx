import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'

const startExamResponse = {
  session_id: 'test-session-1',
  student_name: 'Livia',
  domain: 'Roman History',
  difficulty: 'medium' as const,
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
    },
  ],
  composite_score: 88,
  composite_feedback: 'Composite: solid synthesis of political and military causes.',
  total_time_seconds: 240,
  completed_at: '2026-04-16T10:15:00.000Z',
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

    await screen.findByText(/examiner's remark/i)
    // Per-criterion feedback visible
    expect(
      screen.getByText(/mention administrative reforms under diocletian/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/cite at least one primary source/i)).toBeInTheDocument()
    // Overall score visible
    expect(screen.getAllByText('87').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /finish exam/i }))

    await screen.findByText(/examiner's composite feedback/i)
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
})

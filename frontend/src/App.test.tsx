import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

const generatedQuestion = {
  background_info: 'Students studied late Roman political instability.',
  question: 'Why did the Western Roman Empire fall?',
  grading_rubric: ['Explains multiple causes', 'Uses supporting evidence'],
}

const gradedAnswer = {
  criterion_scores: [
    {
      criterion: 'Explains multiple causes',
      score: 90,
      feedback: 'The answer covers political, economic, and military pressures.',
    },
    {
      criterion: 'Uses supporting evidence',
      score: 84,
      feedback: 'The answer references invasions and leadership instability.',
    },
  ],
  overall_score: 87,
  grading_explanation: 'The response addresses the major causes and supports them clearly.',
}

function mockFetchResponse(body: unknown, options?: { ok?: boolean; status?: number }) {
  return {
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('completes the generate-question and grade-answer flow', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockFetchResponse(generatedQuestion))
      .mockResolvedValueOnce(mockFetchResponse(gradedAnswer))

    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(screen.getByLabelText(/domain/i), '  Roman History  ')
    await user.selectOptions(screen.getByLabelText(/difficulty/i), 'hard')
    await user.click(screen.getByRole('button', { name: /generate question/i }))

    await screen.findByText(/western roman empire fall/i)

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/generate-question',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: 'Roman History', difficulty: 'hard' }),
      }),
    )

    await user.type(
      screen.getByLabelText(/your answer/i),
      'Leadership instability, economic decline, and invasions all contributed.',
    )
    await user.click(screen.getByRole('button', { name: /submit answer/i }))

    await screen.findByText(/overall score/i)
    await screen.findByText(/87/i)

    const gradeCall = fetchMock.mock.calls[1]
    const gradeRequest = JSON.parse(gradeCall[1]?.body as string)

    expect(gradeCall[0]).toBe('/api/grade-answer')
    expect(gradeRequest).toMatchObject({
      question: generatedQuestion.question,
      grading_rubric: generatedQuestion.grading_rubric,
      background_info: generatedQuestion.background_info,
      student_answer:
        'Leadership instability, economic decline, and invasions all contributed.',
    })
    expect(gradeRequest.time_spent_seconds).toEqual(expect.any(Number))
    expect(gradeRequest.time_spent_seconds).toBeGreaterThanOrEqual(0)

    await user.click(screen.getByRole('button', { name: /start new exam/i }))

    expect(screen.getByRole('button', { name: /generate question/i })).toBeInTheDocument()
  })

  it('shows the generate-question API error message', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockFetchResponse(
          { detail: 'Question generation failed upstream.' },
          { ok: false, status: 502 },
        ),
      )

    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(screen.getByLabelText(/domain/i), 'Organic Chemistry')
    await user.click(screen.getByRole('button', { name: /generate question/i }))

    expect(await screen.findByText(/question generation failed upstream/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate question/i })).toBeEnabled()
  })

  it('keeps the user on the question screen when grading fails', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockFetchResponse(generatedQuestion))
      .mockResolvedValueOnce(
        mockFetchResponse({ detail: 'Grading failed upstream.' }, { ok: false, status: 502 }),
      )

    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.type(screen.getByLabelText(/domain/i), 'Roman History')
    await user.click(screen.getByRole('button', { name: /generate question/i }))
    await screen.findByText(/western roman empire fall/i)

    await user.type(
      screen.getByLabelText(/your answer/i),
      'The empire weakened because of leadership issues and invasions.',
    )
    await user.click(screen.getByRole('button', { name: /submit answer/i }))

    expect(await screen.findByText(/grading failed upstream/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /question/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submit answer/i })).toBeEnabled()
    })
  })
})

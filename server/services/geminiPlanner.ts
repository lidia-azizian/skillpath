import { GoogleGenAI } from '@google/genai'
import { learningPlanSchema, type LearningPlan, type LearningPlanRequest } from '../schemas/learningPlan.ts'

export class GeminiProviderError extends Error {
  constructor(
    readonly httpStatus: number | undefined,
    readonly providerCode: string | number | undefined,
  ) {
    super('Gemini provider request failed')
    this.name = 'GeminiProviderError'
  }
}

export class GeminiResponseError extends Error {
  constructor(readonly kind: 'empty' | 'invalid-json') {
    super(`Gemini response was ${kind === 'empty' ? 'empty' : 'invalid JSON'}`)
    this.name = 'GeminiResponseError'
  }
}

export function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server')
  }
  return new GoogleGenAI({ apiKey })
}

export function buildLearningPlanInstruction(input: LearningPlanRequest) {
  return [
    'Create a practical learning plan as JSON matching the requested response schema.',
    'Do not invent credentials, guarantees, or unsafe instructions.',
    'Respect the learner context and available practice time.',
    'Return only JSON. Include milestones, tasks, practice sessions and review guidance.',
    `Skill: ${input.skill}`,
    `Experience: ${input.experience}`,
    `Goal: ${input.goal}`,
    `Practice time: ${input.practiceTime}`,
    `Preferences: ${input.preferences || 'None provided'}`,
  ].join('\n')
}

const learningPlanResponseSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    overview: { type: 'string' },
    assumptions: { type: 'array', items: { type: 'string' } },
    milestones: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                estimatedMinutes: { type: 'integer' },
              },
              required: ['id', 'title', 'description', 'estimatedMinutes'],
            },
          },
        },
        required: ['id', 'title', 'description', 'tasks'],
      },
    },
    practiceSessions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          dayLabel: { type: 'string' },
          durationMinutes: { type: 'integer' },
          activity: { type: 'string' },
        },
        required: ['id', 'dayLabel', 'durationMinutes', 'activity'],
      },
    },
    reviewGuidance: { type: 'string' },
  },
  required: ['title', 'overview', 'assumptions', 'milestones', 'practiceSessions', 'reviewGuidance'],
}

export async function generateLearningPlan(input: LearningPlanRequest): Promise<LearningPlan> {
  const client = getGeminiClient()
  let response
  try {
    response = await client.models.generateContent({
      model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
      contents: buildLearningPlanInstruction(input),
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: learningPlanResponseSchema,
        temperature: 0.4,
      },
    })
  } catch (error) {
    const providerError = error as { status?: unknown; error?: { code?: unknown } }
    const nestedCode = providerError.error?.code
    throw new GeminiProviderError(
      typeof providerError.status === 'number' ? providerError.status : undefined,
      typeof nestedCode === 'string' || typeof nestedCode === 'number' ? nestedCode : undefined,
    )
  }

  const text = response.text
  if (!text) {
    throw new GeminiResponseError('empty')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new GeminiResponseError('invalid-json')
  }

  return learningPlanSchema.parse(parsed)
}

import { getGeminiClient, GeminiProviderError, GeminiResponseError } from './geminiPlanner.ts'
import { learningReflectionSchema, practiceConsistencyArgsSchema, practiceConsistencyResultSchema, type LearningReflection, type LearningReflectionRequest, type PracticeConsistencyResult } from '../schemas/learningReflection.ts'

const answerResponseSchema = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
  },
  required: ['answer'],
}

const practiceConsistencyDeclaration = {
  name: 'calculate_practice_consistency',
  description: 'Calculate consistency from actual journal records for the selected learning path. Use only for questions about practice frequency, consistency, regularity, or practice patterns.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      pathId: { type: 'string', description: 'The selected learning path ID.' },
      includeFrequency: { type: 'boolean', description: 'Include recorded sessions per week over the observed date range.' },
    },
    required: ['pathId'],
  },
}

export function sanitizeReflectionInput(input: LearningReflectionRequest): LearningReflectionRequest {
  const selectedEntries = input.context.journalEntries.filter((entry) => entry.pathId === input.context.pathId)
  const boundedMinutes = selectedEntries.reduce((total, entry) => total + (entry.durationMinutes > 0 ? entry.durationMinutes : 0), 0)
  return {
    ...input,
    context: {
      ...input.context,
      actualPracticeMinutes: boundedMinutes,
      journalEntries: selectedEntries,
    },
  }
}

function buildInstruction(input: LearningReflectionRequest) {
  return [
    'Act as a read-only reflection coach for a personal learning journal.',
    'Use only the supplied records. Never invent activities, mastery, progress, achievements or difficulties.',
    'Answer the user directly in one natural conversational response of 2-3 short sentences and ideally under 60 words.',
    'Mention only relevant recorded facts, avoid repeating metrics, and include at most one practical suggestion when appropriate.',
    'Do not add headings, bullet lists, automatic reflection questions, or a separate limitations section.',
    'When evidence is insufficient, acknowledge that naturally in the answer. Do not infer difficulties unless explicitly recorded.',
    'Do not propose changing saved data directly. If no tool is needed, return only JSON with an answer string. If a tool is used, use its result for numeric claims.',
    `Question: ${input.question}`,
    `Selected path: ${input.context.pathTitle}`,
    `Selected path ID: ${input.context.pathId}`,
    `Goal: ${input.context.goal ?? 'No goal recorded'}`,
    `Completed tasks: ${input.context.completedTasks.join(' | ') || 'None recorded'}`,
    `Remaining tasks: ${input.context.remainingTasks.join(' | ') || 'None recorded'}`,
    `Actual recorded practice minutes in the selected context: ${input.context.actualPracticeMinutes}`,
    `The journal context includes ${input.context.journalEntries.length} of the most recent ${input.context.journalEntriesTruncated ? 'more than 30' : input.context.journalEntries.length} selected-path records; never call this all-time unless the context is not truncated.`,
    `Journal entries: ${JSON.stringify(input.context.journalEntries)}`,
  ].join('\n')
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function calculatePracticeConsistency(input: LearningReflectionRequest, args: unknown): PracticeConsistencyResult {
  const parsedArgs = practiceConsistencyArgsSchema.parse(args)
  if (parsedArgs.pathId !== input.context.pathId) throw new Error('Tool path ID does not match the selected path.')
  const records = input.context.journalEntries.filter((entry) => entry.pathId === input.context.pathId && entry.durationMinutes > 0 && isIsoDate(entry.date))
  const dates = [...new Set(records.map((entry) => entry.date))].sort()
  const result = {
    totalPracticeMinutes: records.reduce((total, entry) => total + entry.durationMinutes, 0),
    distinctPracticeDays: dates.length,
    actualPracticeSessions: records.length,
    dateRange: { start: dates[0] ?? null, end: dates[dates.length - 1] ?? null },
    period: {
      label: input.context.journalEntriesTruncated ? 'Most recent 30 selected-path journal records' : 'All supplied selected-path journal records',
      recordsIncluded: records.length,
      recordsAvailable: input.context.journalEntries.length,
      truncated: input.context.journalEntriesTruncated,
    },
    frequency: null as PracticeConsistencyResult['frequency'],
  }
  if (parsedArgs.includeFrequency && dates.length > 1) {
    const observedCalendarDays = Math.max(1, Math.round((Date.parse(`${dates[dates.length - 1]}T00:00:00Z`) - Date.parse(`${dates[0]}T00:00:00Z`)) / 86400000) + 1)
    result.frequency = { recordedSessionsPerWeek: Number((records.length / observedCalendarDays * 7).toFixed(2)), observedCalendarDays }
  }
  return practiceConsistencyResultSchema.parse(result)
}

function parseAnswer(text: string | undefined): LearningReflection {
  if (!text) throw new GeminiResponseError('empty')
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new GeminiResponseError('invalid-json') }
  return learningReflectionSchema.parse(parsed)
}

export async function generateLearningReflection(input: LearningReflectionRequest): Promise<{ reflection: LearningReflection; toolRan: boolean }> {
  const safeInput = sanitizeReflectionInput(input)
  const client = getGeminiClient()
  let response
  try {
    response = await client.models.generateContent({
      model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
      contents: buildInstruction(safeInput),
      config: { tools: [{ functionDeclarations: [practiceConsistencyDeclaration] }], temperature: 0.2 },
    })
  } catch (error) {
    const providerError = error as { status?: unknown; error?: { code?: unknown } }
    const nestedCode = providerError.error?.code
    throw new GeminiProviderError(
      typeof providerError.status === 'number' ? providerError.status : undefined,
      typeof nestedCode === 'string' || typeof nestedCode === 'number' ? nestedCode : undefined,
    )
  }
  const functionCalls = response.functionCalls ?? []
  if (functionCalls.length === 0) return { reflection: parseAnswer(response.text), toolRan: false }
  if (functionCalls.length !== 1 || functionCalls[0].name !== practiceConsistencyDeclaration.name || !response.candidates?.[0]?.content) {
    throw new GeminiResponseError('invalid-json')
  }
  const functionCall = functionCalls[0]
  const result = calculatePracticeConsistency(safeInput, functionCall.args ?? {})
  const finalResponse = await client.models.generateContent({
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    contents: [
      { role: 'user', parts: [{ text: buildInstruction(safeInput) }] },
      response.candidates[0].content,
      {
        role: 'user',
        parts: [{
          functionResponse: {
            id: functionCall.id,
            name: practiceConsistencyDeclaration.name,
            response: { output: result },
          },
        }],
      },
    ],
    config: { responseMimeType: 'application/json', responseJsonSchema: answerResponseSchema, temperature: 0.2 },
  })
  return { reflection: parseAnswer(finalResponse.text), toolRan: true }
}

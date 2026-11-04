import { z } from 'zod'

const text = z.string().trim().max(2000)

export const learningReflectionRequestSchema = z.object({
  question: z.string().trim().min(1).max(500),
  context: z.object({
    pathId: z.string().trim().min(1).max(200),
    pathTitle: z.string().trim().min(1).max(200),
    goal: z.string().trim().max(1000).nullable(),
    completedTasks: z.array(z.string().trim().min(1).max(200)).max(100),
    remainingTasks: z.array(z.string().trim().min(1).max(200)).max(100),
    actualPracticeMinutes: z.number().int().min(0).max(100000),
    journalEntriesTruncated: z.boolean(),
    journalEntries: z.array(z.object({
      id: z.string().trim().min(1).max(200),
      pathId: z.string().trim().min(1).max(200),
      date: z.string().trim().max(40),
      type: z.enum(['lesson', 'independent', 'reflection']),
      durationMinutes: z.number().int().min(0).max(1440),
      notes: text,
      achievements: text,
      difficulties: text,
    })).max(100),
  }).superRefine((context, ctx) => {
    if (context.journalEntries.some((entry) => entry.pathId !== context.pathId)) {
      ctx.addIssue({ code: 'custom', path: ['journalEntries'], message: 'Journal entries must belong to the selected path.' })
    }
  }),
})

export const learningReflectionSchema = z.object({
  answer: z.string().trim().min(1).max(600),
})

export const practiceConsistencyArgsSchema = z.object({
  pathId: z.string().trim().min(1).max(200),
  includeFrequency: z.boolean().optional().default(false),
})

export const practiceConsistencyResultSchema = z.object({
  totalPracticeMinutes: z.number().int().min(0),
  distinctPracticeDays: z.number().int().min(0),
  actualPracticeSessions: z.number().int().min(0),
  dateRange: z.object({ start: z.string().nullable(), end: z.string().nullable() }),
  period: z.object({
    label: z.string().min(1),
    recordsIncluded: z.number().int().min(0),
    recordsAvailable: z.number().int().min(0),
    truncated: z.boolean(),
  }),
  frequency: z.object({
    recordedSessionsPerWeek: z.number().nonnegative(),
    observedCalendarDays: z.number().int().min(1),
  }).nullable(),
})

export type LearningReflectionRequest = z.infer<typeof learningReflectionRequestSchema>
export type LearningReflection = z.infer<typeof learningReflectionSchema>
export type PracticeConsistencyArgs = z.infer<typeof practiceConsistencyArgsSchema>
export type PracticeConsistencyResult = z.infer<typeof practiceConsistencyResultSchema>

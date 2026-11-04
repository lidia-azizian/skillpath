import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)

export const learningPlanRequestSchema = z.object({
  skill: nonEmptyString.max(100),
  experience: nonEmptyString.max(100),
  goal: nonEmptyString.max(1000),
  practiceTime: nonEmptyString.max(200),
  preferences: z.string().trim().max(1000).default(''),
})

const taskSchema = z.object({
  id: nonEmptyString,
  title: nonEmptyString,
  description: nonEmptyString,
  estimatedMinutes: z.number().int().positive().max(1440),
})

const milestoneSchema = z.object({
  id: nonEmptyString,
  title: nonEmptyString,
  description: nonEmptyString,
  tasks: z.array(taskSchema).min(1).max(20),
})

const practiceSessionSchema = z.object({
  id: nonEmptyString,
  dayLabel: nonEmptyString,
  durationMinutes: z.number().int().positive().max(1440),
  activity: nonEmptyString,
})

export const learningPlanSchema = z.object({
  title: nonEmptyString.max(200),
  overview: nonEmptyString.max(3000),
  assumptions: z.array(nonEmptyString.max(500)).max(10),
  milestones: z.array(milestoneSchema).min(1).max(10),
  practiceSessions: z.array(practiceSessionSchema).min(1).max(42),
  reviewGuidance: nonEmptyString.max(2000),
})

export type LearningPlanRequest = z.infer<typeof learningPlanRequestSchema>
export type LearningPlan = z.infer<typeof learningPlanSchema>

import { z } from 'zod'

const id = z.string().trim().min(1).max(300)
const text = z.string().max(5000)
const date = z.string().trim().min(1).max(80)

export function isSafeResourceUrl(value: string) {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname)
  } catch {
    return false
  }
}

export function normalizeDisplayName(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 60) : 'Learner'
}

export function normalizeSkillCategory(value: unknown) {
  const category = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!category) return 'Personal'
  if (/^(fitness|movement|movement & sports)$/i.test(category)) return 'Movement & Sports'
  return category
}

export function detachSkillFromPaths<T extends { skillId?: string; updatedAt?: string }>(paths: T[], skillId: string, updatedAt: string) {
  return paths.map((path) => path.skillId === skillId ? { ...path, skillId: undefined, updatedAt } : path)
}

export function getTimeGreeting(date = new Date()) {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export type PracticePeriod = 'day' | 'week' | 'month' | 'all'

export function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getPracticePeriodBounds(period: PracticePeriod, now = new Date()) {
  if (period === 'all') return { start: null, end: null }
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'week') {
    const mondayOffset = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - mondayOffset)
  } else if (period === 'month') {
    start.setDate(1)
  }
  const end = new Date(start)
  if (period === 'day') end.setDate(end.getDate() + 1)
  if (period === 'week') end.setDate(end.getDate() + 7)
  if (period === 'month') end.setMonth(end.getMonth() + 1)
  return { start: localDateKey(start), end: localDateKey(end) }
}

export function isPracticeDateInPeriod(date: string, period: PracticePeriod, now = new Date()) {
  const bounds = getPracticePeriodBounds(period, now)
  return bounds.start === null || (date >= bounds.start && date < bounds.end!)
}

const resourceSchema = z.object({
  id: id.optional(),
  label: z.string().trim().min(1).max(500),
  type: z.string().trim().min(1).max(100),
  url: z.string().trim().max(2000).optional().refine((value) => !value || isSafeResourceUrl(value), 'Resource URLs must use http:// or https://.'),
  notes: text.optional(),
}).passthrough()

const practiceSessionSchema = z.object({
  id,
  date,
  durationMinutes: z.number().int().min(0).max(1440),
  notes: text,
  taskId: id.nullable().optional().default(null),
}).passthrough()

const taskSchema = z.object({
  id,
  title: z.string().trim().min(1).max(500),
  description: text.optional(),
  estimatedMinutes: z.number().int().min(0).max(1440).optional(),
  completed: z.boolean(),
  completedAt: date.nullable().optional().default(null),
}).passthrough()

const milestoneSchema = z.object({
  id,
  title: z.string().trim().min(1).max(500),
  description: text,
  tasks: z.array(taskSchema).max(100),
}).passthrough()

const goalSchema = z.object({
  id,
  title: z.string().trim().min(1).max(1000),
  description: text,
  targetDate: date.nullable(),
}).passthrough()

const learningPathSchema = z.object({
  id,
  title: z.string().trim().min(1).max(500),
  description: text,
  category: z.string().trim().min(1).max(200),
  color: z.string().trim().min(1).max(100),
  icon: text,
  visibility: z.enum(['private', 'public']).default('private'),
  skillId: id.optional(),
  goal: goalSchema.nullable().default(null),
  milestones: z.array(milestoneSchema).max(100),
  practiceSessions: z.array(practiceSessionSchema).default([]),
  suggestedPracticeSessions: z.array(practiceSessionSchema).optional(),
  actualPracticeSessions: z.array(practiceSessionSchema).optional(),
  createdAt: date,
  updatedAt: date,
  assumptions: z.array(text).max(50).optional(),
  reviewGuidance: text.optional(),
  resources: z.array(resourceSchema).optional(),
}).passthrough()

const journalEntrySchema = z.object({
  id,
  pathId: id.nullable(),
  date,
  type: z.enum(['lesson', 'independent', 'reflection']),
  durationMinutes: z.number().int().min(0).max(1440),
  notes: text,
  achievements: text,
  difficulties: text,
  createdAt: date,
  updatedAt: date,
  taskId: id.nullable().optional().default(null),
  migratedFrom: id.optional(),
}).passthrough()

const customSkillSchema = z.object({
  id,
  title: z.string().trim().min(1).max(500),
  category: z.string().trim().min(1).max(200),
  summary: text,
  color: z.string().trim().min(1).max(100),
  equipment: text,
  roadmap: z.array(text).max(100),
  milestones: z.array(text).max(100),
  tags: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
  visual: text.optional(),
  icon: z.string().trim().max(40).optional(),
  isCustom: z.boolean().optional(),
  resources: z.array(resourceSchema).max(100),
}).passthrough()

const preferencesSchema = z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])).default({})
const deletedPracticeSessionsSchema = z.record(z.string(), z.array(id)).default({})

export const backupSchema = z.object({
  format: z.literal('skillpath-backup'),
  version: z.literal(1),
  createdAt: date,
  data: z.object({
    learningPaths: z.array(learningPathSchema),
    practiceJournal: z.array(journalEntrySchema),
    customSkills: z.array(customSkillSchema),
    skillResources: z.record(z.string(), z.array(resourceSchema)),
    pathResources: z.record(z.string(), z.array(resourceSchema)),
    preferences: preferencesSchema,
    deletedPracticeSessions: deletedPracticeSessionsSchema.optional().default({}),
  }).passthrough(),
}).passthrough()

export type ParsedBackup = z.infer<typeof backupSchema>

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type StorageRead<T> = { value: T; status: 'missing' | 'valid' | 'malformed'; raw: string | null; error?: string }

export function readJsonStorage<T>(storage: StorageLike, key: string, schema: z.ZodType<T>, fallback: T): StorageRead<T> {
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return { value: fallback, status: 'malformed', raw: null, error: 'browser storage is unreadable' }
  }
  if (raw === null) return { value: fallback, status: 'missing', raw }
  try {
    const parsed: unknown = JSON.parse(raw)
    const result = schema.safeParse(parsed)
    return result.success
      ? { value: result.data, status: 'valid', raw }
      : { value: fallback, status: 'malformed', raw, error: result.error.issues.map((issue) => issue.path.join('.') || '<root>').slice(0, 3).join(', ') }
  } catch {
    return { value: fallback, status: 'malformed', raw, error: 'invalid JSON' }
  }
}

export function writeJsonBatch(storage: StorageLike, values: Record<string, unknown>): { ok: boolean; rollbackFailed: boolean; error?: string } {
  const previous = new Map<string, string | null>()
  try {
    Object.keys(values).forEach((key) => previous.set(key, storage.getItem(key)))
    Object.entries(values).forEach(([key, value]) => storage.setItem(key, JSON.stringify(value)))
    return { ok: true, rollbackFailed: false }
  } catch (error) {
    let rollbackFailed = false
    try {
      previous.forEach((value, key) => value === null ? storage.removeItem(key) : storage.setItem(key, value))
    } catch {
      rollbackFailed = true
    }
    return { ok: false, rollbackFailed, error: error instanceof Error ? error.message : 'Storage write failed.' }
  }
}

export function journalRecordsRepresentSameSession(first: { id: string; pathId: string | null; migratedFrom?: string }, second: { id: string; pathId: string | null; migratedFrom?: string }) {
  if (!first.pathId || first.pathId !== second.pathId) return false
  if (first.id === second.id) return true
  if (first.migratedFrom && (first.migratedFrom === second.id || first.migratedFrom === second.migratedFrom)) return true
  if (second.migratedFrom && second.migratedFrom === first.id) return true
  return first.id === `migrated-${first.pathId}-${(second.migratedFrom ?? second.id)}`
    || second.id === `migrated-${second.pathId}-${(first.migratedFrom ?? first.id)}`
}

export type DeletedPracticeSessions = Record<string, string[]>

export function practiceSessionIdentity(entry: { id: string; migratedFrom?: string }) {
  return entry.migratedFrom ?? entry.id
}

export function markPracticeSessionDeleted(deleted: DeletedPracticeSessions, pathId: string | null, entry: { id: string; migratedFrom?: string }) {
  if (!pathId) return deleted
  const identities = new Set(deleted[pathId] ?? [])
  identities.add(practiceSessionIdentity(entry))
  return { ...deleted, [pathId]: [...identities] }
}

function isPracticeSessionDeleted(deleted: DeletedPracticeSessions, pathId: string, sessionId: string) {
  return (deleted[pathId] ?? []).includes(sessionId)
}

type LegacyPracticeRecord = {
  id: string
  date: string
  durationMinutes: number
  notes: string
  taskId?: string | null
}

type JournalPracticeRecord = LegacyPracticeRecord & {
  pathId: string | null
  type: 'lesson' | 'independent' | 'reflection'
  achievements: string
  difficulties: string
  createdAt: string
  updatedAt: string
  migratedFrom?: string
}

type PathWithPracticeRecords = {
  id: string
  actualPracticeSessions?: LegacyPracticeRecord[]
}

export function synchronizeLegacyPracticeSessions<TPath extends PathWithPracticeRecords, TJournal extends JournalPracticeRecord>(
  paths: TPath[],
  journal: TJournal[],
  now = new Date().toISOString(),
  deleted: DeletedPracticeSessions = {},
) {
  const nextJournal = journal.filter((entry) => (
    entry.pathId === null
      || !(isPracticeSessionDeleted(deleted, entry.pathId, entry.id)
        || (entry.migratedFrom !== undefined && isPracticeSessionDeleted(deleted, entry.pathId, entry.migratedFrom)))
  ))
  let migratedCount = 0

  paths.forEach((path) => {
    ;(path.actualPracticeSessions ?? []).forEach((session) => {
      if (isPracticeSessionDeleted(deleted, path.id, session.id)) return
      if (nextJournal.some((entry) => journalRecordsRepresentSameSession(entry, {
        id: session.id,
        pathId: path.id,
        migratedFrom: undefined,
      }))) return
      nextJournal.push({
        id: `migrated-${path.id}-${session.id}`,
        pathId: path.id,
        date: session.date,
        type: 'independent',
        durationMinutes: session.durationMinutes,
        notes: session.notes,
        taskId: session.taskId ?? null,
        achievements: '',
        difficulties: '',
        createdAt: now,
        updatedAt: now,
        migratedFrom: session.id,
      } as TJournal)
      migratedCount += 1
    })
  })

  const nextPaths = paths.map((path) => {
    const seen = new Set<string>()
    const actualPracticeSessions = nextJournal
      .filter((entry) => entry.pathId === path.id)
      .filter((entry) => {
        const identity = entry.migratedFrom ?? entry.id
        if (seen.has(identity)) return false
        seen.add(identity)
        return true
      })
      .map((entry) => ({
        id: entry.migratedFrom ?? entry.id,
        date: entry.date,
        durationMinutes: entry.durationMinutes,
        notes: entry.notes,
        taskId: entry.taskId ?? (path.actualPracticeSessions ?? []).find((session) => journalRecordsRepresentSameSession(entry, {
          id: session.id,
          pathId: path.id,
          migratedFrom: undefined,
        }))?.taskId ?? null,
      }))
    return { ...path, actualPracticeSessions }
  })

  return { paths: nextPaths, journal: nextJournal, migratedCount }
}

export function removePathResources<T>(resources: Record<string, T[]>, pathId: string) {
  const next = { ...resources }
  delete next[pathId]
  return next
}

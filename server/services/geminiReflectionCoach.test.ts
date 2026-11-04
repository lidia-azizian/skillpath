import assert from 'node:assert/strict'
import test from 'node:test'
import { calculatePracticeConsistency, sanitizeReflectionInput } from './geminiReflectionCoach.ts'
import type { LearningReflectionRequest } from '../schemas/learningReflection.ts'

const request: LearningReflectionRequest = {
  question: 'How consistent has my practice been?',
  context: {
    pathId: 'path-pilates',
    pathTitle: 'Pilates',
    goal: null,
    completedTasks: [],
    remainingTasks: [],
    actualPracticeMinutes: 999,
    journalEntriesTruncated: false,
    journalEntries: [
      { id: 'knitting-session', pathId: 'path-knitting', date: '2026-11-01', type: 'independent', durationMinutes: 10, notes: 'Row counting', achievements: '', difficulties: '' },
      { id: 'pilates-reflection', pathId: 'path-pilates', date: '2026-11-02', type: 'reflection', durationMinutes: 0, notes: 'Considered next steps', achievements: '', difficulties: '' },
    ],
  },
}

test('sanitizes reflection context and calculates only selected-path practice', () => {
  const safeInput = sanitizeReflectionInput(request)
  assert.deepEqual(safeInput.context.journalEntries.map((entry) => entry.id), ['pilates-reflection'])
  assert.equal(safeInput.context.actualPracticeMinutes, 0)

  const result = calculatePracticeConsistency(safeInput, { pathId: 'path-pilates', includeFrequency: true })
  assert.deepEqual(result, {
    totalPracticeMinutes: 0,
    distinctPracticeDays: 0,
    actualPracticeSessions: 0,
    dateRange: { start: null, end: null },
    period: {
      label: 'All supplied selected-path journal records',
      recordsIncluded: 0,
      recordsAvailable: 1,
      truncated: false,
    },
    frequency: null,
  })
})

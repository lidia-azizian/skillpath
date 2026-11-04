import assert from 'node:assert/strict'
import test from 'node:test'
import { backupSchema, detachSkillFromPaths, getPracticePeriodBounds, getTimeGreeting, isPracticeDateInPeriod, isSafeResourceUrl, journalRecordsRepresentSameSession, markPracticeSessionDeleted, normalizeDisplayName, normalizeSkillCategory, readJsonStorage, removePathResources, synchronizeLegacyPracticeSessions, writeJsonBatch } from '../../src/dataIntegrity.ts'

class FakeStorage {
  private values = new Map<string, string>()
  failWrites = false
  failNextWrite = false
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) {
    if (this.failWrites || this.failNextWrite) {
      this.failNextWrite = false
      throw new Error('quota exceeded')
    }
    this.values.set(key, value)
  }
  removeItem(key: string) { this.values.delete(key) }
}

const validPath = {
  id: 'path-one', title: 'Piano', description: '', category: 'Music', color: 'sage', icon: '✦',
  visibility: 'private', goal: null, milestones: [], practiceSessions: [], createdAt: '2026-11-01', updatedAt: '2026-11-01',
}

const validBackup = {
  format: 'skillpath-backup' as const, version: 1 as const, createdAt: '2026-11-01T00:00:00.000Z',
  data: { learningPaths: [validPath], practiceJournal: [], customSkills: [], skillResources: {}, pathResources: {}, preferences: {} },
}

test('distinguishes missing and malformed storage without overwriting raw values', () => {
  const storage = new FakeStorage()
  const missing = readJsonStorage(storage, 'paths', { safeParse: (value: unknown) => ({ success: Array.isArray(value), data: value }) } as never, [])
  assert.equal(missing.status, 'missing')
  storage.setItem('paths', '{not-json')
  const malformed = readJsonStorage(storage, 'paths', { safeParse: () => ({ success: false, error: { issues: [] } }) } as never, [])
  assert.equal(malformed.status, 'malformed')
  assert.equal(storage.getItem('paths'), '{not-json')
})

test('accepts valid and legacy-compatible backups and rejects malformed records', () => {
  assert.equal(backupSchema.safeParse(validBackup).success, true)
  const legacy = { ...validBackup, data: { ...validBackup.data, learningPaths: [{ ...validPath, visibility: undefined }] } }
  assert.equal(backupSchema.safeParse(legacy).success, true)
  assert.equal(backupSchema.safeParse({ ...validBackup, data: { ...validBackup.data, practiceJournal: [{ id: 'bad' }] } }).success, false)
})

test('normalizes custom categories and accepts legacy custom skills without icon metadata', () => {
  assert.equal(normalizeSkillCategory('  movement   '), 'Movement & Sports')
  assert.equal(normalizeSkillCategory('MOVEMENT & SPORTS'), 'Movement & Sports')
  assert.equal(normalizeSkillCategory('  Field Notes  '), 'Field Notes')
  const legacyCustomSkill = {
    id: 'custom-one', title: 'Field notes', category: ' field   notes ', summary: '', color: 'sage',
    equipment: '', roadmap: [], milestones: [], resources: [], isCustom: true,
  }
  assert.equal(backupSchema.safeParse({ ...validBackup, data: { ...validBackup.data, customSkills: [legacyCustomSkill] } }).success, true)
})

test('detaches deleted custom skills without changing path history', () => {
  const paths = [
    { id: 'path-one', skillId: 'custom-one', title: 'Saved path', updatedAt: 'old' },
    { id: 'path-two', skillId: 'built-in', title: 'Other path', updatedAt: 'old' },
  ]
  const detached = detachSkillFromPaths(paths, 'custom-one', 'new')
  assert.deepEqual(detached, [
    { id: 'path-one', skillId: undefined, title: 'Saved path', updatedAt: 'new' },
    paths[1],
  ])
})

test('detects semantic journal duplicates and preserves unlinked records after deletion planning', () => {
  assert.equal(journalRecordsRepresentSameSession(
    { id: 'migrated-path-one-session-one', pathId: 'path-one' },
    { id: 'session-one', pathId: 'path-one' },
  ), true)
  const resources = { 'path-one': [{ id: 'resource-one' }], 'path-two': [{ id: 'resource-two' }] }
  assert.deepEqual(removePathResources(resources, 'path-one'), { 'path-two': [{ id: 'resource-two' }] })
  const unlinked = { id: 'journal-one', pathId: null }
  assert.equal(unlinked.pathId, null)
})

test('rolls back failed batch writes and reports rollback status', () => {
  const storage = new FakeStorage()
  storage.setItem('paths', JSON.stringify(['existing']))
  storage.failNextWrite = true
  const result = writeJsonBatch(storage, { paths: ['new'], journal: [] })
  assert.equal(result.ok, false)
  assert.equal(result.rollbackFailed, false)
  assert.equal(storage.getItem('paths'), JSON.stringify(['existing']))
})

test('makes the journal authoritative and migrates legacy sessions once', () => {
  const path = { id: 'path-one', actualPracticeSessions: [{
    id: 'legacy-session',
    date: '2026-11-02',
    durationMinutes: 5,
    notes: 'Rows',
    taskId: 'task-one',
  }] }
  const first = synchronizeLegacyPracticeSessions([path], [], '2026-11-03T00:00:00.000Z')
  assert.equal(first.migratedCount, 1)
  assert.deepEqual(first.journal[0], {
    id: 'migrated-path-one-legacy-session',
    pathId: 'path-one',
    date: '2026-11-02',
    type: 'independent',
    durationMinutes: 5,
    notes: 'Rows',
    taskId: 'task-one',
    achievements: '',
    difficulties: '',
    createdAt: '2026-11-03T00:00:00.000Z',
    updatedAt: '2026-11-03T00:00:00.000Z',
    migratedFrom: 'legacy-session',
  })
  const second = synchronizeLegacyPracticeSessions(first.paths, first.journal, '2026-11-04T00:00:00.000Z')
  assert.equal(second.migratedCount, 0)
  assert.equal(second.journal.length, 1)
  assert.equal(second.paths[0].actualPracticeSessions?.length, 1)
  assert.equal(second.paths[0].actualPracticeSessions?.[0].taskId, 'task-one')
})

test('preserves zero-minute reflections, unlinked records, and separates paths', () => {
  const journal = [
    { id: 'reflection', pathId: 'path-one', date: '2026-11-02', type: 'reflection' as const, durationMinutes: 0, notes: 'Reflection', taskId: null, achievements: '', difficulties: '', createdAt: '2026-11-02', updatedAt: '2026-11-02' },
    { id: 'general', pathId: null, date: '2026-11-02', type: 'reflection' as const, durationMinutes: 0, notes: 'General', taskId: null, achievements: '', difficulties: '', createdAt: '2026-11-02', updatedAt: '2026-11-02' },
  ]
  const result = synchronizeLegacyPracticeSessions([
    { id: 'path-one', actualPracticeSessions: [] },
    { id: 'path-two', actualPracticeSessions: [{ id: 'same-id', date: '2026-11-02', durationMinutes: 10, notes: 'Other path', taskId: null }] },
  ], journal)
  assert.equal(result.journal.length, 3)
  assert.equal(result.paths[0].actualPracticeSessions?.[0].durationMinutes, 0)
  assert.equal(result.paths[1].actualPracticeSessions?.[0].notes, 'Other path')
  assert.equal(result.journal.find((entry) => entry.pathId === null)?.notes, 'General')
})

test('does not resurrect deliberately deleted legacy sessions across synchronization', () => {
  const path = {
    id: 'path-a',
    actualPracticeSessions: [{ id: 'legacy-1', date: '2026-11-03', durationMinutes: 10, notes: 'practice', taskId: null }],
  }
  const deleted = markPracticeSessionDeleted({}, path.id, { id: 'migrated-path-a-legacy-1', migratedFrom: 'legacy-1' })
  const first = synchronizeLegacyPracticeSessions([path], [], '2026-11-03T00:00:00.000Z', deleted)
  assert.equal(first.journal.length, 0)
  assert.equal(first.paths[0].actualPracticeSessions.length, 0)
  const second = synchronizeLegacyPracticeSessions(first.paths, first.journal, '2026-11-04T00:00:00.000Z', deleted)
  assert.equal(second.journal.length, 0)
  assert.equal(second.paths[0].actualPracticeSessions.length, 0)
})

test('tracks a deleted normal journal session by its original legacy identity', () => {
  const deleted = markPracticeSessionDeleted({}, 'path-a', { id: 'migrated-path-a-legacy-1', migratedFrom: 'legacy-1' })
  assert.deepEqual(deleted, { 'path-a': ['legacy-1'] })
})

test('allows web resource URLs but rejects unsafe protocols', () => {
  assert.equal(isSafeResourceUrl('https://example.com/course'), true)
  assert.equal(isSafeResourceUrl('http://localhost:3000/book'), true)
  assert.equal(isSafeResourceUrl('javascript:alert(1)'), false)
  assert.equal(isSafeResourceUrl('data:text/html,unsafe'), false)
  assert.equal(isSafeResourceUrl('file:///secret.txt'), false)
  assert.equal(isSafeResourceUrl('not a URL'), false)
})

test('uses local time for greetings and preserves temporary profile editing', () => {
  assert.equal(getTimeGreeting(new Date(2026, 10, 3, 4, 59)), 'Good evening')
  assert.equal(getTimeGreeting(new Date(2026, 10, 3, 5, 0)), 'Good morning')
  assert.equal(getTimeGreeting(new Date(2026, 10, 3, 11, 59)), 'Good morning')
  assert.equal(getTimeGreeting(new Date(2026, 10, 3, 12, 0)), 'Good afternoon')
  assert.equal(getTimeGreeting(new Date(2026, 10, 3, 16, 59)), 'Good afternoon')
  assert.equal(getTimeGreeting(new Date(2026, 10, 3, 17, 0)), 'Good evening')
  assert.equal(normalizeDisplayName(''), 'Learner')
  assert.equal(normalizeDisplayName('  Anna  '), 'Anna')
})

test('calculates local day, Monday week, month and all-time practice boundaries', () => {
  const now = new Date(2026, 10, 4, 17, 30)
  assert.deepEqual(getPracticePeriodBounds('day', now), { start: '2026-11-04', end: '2026-11-05' })
  assert.deepEqual(getPracticePeriodBounds('week', now), { start: '2026-11-02', end: '2026-11-09' })
  assert.deepEqual(getPracticePeriodBounds('month', now), { start: '2026-11-01', end: '2026-12-01' })
  assert.deepEqual(getPracticePeriodBounds('all', now), { start: null, end: null })
  assert.equal(isPracticeDateInPeriod('2026-11-02', 'week', now), true)
  assert.equal(isPracticeDateInPeriod('2026-11-09', 'week', now), false)
  assert.equal(isPracticeDateInPeriod('2026-10-31', 'month', now), false)
})

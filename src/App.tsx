import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { z } from 'zod'
import { backupSchema, detachSkillFromPaths, getTimeGreeting, isPracticeDateInPeriod, isSafeResourceUrl, localDateKey, markPracticeSessionDeleted, normalizeDisplayName, normalizeSkillCategory, readJsonStorage, removePathResources, synchronizeLegacyPracticeSessions, writeJsonBatch, type DeletedPracticeSessions, type PracticePeriod } from './dataIntegrity.ts'
import './App.css'

type Task = { title: string; completed: boolean }
type View = 'Dashboard' | 'Explore Skills' | 'AI Learning Planner' | 'My learning paths' | 'Practice journal' | 'Settings'
type RouteState = { page: View; skillId?: string; pathId?: string }
type SkillId = string
type PracticeType = 'lesson' | 'independent' | 'reflection'
type PracticeSession = { id: string; date: string; durationMinutes: number; notes: string; taskId: string | null }
type Reflection = { answer: string; toolRan?: boolean }
type JournalEntry = {
  id: string
  pathId: string | null
  date: string
  type: PracticeType
  durationMinutes: number
  notes: string
  achievements: string
  difficulties: string
  createdAt: string
  updatedAt: string
  taskId?: string | null
  migratedFrom?: string
}

type Skill = {
  id: SkillId
  title: string
  category: string
  summary: string
  color: string
  equipment: string
  roadmap: string[]
  milestones: string[]
  tags?: string[]
  visual?: string
  icon?: string
  isCustom?: boolean
  resources: { id?: string; label: string; type: string; url?: string; notes?: string }[]
}
type PersonalResource = Skill['resources'][number]
type BackupData = {
  learningPaths: SavedLearningPath[]
  practiceJournal: JournalEntry[]
  customSkills: Skill[]
  skillResources: Record<string, PersonalResource[]>
  pathResources: Record<string, PersonalResource[]>
  preferences: Record<string, string | boolean | number>
  deletedPracticeSessions?: DeletedPracticeSessions
}
type SkillPathBackup = { format: 'skillpath-backup'; version: 1; createdAt: string; data: BackupData }

const storageKeys = ['skillpath-learning-paths', 'skillpath-practice-journal', 'skillpath-custom-skills', 'skillpath-skill-resources', 'skillpath-path-resources', 'skillpath-deleted-practice-sessions'] as const
const motivationStorageKey = 'skillpath-motivation-preferences'
const profileStorageKey = 'skillpath-profile'
const jsonArraySchema = z.array(z.unknown())
const jsonRecordSchema = z.record(z.string(), z.unknown())

function storageIssues() {
  const issues: Record<string, string> = {}
  storageKeys.forEach((key) => {
    const isArray = key === 'skillpath-learning-paths' || key === 'skillpath-practice-journal' || key === 'skillpath-custom-skills'
    const result = isArray
      ? readJsonStorage(localStorage, key, jsonArraySchema, [])
      : readJsonStorage(localStorage, key, jsonRecordSchema, {})
    if (result.status === 'malformed') issues[key] = result.error ?? 'Stored data is malformed.'
  })
  return issues
}

const motivations = [
  'Small practice sessions become meaningful progress when you return to them.',
  'Curiosity is a direction, not a deadline.',
  'You do not need to master the whole skill today; learn the next small piece.',
  'A beginner’s question can open a very deep door.',
  'Creative work grows through patient attention.',
  'Practice is how an idea becomes something you can feel and use.',
  'Your pace is allowed to be personal.',
  'Notice what is easier today than it was before.',
  'A thoughtful attempt is already part of the learning.',
  'Progress often looks like returning after a difficult day.',
  'Make room for experiments; they teach in ways plans cannot.',
  'The work you repeat gently can become a strength.',
  'Learning is not a performance. It is a relationship with curiosity.',
  'One honest reflection can improve the next practice session.',
  'You can be both unfinished and making real progress.',
  'Give your attention to the process, and let results arrive in time.',
  'A small question is enough reason to explore.',
  'Every skill has a first awkward version. Keep going.',
  'Your notes, attempts and mistakes are evidence of participation.',
  'Consistency can be quiet and still be powerful.',
  'The best learning plan leaves space for discovery.',
  'Try the simpler version first; clarity often begins there.',
  'You are building trust with yourself each time you practice.',
  'Creative confidence grows from making, reviewing and trying again.',
  'There is useful information inside what felt difficult.',
  'Learning can be serious without becoming harsh.',
  'A few focused minutes can change the shape of a day.',
  'Let today’s practice be enough for today.',
  'Skills become yours through use, not through waiting to feel ready.',
  'Your curiosity does not need permission to become a project.',
  'Celebrate the details you can notice now.',
  'A pause can be part of practice, not a failure of it.',
  'The next attempt benefits from everything the last one taught you.',
  'You can build something meaningful one modest step at a time.',
  'Keep the goal, but stay open to what the process reveals.',
  'Progress is sometimes a better question, not a faster answer.',
  'Make space for joy alongside improvement.',
  'The habit of beginning is a skill worth practicing.',
  'Your learning story is allowed to change as you grow.',
  'Today’s small act of attention is a vote for the person you are becoming.',
]

const skills: Skill[] = [
  {
    id: 'piano', title: 'Piano', category: 'Music', summary: 'Learn to read, play and enjoy music one phrase at a time.',
    color: 'lavender', equipment: 'A piano or keyboard, a comfortable bench and a small notebook.',
    roadmap: ['Get familiar with the keys', 'Learn simple rhythms', 'Play your first melody'],
    milestones: ['Name the white keys', 'Play five-finger patterns', 'Perform a beginner piece'],
    resources: [
      { label: 'Music theory lessons', type: 'Lessons', url: 'https://www.musictheory.net/lessons' },
      { label: 'Piano beginner guide', type: 'Guide', url: 'https://www.flowkey.com/en/piano-guide' },
    ],
  },
  {
    id: 'knitting', title: 'Knitting', category: 'Crafts', summary: 'Make useful, thoughtful things while building a calm creative habit.',
    color: 'peach', equipment: 'Medium-weight yarn, appropriately sized needles and a pair of scissors.',
    roadmap: ['Hold yarn and needles comfortably', 'Practice knit and purl stitches', 'Make a small useful piece'],
    milestones: ['Cast on confidently', 'Knit an even square', 'Finish a simple scarf'],
    resources: [
      { label: 'Knitting video library', type: 'Videos', url: 'https://www.knittinghelp.com/video/play/' },
      { label: 'Beginner knitting guide', type: 'Guide', url: 'https://www.craftsy.com/post/how-to-knit/' },
    ],
  },
  {
    id: 'watercolor', title: 'Watercolor painting', category: 'Art', summary: 'Explore light, color and observation through small daily studies.',
    color: 'sage', equipment: 'Student-grade watercolor paints, two brushes, paper and a water jar.',
    roadmap: ['Understand water and pigment', 'Mix a personal color chart', 'Paint a simple observed scene'],
    milestones: ['Paint a color wheel', 'Practice three washes', 'Complete a small landscape'],
    resources: [
      { label: 'Watercolor techniques', type: 'Tutorials', url: 'https://www.watercoloraffair.com/watercolor-techniques/' },
      { label: 'Watercolor learning hub', type: 'Lessons', url: 'https://www.jacksonsart.com/blog/category/watercolour/' },
    ],
  },
  {
    id: 'spanish', title: 'Spanish', category: 'Languages', summary: 'Build everyday vocabulary and the confidence to understand more.',
    color: 'blue', equipment: 'A notebook, headphones and a few minutes for daily listening and speaking.',
    roadmap: ['Learn useful everyday phrases', 'Build a small core vocabulary', 'Practice short conversations'],
    milestones: ['Introduce yourself', 'Order food and ask directions', 'Hold a five-minute conversation'],
    resources: [
      { label: 'Spanish course', type: 'Course', url: 'https://www.duolingo.com/course/es/en/Learn-Spanish' },
      { label: 'Spanish learning resources', type: 'Worksheets', url: 'https://www.bbc.co.uk/languages/spanish/' },
    ],
  },
  {
    id: 'cooking', title: 'Cooking', category: 'Lifestyle', summary: 'Cook with more confidence by learning techniques, not just recipes.',
    color: 'peach', equipment: 'A chef’s knife, chopping board, saucepan and a reliable way to measure.',
    roadmap: ['Learn safe knife handling', 'Practice heat and seasoning', 'Cook one complete meal'],
    milestones: ['Make a simple soup', 'Cook an egg three ways', 'Prepare a balanced dinner'],
    resources: [
      { label: 'Cooking skills guide', type: 'Guide', url: 'https://www.bbcgoodfood.com/howto/guide' },
      { label: 'Knife skills videos', type: 'Videos', url: 'https://www.seriouseats.com/knife-skills-5118019' },
    ],
  },
  {
    id: 'running', title: 'Running', category: 'Movement & Sports', summary: 'Build an enjoyable running routine at a pace that respects your body.',
    color: 'sage', equipment: 'Comfortable running shoes, weather-appropriate layers and a safe route.',
    roadmap: ['Create a walk-run rhythm', 'Build steady weekly consistency', 'Complete a relaxed 5K'],
    milestones: ['Complete three easy sessions', 'Run continuously for 20 minutes', 'Finish a 5K'],
    resources: [
      { label: 'Couch to 5K plan', type: 'Plan', url: 'https://www.nhs.uk/better-health/get-active/couch-to-5k/' },
      { label: 'Running form basics', type: 'Guide', url: 'https://www.runnersworld.com/beginner/a20812270/how-to-start-running/' },
    ],
  },
  {
    id: 'photography', title: 'Photography', category: 'Creative', summary: 'Train your eye to notice light, composition and meaningful moments.',
    color: 'blue', equipment: 'Any camera or phone, a way to review images and a curious eye.',
    roadmap: ['Learn to see good light', 'Practice simple compositions', 'Make a small photo story'],
    milestones: ['Take ten intentional photos', 'Practice framing and focus', 'Edit a five-image set'],
    resources: [
      { label: 'Photography tips', type: 'Tutorials', url: 'https://www.nikonusa.com/learn-and-explore/c/tips-and-techniques' },
      { label: 'Digital photography basics', type: 'Guide', url: 'https://www.adobe.com/creativecloud/photography/discover/digital-photography.html' },
    ],
  },
  {
    id: 'programming', title: 'Programming', category: 'Technology', summary: 'Learn to turn ideas into small, useful and understandable programs.',
    color: 'lavender', equipment: 'A computer, a code editor and patience for experimenting.',
    roadmap: ['Understand the building blocks', 'Make a tiny interactive project', 'Share and improve your work'],
    milestones: ['Write your first function', 'Build a small webpage', 'Complete a personal project'],
    resources: [
      { label: 'MDN Learn Web Development', type: 'Lessons', url: 'https://developer.mozilla.org/en-US/docs/Learn' },
      { label: 'CS50 Introduction', type: 'Course', url: 'https://cs50.harvard.edu/x/' },
    ],
  },
]

const expandedSkills: Skill[] = [
  ['guitar', 'Guitar', 'Music'], ['violin', 'Violin', 'Music'], ['solfege', 'Solfege', 'Music'], ['classical-music', 'Classical music', 'Music'], ['music-theory', 'Music theory', 'Music'], ['music-history', 'Music history', 'Music'],
  ['crocheting', 'Crocheting', 'Crafts'], ['pottery', 'Pottery', 'Crafts'], ['clay-modeling', 'Clay modeling', 'Crafts'], ['embroidery', 'Embroidery', 'Crafts'], ['candle-making', 'Candle making', 'Crafts'], ['soap-making', 'Soap making', 'Crafts'],
  ['yoga', 'Yoga', 'Movement & Sports'], ['pilates', 'Pilates', 'Movement & Sports'], ['figure-skating', 'Figure skating', 'Movement & Sports'], ['horseback-riding', 'Horseback riding', 'Movement & Sports'], ['tennis', 'Tennis', 'Movement & Sports'], ['gymnastics', 'Gymnastics', 'Movement & Sports'], ['swimming', 'Swimming', 'Movement & Sports'], ['ballet', 'Ballet', 'Movement & Sports'],
  ['drawing', 'Drawing', 'Art'], ['digital-art', 'Digital art', 'Art'], ['calligraphy', 'Calligraphy', 'Art'], ['lettering', 'Lettering', 'Art'],
  ['armenian-art-culture', 'Armenian art and culture', 'Culture'], ['museums', 'Museums', 'Culture'], ['art-history', 'Art history', 'Culture'], ['architecture', 'Architecture', 'Culture'],
  ['french', 'French', 'Languages'], ['english', 'English', 'Languages'], ['russian', 'Russian', 'Languages'], ['armenian', 'Armenian', 'Languages'],
  ['cpp', 'C++', 'Technology'], ['python', 'Python', 'Technology'], ['prompt-engineering', 'Prompt engineering', 'Technology'], ['web-development', 'Web development', 'Technology'],
  ['baking', 'Baking', 'Lifestyle'], ['gardening', 'Gardening', 'Lifestyle'],
].map(([id, title, category]) => ({
  id, title, category, summary: `Build a practical and enjoyable ${title.toLowerCase()} habit at your own pace.`,
  color: category === 'Music' || category === 'Technology' ? 'lavender' : category === 'Crafts' || category === 'Lifestyle' ? 'peach' : category === 'Movement & Sports' ? 'sage' : 'blue',
  equipment: 'Start with accessible materials, a small amount of space and a beginner-friendly way to practice.',
  roadmap: ['Get oriented with the basics', 'Practice one small skill regularly', 'Make or complete a first project'],
  milestones: ['Understand the foundations', 'Complete a beginner exercise', 'Reflect on your progress'],
  tags: [category.toLowerCase(), title.toLowerCase(), 'beginner'],
  visual: id,
  resources: [],
}))

const catalogSkills = [...skills, ...expandedSkills]

const navigationItems: { label: View; icon: string }[] = [
  { label: 'Dashboard', icon: '⌂' },
  { label: 'Explore Skills', icon: '✦' },
  { label: 'AI Learning Planner', icon: '✧' },
  { label: 'My learning paths', icon: '◎' },
  { label: 'Practice journal', icon: '▤' },
]

function getProgress(tasks: Task[]) {
  return Math.round((tasks.filter((task) => task.completed).length / tasks.length) * 100)
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`
}

type PlannerInputs = {
  skill: string
  level: string
  goal: string
  time: string
  preferences: string
}

type GeneratedPlan = {
  title: string
  overview: string
  assumptions: string[]
  milestones: {
    id: string
    title: string
    description: string
    tasks: { id: string; title: string; description: string; estimatedMinutes: number }[]
  }[]
  practiceSessions: { id: string; dayLabel: string; durationMinutes: number; activity: string }[]
  reviewGuidance: string
}

type SavedLearningPath = {
  id: string
  title: string
  description: string
  category: string
  color: string
  icon: string
  visibility: 'private' | 'public'
  skillId?: string
  goal: { id: string; title: string; description: string; targetDate: string | null } | null
  milestones: {
    id: string
    title: string
    description: string
    tasks: { id: string; title: string; description?: string; estimatedMinutes?: number; completed: boolean; completedAt: string | null }[]
  }[]
  practiceSessions: PracticeSession[]
  suggestedPracticeSessions?: PracticeSession[]
  actualPracticeSessions?: PracticeSession[]
  createdAt: string
  updatedAt: string
  assumptions?: string[]
  reviewGuidance?: string
  resources?: PersonalResource[]
}

function readSavedLearningPaths(): SavedLearningPath[] {
  return readJsonStorage(localStorage, 'skillpath-learning-paths', jsonArraySchema, []).value as SavedLearningPath[]
}

function readCustomSkills(): Skill[] {
  return (readJsonStorage(localStorage, 'skillpath-custom-skills', jsonArraySchema, []).value as Skill[]).map((skill) => ({
    ...skill,
    category: normalizeSkillCategory(skill.category),
    color: skill.color || 'sage',
    icon: skill.icon || skill.visual || '✦',
    isCustom: true,
  }))
}

function readDeletedPracticeSessions(): DeletedPracticeSessions {
  const value = readJsonStorage(localStorage, 'skillpath-deleted-practice-sessions', jsonRecordSchema, {}).value as Record<string, unknown>
  return Object.fromEntries(Object.entries(value).filter(([, identities]) => Array.isArray(identities)).map(([pathId, identities]) => [pathId, (identities as unknown[]).filter((identity): identity is string => typeof identity === 'string')]))
}

function makeBackup(data: BackupData): SkillPathBackup {
  return { format: 'skillpath-backup', version: 1, createdAt: new Date().toISOString(), data }
}

function validateBackup(value: unknown): { backup?: SkillPathBackup; error?: string } {
    const parsed = backupSchema.safeParse(value)
    if (!parsed.success) return { error: `The backup is invalid: ${parsed.error.issues.slice(0, 3).map((issue) => issue.path.join('.') || '<root>').join(', ')}.` }
    const candidate = parsed.data as Partial<SkillPathBackup>
    if (candidate.format !== 'skillpath-backup' || candidate.version !== 1) return { error: 'This is not a supported SkillPath backup (version 1).' }
    if (typeof candidate.createdAt !== 'string' || !candidate.data || typeof candidate.data !== 'object') return { error: 'The backup is missing required metadata or data.' }
    const data = candidate.data as Partial<BackupData>
    if (!Array.isArray(data.learningPaths) || !Array.isArray(data.practiceJournal) || !Array.isArray(data.customSkills) || !data.skillResources || typeof data.skillResources !== 'object' || !data.pathResources || typeof data.pathResources !== 'object' || !data.preferences || typeof data.preferences !== 'object') return { error: 'The backup data is incomplete or malformed.' }
    const pathIds = new Set(data.learningPaths.map((path) => path && typeof path === 'object' ? (path as SavedLearningPath).id : ''))
    const skillIds = new Set(data.customSkills.map((skill) => skill && typeof skill === 'object' ? (skill as Skill).id : ''))
    if (pathIds.has('') || skillIds.has('')) return { error: 'Every path and custom skill must have a stable ID.' }
    if (new Set(pathIds).size !== data.learningPaths.length || new Set(skillIds).size !== data.customSkills.length) return { error: 'The backup contains duplicate path or custom skill IDs.' }
    const allIds = [
      ...data.learningPaths.map((path) => path.id),
      ...data.practiceJournal.map((entry) => entry.id),
      ...data.customSkills.map((skill) => skill.id),
      ...Object.values(data.skillResources).flat().map((resource) => resource.id),
      ...Object.values(data.pathResources).flat().map((resource) => resource.id),
    ].filter((id): id is string => typeof id === 'string' && id.length > 0)
    if (new Set(allIds).size !== allIds.length) return { error: 'The backup contains duplicate IDs across datasets.' }
    if (data.learningPaths.some((path) => path.skillId && !skillIds.has(path.skillId) && !catalogSkills.some((skill) => skill.id === path.skillId))) return { error: 'The backup contains a path linked to an unknown skill.' }
    if (data.practiceJournal.some((entry) => !entry || typeof entry !== 'object' || typeof (entry as JournalEntry).id !== 'string' || ((entry as JournalEntry).pathId !== null && !pathIds.has((entry as JournalEntry).pathId)))) return { error: 'The backup contains a journal entry with an invalid path relationship.' }
    if (Object.entries(data.pathResources).some(([pathId, resources]) => !pathIds.has(pathId) || !Array.isArray(resources) || resources.some((resource) => !resource || typeof resource.id !== 'string'))) return { error: 'The backup contains path resources with invalid relationships.' }
    if (Object.entries(data.skillResources).some(([skillId, resources]) => !skillIds.has(skillId) && !catalogSkills.some((skill) => skill.id === skillId) || !Array.isArray(resources) || resources.some((resource) => !resource || typeof resource.id !== 'string'))) return { error: 'The backup contains skill resources with invalid relationships.' }
    const unsafeResource = [...Object.values(data.skillResources), ...Object.values(data.pathResources), ...data.customSkills.map((skill) => skill.resources), ...data.learningPaths.flatMap((path) => path.resources ?? [])].flat().find((resource) => resource.url && !isSafeResourceUrl(resource.url))
    if (unsafeResource) return { error: 'The backup contains an unsafe resource URL. Only http:// and https:// links are allowed.' }
    if (data.preferences.displayName !== undefined && (typeof data.preferences.displayName !== 'string' || data.preferences.displayName.trim().length > 60)) return { error: 'The backup contains an invalid learner display name.' }
    return { backup: parsed.data as SkillPathBackup }
}

function countResources(resources: Record<string, PersonalResource[]>) {
  return Object.values(resources).reduce((total, items) => total + items.length, 0)
}

function migratedJournalId(pathId: string, sessionId: string) {
  return `migrated-${pathId}-${sessionId}`
}

function journalEntryRepresentsSession(entry: JournalEntry, pathId: string, sessionId: string) {
  if (entry.pathId !== pathId) return false
  return entry.id === sessionId || entry.id === migratedJournalId(pathId, sessionId) || entry.migratedFrom === sessionId
}

function journalEntriesRepresentSameSession(first: JournalEntry, second: JournalEntry) {
  if (first.pathId === null || first.pathId !== second.pathId) return false
  if (first.id === second.id) return true
  if (first.migratedFrom && (first.migratedFrom === second.id || first.migratedFrom === second.migratedFrom)) return true
  if (second.migratedFrom && second.migratedFrom === first.id) return true
  return first.id === migratedJournalId(first.pathId, second.migratedFrom ?? second.id)
    || second.id === migratedJournalId(second.pathId, first.migratedFrom ?? first.id)
}

function pathContainsJournalSession(path: SavedLearningPath, entry: JournalEntry) {
  return path.id === entry.pathId && (path.actualPracticeSessions ?? []).some((session) => (
    session.id === entry.id
    || session.id === entry.migratedFrom
    || entry.id === migratedJournalId(path.id, session.id)
  ))
}

function readJournalEntries(paths: SavedLearningPath[], deleted: DeletedPracticeSessions) {
  const storedResult = readJsonStorage(localStorage, 'skillpath-practice-journal', jsonArraySchema, [])
  const stored = storedResult.value as JournalEntry[]
  const migrated: JournalEntry[] = []
  paths.forEach((path) => (path.actualPracticeSessions ?? []).forEach((session) => {
    if ((deleted[path.id] ?? []).includes(session.id)) return
    const id = migratedJournalId(path.id, session.id)
    if (!stored.some((entry) => journalEntryRepresentsSession(entry, path.id, session.id)) && !migrated.some((entry) => journalEntryRepresentsSession(entry, path.id, session.id))) migrated.push({
      id,
      pathId: path.id,
      date: session.date,
      type: 'independent',
      durationMinutes: session.durationMinutes,
      notes: session.notes,
      taskId: session.taskId ?? null,
      achievements: '',
      difficulties: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      migratedFrom: session.id,
    })
  }))
  const entries = [...stored, ...migrated]
  const pathsResult = readJsonStorage(localStorage, 'skillpath-learning-paths', jsonArraySchema, [])
  if (storedResult.status !== 'malformed' && pathsResult.status !== 'malformed') {
    const synchronized = synchronizeLegacyPracticeSessions(paths, entries, new Date().toISOString(), deleted)
    const pathsChanged = JSON.stringify(synchronized.paths) !== JSON.stringify(paths)
    if (migrated.length > 0 || pathsChanged) {
      try {
        writeJsonBatch(localStorage, {
          'skillpath-practice-journal': synchronized.journal,
          'skillpath-learning-paths': synchronized.paths,
        })
      } catch {
        // Keep readable in-memory data if browser storage rejects migration.
      }
    }
    return synchronized.journal
  }
  return entries
}

function SkillVisual({ skill }: { skill: Skill }) {
  const knownVisualIds = ['piano', 'knitting', 'watercolor', 'spanish', 'french', 'english', 'russian', 'armenian', 'cooking', 'running', 'photography', 'programming', 'guitar', 'violin', 'solfege', 'classical-music', 'music-theory', 'music-history', 'crocheting', 'pottery', 'clay-modeling', 'embroidery', 'candle-making', 'soap-making', 'pilates', 'yoga', 'figure-skating', 'horseback-riding', 'tennis', 'gymnastics', 'swimming', 'ballet', 'drawing', 'digital-art', 'calligraphy', 'lettering', 'gardening', 'baking', 'cpp', 'python', 'prompt-engineering', 'web-development', 'armenian-art-culture', 'museums', 'art-history', 'architecture']
  const languageGreeting: Record<string, string> = { spanish: '¡Hola!', french: 'Bonjour', english: 'Hello!', russian: 'Привет!', armenian: 'Բարև!' }
  return (
    <div className={`skill-visual visual-${skill.id}`} role="img" aria-label={`${skill.title} illustration`}>
      {skill.id === 'piano' && <><span className="piano-body" /><span className="piano-keys" /></>}
      {skill.id === 'knitting' && <><span className="yarn-ball" /><span className="needle needle-one" /><span className="needle needle-two" /></>}
      {skill.id === 'watercolor' && <><span className="paint-palette" /><span className="paint-brush" /><span className="paint-dot dot-one" /><span className="paint-dot dot-two" /></>}
      {languageGreeting[skill.id] && <><span className="book book-back" /><span className="book book-front">{languageGreeting[skill.id]}</span></>}
      {skill.id === 'cooking' && <><span className="cooking-pot" /><span className="pot-handle" /><span className="steam" /></>}
      {skill.id === 'running' && <span className="running-sneaker"><span className="running-laces" /></span>}
      {skill.id === 'photography' && <><span className="camera-body" /><span className="camera-lens" /></>}
      {skill.id === 'programming' && <><span className="laptop-screen">&lt;/&gt;</span><span className="laptop-base" /></>}
      {skill.id === 'guitar' && <><span className="guitar-body" /><span className="guitar-neck" /><span className="guitar-strings" /></>}
      {skill.id === 'violin' && <><span className="violin-body" /><span className="violin-neck" /><span className="violin-bow" /></>}
      {skill.id === 'solfege' && <><span className="music-staff" /><span className="music-note note-a">♪</span><span className="music-note note-b">♫</span></>}
      {skill.id === 'pilates' && <><span className="pilates-mat" /><span className="pilates-ring" /></>}
      {skill.id === 'figure-skating' && <><span className="skate-boot" /><span className="skate-blade" /></>}
      {skill.id === 'pottery' && <><span className="pottery-wheel" /><span className="pottery-clay" /></>}
      {skill.id === 'drawing' && <><span className="drawing-pencil" /><span className="drawing-paper" /></>}
      {skill.id === 'digital-art' && <><span className="art-tablet" /><span className="art-stylus" /></>}
      {skill.id === 'ballet' && <><span className="ballet-shoe" /><span className="ballet-ribbon" /></>}
      {skill.id === 'tennis' && <><span className="tennis-racket" /><span className="tennis-ball" /></>}
      {skill.id === 'gardening' && <><span className="garden-pot" /><span className="garden-plant" /></>}
      {skill.id === 'baking' && <><span className="baking-bowl" /><span className="baking-whisk" /></>}
      {skill.id === 'prompt-engineering' && <span className="prompt-robot"><span className="robot-antenna" /><span className="robot-eye robot-eye-left" /><span className="robot-eye robot-eye-right" /><span className="robot-bubble">?</span></span>}
      {skill.id === 'armenian-art-culture' && <span className="khachkar"><span className="khachkar-border" /><span className="khachkar-cross" /></span>}
      {skill.id === 'museums' && <span className="museum-facade"><span className="museum-pediment" /><span className="museum-column column-one" /><span className="museum-column column-two" /><span className="museum-column column-three" /><span className="museum-column column-four" /></span>}
      {skill.id === 'art-history' && <span className="history-frame"><span className="history-sky" /><span className="history-hill" /><span className="history-tree" /></span>}
      {skill.id === 'architecture' && <span className="architecture-facade"><span className="architecture-window window-one" /><span className="architecture-window window-two" /><span className="architecture-window window-three" /><span className="architecture-window window-four" /><span className="architect-ruler" /></span>}
      {knownVisualIds.includes(skill.id) && !['piano', 'knitting', 'watercolor', 'spanish', 'french', 'english', 'russian', 'armenian', 'cooking', 'running', 'photography', 'programming', 'guitar', 'violin', 'solfege', 'pilates', 'figure-skating', 'pottery', 'drawing', 'digital-art', 'ballet', 'tennis', 'gardening', 'baking', 'prompt-engineering', 'armenian-art-culture', 'museums', 'art-history', 'architecture'].includes(skill.id) && <span className={`catalog-art art-${skill.id}`} aria-hidden="true">{['cpp', 'python', 'web-development'].includes(skill.id) ? ({ cpp: 'C++', python: 'Py', 'web-development': '</>' } as Record<string, string>)[skill.id] : null}</span>}
      {!knownVisualIds.includes(skill.id) && <span className="custom-visual" aria-hidden="true"><span className="custom-visual-icon">{skill.icon ?? skill.visual ?? '✦'}</span></span>}
    </div>
  )
}

function routeForState(route: RouteState) {
  if (route.skillId) return `/explore/skill/${encodeURIComponent(route.skillId)}`
  if (route.pathId) return `/learning/path/${encodeURIComponent(route.pathId)}`
  if (route.page === 'Explore Skills') return '/explore'
  if (route.page === 'My learning paths') return '/learning'
  if (route.page === 'AI Learning Planner') return '/planner'
  if (route.page === 'Practice journal') return '/journal'
  if (route.page === 'Settings') return '/settings'
  return '/dashboard'
}

function routeFromLocation(pathname: string): RouteState {
  const parts = pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part))
  if (parts[0] === 'explore' && parts[1] === 'skill' && parts[2]) return { page: 'Explore Skills', skillId: parts[2] }
  if (parts[0] === 'explore') return { page: 'Explore Skills' }
  if (parts[0] === 'learning' && parts[1] === 'path' && parts[2]) return { page: 'My learning paths', pathId: parts[2] }
  if (parts[0] === 'learning') return { page: 'My learning paths' }
  if (parts[0] === 'planner') return { page: 'AI Learning Planner' }
  if (parts[0] === 'journal') return { page: 'Practice journal' }
  if (parts[0] === 'settings') return { page: 'Settings' }
  return { page: 'Dashboard' }
}

function App() {
  const initialRoute = routeFromLocation(window.location.pathname)
  const initialPaths = readSavedLearningPaths()
  const initialDeletedPracticeSessions = readDeletedPracticeSessions()
  const initialCustomSkills = readCustomSkills()
  const validInitialRoute: RouteState = initialRoute.skillId && ![...catalogSkills, ...initialCustomSkills].some((skill) => skill.id === initialRoute.skillId)
    ? { page: 'Explore Skills' }
    : initialRoute.pathId && !initialPaths.some((path) => path.id === initialRoute.pathId)
      ? { page: 'My learning paths' }
      : initialRoute
  if (window.location.pathname !== routeForState(validInitialRoute)) window.history.replaceState(null, '', routeForState(validInitialRoute))
  const [activePage, setActivePage] = useState<View>(validInitialRoute.page)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(() => validInitialRoute.skillId ? [...catalogSkills, ...initialCustomSkills].find((skill) => skill.id === validInitialRoute.skillId) ?? null : null)
  const [selectedPath, setSelectedPath] = useState<SavedLearningPath | null>(() => validInitialRoute.pathId ? initialPaths.find((path) => path.id === validInitialRoute.pathId) ?? null : null)
  const [editingPath, setEditingPath] = useState<SavedLearningPath | null>(null)
  const [savedPaths, setSavedPaths] = useState<SavedLearningPath[]>(initialPaths)
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() => readJournalEntries(initialPaths, initialDeletedPracticeSessions))
  const [deletedPracticeSessions, setDeletedPracticeSessions] = useState<DeletedPracticeSessions>(initialDeletedPracticeSessions)
  const [customSkills, setCustomSkills] = useState<Skill[]>(() => {
    return initialCustomSkills
  })
  const [personalResources, setPersonalResources] = useState<Record<string, Skill['resources']>>(() => {
    return readJsonStorage(localStorage, 'skillpath-skill-resources', jsonRecordSchema, {}).value as Record<string, Skill['resources']>
  })
  const [pathResources, setPathResources] = useState<Record<string, PersonalResource[]>>(() => {
    return readJsonStorage(localStorage, 'skillpath-path-resources', jsonRecordSchema, {}).value as Record<string, PersonalResource[]>
  })
  const [startSkill, setStartSkill] = useState<Skill | null>(null)
  const [isCreatingCustomSkill, setIsCreatingCustomSkill] = useState(false)
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)
  const [plannerInputs, setPlannerInputs] = useState<PlannerInputs>({ skill: '', level: 'Beginner', goal: '', time: '', preferences: '' })
  const [isCreatingPath, setIsCreatingPath] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [pinnedMotivationId, setPinnedMotivationId] = useState<string | null>(() => localStorage.getItem(motivationStorageKey))
  const [displayName, setDisplayName] = useState(() => normalizeDisplayName(localStorage.getItem(profileStorageKey)))
  const [storageProblems, setStorageProblems] = useState<Record<string, string>>(() => storageIssues())
  const [storageNotice, setStorageNotice] = useState('')

  useEffect(() => {
    const activeDialog = document.querySelector<HTMLElement>('[role="dialog"]')
    if (!activeDialog) return
    const previousFocus = document.activeElement as HTMLElement | null
    const firstFocusable = activeDialog.querySelector<HTMLElement>('button, input, textarea, select, [tabindex]:not([tabindex="-1"])')
    firstFocusable?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        const closeButton = activeDialog.querySelector<HTMLButtonElement>('.close-button')
        closeButton?.click()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(activeDialog.querySelectorAll<HTMLElement>('button, input, textarea, select, [tabindex]:not([tabindex="-1"])')).filter((item) => !item.hasAttribute('disabled'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [showHelp, isCreatingPath, editingPath, startSkill, isCreatingCustomSkill, editingSkill])

  function writeStorage(key: string, value: unknown) {
    if (storageProblems[key]) {
      setStorageNotice(`Could not save ${key}: existing browser data is malformed. Export or recover that raw value before trying again.`)
      return false
    }

    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The browser rejected this write.'
      setStorageProblems((current) => ({ ...current, [key]: message }))
      setStorageNotice(`Could not save ${key}. Your in-memory changes were not applied.`)
      return false
    }

  }

  function writeStorageBatch(values: Record<string, unknown>) {
    const blocked = Object.keys(values).find((key) => storageProblems[key])
    if (blocked) {
      setStorageNotice(`Could not save ${blocked}: existing browser data is malformed. Affected writes are blocked to protect the raw value.`)
      return false
    }
    const result = writeJsonBatch(localStorage, values)
    if (!result.ok) {
      setStorageNotice(`Could not save the requested data. ${result.rollbackFailed ? 'Rollback also failed; export or copy the affected browser data before retrying.' : 'Existing data was restored where possible.'}`)
      return false
    }
    return true
  }

  const allSkills = [...catalogSkills, ...customSkills]
  const filteredSkills = allSkills.filter((skill) => {
    const matchesSearch = `${skill.title} ${skill.category} ${(skill.tags ?? []).join(' ')}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch && (category === 'All' || skill.category === category)
  })
  const categories = ['All', ...Array.from(new Map(allSkills.map((skill) => [normalizeSkillCategory(skill.category).toLowerCase(), normalizeSkillCategory(skill.category)])).values())]

  function applyRoute(route: RouteState) {
    setActivePage(route.page)
    setSelectedSkill(route.skillId ? allSkills.find((skill) => skill.id === route.skillId) ?? null : null)
    setSelectedPath(route.pathId ? savedPaths.find((path) => path.id === route.pathId) ?? null : null)
  }

  function navigate(route: RouteState) {
    window.history.pushState(null, '', routeForState(route))
    applyRoute(route)
  }

  useEffect(() => {
    const onPopState = () => {
      const route = routeFromLocation(window.location.pathname)
      setActivePage(route.page)
      setSelectedSkill(route.skillId ? [...catalogSkills, ...readCustomSkills()].find((skill) => skill.id === route.skillId) ?? null : null)
      setSelectedPath(route.pathId ? readSavedLearningPaths().find((path) => path.id === route.pathId) ?? null : null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function openExplore() {
    navigate({ page: 'Explore Skills' })
  }

  function openMyLearning() {
    navigate({ page: 'My learning paths' })
  }

  function persistJournal(entries: JournalEntry[], deleted = deletedPracticeSessions) {
    const synchronized = synchronizeLegacyPracticeSessions(savedPaths, entries, new Date().toISOString(), deleted)
    if (!writeStorageBatch({ 'skillpath-practice-journal': synchronized.journal, 'skillpath-learning-paths': synchronized.paths, 'skillpath-deleted-practice-sessions': deleted })) return false
    setJournalEntries(synchronized.journal)
    setSavedPaths(synchronized.paths)
    if (deleted !== deletedPracticeSessions) setDeletedPracticeSessions(deleted)
    return true
  }

  function addJournalEntry(entry: JournalEntry) {
    if (journalEntries.some((item) => item.id === entry.id)) return
    persistJournal([...journalEntries, entry])
  }

  function updateJournalEntry(entry: JournalEntry) {
    persistJournal(journalEntries.map((item) => item.id === entry.id ? entry : item))
  }

  function deleteJournalEntry(entryId: string) {
    if (!window.confirm('Delete this practice journal entry? This cannot be undone.')) return
    const entry = journalEntries.find((item) => item.id === entryId)
    if (!entry) return
    const nextDeleted = markPracticeSessionDeleted(deletedPracticeSessions, entry.pathId, entry)
    persistJournal(journalEntries.filter((item) => item.id !== entryId), nextDeleted)
  }

  function persistCustomSkills(next: Skill[]) {
    if (!writeStorage('skillpath-custom-skills', next)) return false
    setCustomSkills(next)
    return true
  }

  function persistResources(next: Record<string, Skill['resources']>) {
    if (!writeStorage('skillpath-skill-resources', next)) return
    setPersonalResources(next)
  }

  function persistPathResources(next: Record<string, PersonalResource[]>) {
    if (!writeStorage('skillpath-path-resources', next)) return
    setPathResources(next)
  }

  function currentBackup() {
    return makeBackup({ learningPaths: savedPaths, practiceJournal: journalEntries, customSkills, skillResources: personalResources, pathResources, preferences: { exploreCategory: category, pinnedMotivationId: pinnedMotivationId ?? '', displayName }, deletedPracticeSessions })
  }

  function downloadBackup(backup = currentBackup(), filePrefix = 'skillpath-backup') {
    if (Object.keys(storageProblems).length > 0) {
      setStorageNotice('Backup export is blocked while browser data needs recovery. The original raw values were preserved.')
      return
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${filePrefix}-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  function applyBackup(backup: SkillPathBackup, mode: 'merge' | 'replace') {
    const existingIds = new Set<string>()
    savedPaths.forEach((path) => existingIds.add(path.id))
    journalEntries.forEach((entry) => existingIds.add(entry.id))
    customSkills.forEach((skill) => existingIds.add(skill.id))
    Object.values(personalResources).flat().forEach((resource) => resource.id && existingIds.add(resource.id))
    Object.values(pathResources).flat().forEach((resource) => resource.id && existingIds.add(resource.id))
    const importedPathIds = new Set(backup.data.learningPaths.map((path) => path.id))
    const conflictingPathIds = new Set(backup.data.learningPaths.filter((path) => existingIds.has(path.id)).map((path) => path.id))
    const conflictingSkillIds = new Set(backup.data.customSkills.filter((skill) => existingIds.has(skill.id)).map((skill) => skill.id))
    const safePaths = backup.data.learningPaths.filter((path) => !conflictingPathIds.has(path.id))
    const safeJournals: JournalEntry[] = []
    backup.data.practiceJournal.forEach((entry) => {
      if (existingIds.has(entry.id) || (entry.pathId !== null && (conflictingPathIds.has(entry.pathId) || !importedPathIds.has(entry.pathId)))) return
      const matchesExistingJournal = journalEntries.some((existing) => journalEntriesRepresentSameSession(existing, entry))
        || savedPaths.some((path) => pathContainsJournalSession(path, entry))
      if (!matchesExistingJournal && !safeJournals.some((existing) => journalEntriesRepresentSameSession(existing, entry))) safeJournals.push(entry)
    })
    const safeSkills = backup.data.customSkills.filter((skill) => !conflictingSkillIds.has(skill.id)).map((skill) => ({ ...skill, category: normalizeSkillCategory(skill.category), color: skill.color || 'sage', icon: skill.icon || skill.visual || '✦', isCustom: true }))
    const safeSkillResources: Record<string, PersonalResource[]> = {}
    const safePathResources: Record<string, PersonalResource[]> = {}
    const usedImportedIds = new Set<string>()
    let skipped = backup.data.learningPaths.length - safePaths.length + backup.data.practiceJournal.length - safeJournals.length + backup.data.customSkills.length - safeSkills.length
    Object.entries(backup.data.skillResources).forEach(([skillId, resources]) => {
      if (conflictingSkillIds.has(skillId)) { skipped += resources.length; return }
      const safe = resources.filter((resource) => resource.id && !existingIds.has(resource.id) && !usedImportedIds.has(resource.id))
      skipped += resources.length - safe.length
      safe.forEach((resource) => usedImportedIds.add(resource.id!))
      if (safe.length) safeSkillResources[skillId] = safe
    })
    Object.entries(backup.data.pathResources).forEach(([pathId, resources]) => {
      if (conflictingPathIds.has(pathId)) { skipped += resources.length; return }
      const safe = resources.filter((resource) => resource.id && !existingIds.has(resource.id) && !usedImportedIds.has(resource.id))
      skipped += resources.length - safe.length
      safe.forEach((resource) => usedImportedIds.add(resource.id!))
      if (safe.length) safePathResources[pathId] = safe
    })
    const importedPaths = mode === 'replace' ? backup.data.learningPaths : [...savedPaths, ...safePaths]
    const importedJournal = mode === 'replace' ? backup.data.practiceJournal : [...journalEntries, ...safeJournals]
    const importedDeleted = backup.data.deletedPracticeSessions ?? {}
    const nextDeleted = mode === 'replace'
      ? importedDeleted
      : Object.fromEntries(Array.from(new Set([...Object.keys(deletedPracticeSessions), ...Object.keys(importedDeleted)])).map((pathId) => [pathId, [...new Set([...(deletedPracticeSessions[pathId] ?? []), ...(importedDeleted[pathId] ?? [])])]]))
    const synchronized = synchronizeLegacyPracticeSessions(importedPaths, importedJournal, new Date().toISOString(), nextDeleted)
    const nextPaths = synchronized.paths
    const nextJournal = synchronized.journal
    const nextSkills = mode === 'replace' ? backup.data.customSkills.map((skill) => ({ ...skill, category: normalizeSkillCategory(skill.category), color: skill.color || 'sage', icon: skill.icon || skill.visual || '✦', isCustom: true })) : [...customSkills, ...safeSkills]
    const nextSkillResources = mode === 'replace' ? backup.data.skillResources : { ...personalResources, ...safeSkillResources }
    const nextPathResources = mode === 'replace' ? backup.data.pathResources : { ...pathResources, ...safePathResources }
    const stored = writeStorageBatch({
      'skillpath-learning-paths': nextPaths,
      'skillpath-practice-journal': nextJournal,
      'skillpath-custom-skills': nextSkills,
      'skillpath-skill-resources': nextSkillResources,
      'skillpath-path-resources': nextPathResources,
      'skillpath-deleted-practice-sessions': nextDeleted,
    })
    if (!stored) return { ok: false, message: storageNotice || 'Import failed. Existing data was restored where possible.' }
    setSavedPaths(nextPaths)
    setJournalEntries(nextJournal)
    setCustomSkills(nextSkills)
    setPersonalResources(nextSkillResources)
    setPathResources(nextPathResources)
    setDeletedPracticeSessions(nextDeleted)
    setSelectedPath(null)
    if (typeof backup.data.preferences.exploreCategory === 'string') setCategory(backup.data.preferences.exploreCategory)
    if (backup.data.preferences.displayName !== undefined) {
      const nextName = normalizeDisplayName(backup.data.preferences.displayName)
      setDisplayName(nextName)
      try { localStorage.setItem(profileStorageKey, nextName) } catch { setStorageNotice('SkillPath data was imported, but the learner name could not be saved.') }
    }
    if (typeof backup.data.preferences.pinnedMotivationId === 'string') {
      const nextPinnedId = backup.data.preferences.pinnedMotivationId || null
      setPinnedMotivationId(nextPinnedId)
      try {
        if (nextPinnedId) localStorage.setItem(motivationStorageKey, nextPinnedId)
        else localStorage.removeItem(motivationStorageKey)
      } catch {
        setStorageNotice('SkillPath data was imported, but the pinned motivation preference could not be saved.')
      }
    }
    return { ok: true, message: mode === 'replace' ? 'Backup restored successfully.' : `Backup merged successfully. ${skipped} conflicting or unsafe records were skipped.` }
  }

  function setPinnedMotivation(id: string | null) {
    try {
      if (id) localStorage.setItem(motivationStorageKey, id)
      else localStorage.removeItem(motivationStorageKey)
      setPinnedMotivationId(id)
    } catch (error) {
      setStorageNotice(`Could not save the motivation preference. ${error instanceof Error ? error.message : 'The browser rejected this write.'}`)
    }

  }

  function updateDisplayName(value: string) {
    const nextName = normalizeDisplayName(value)
    try {
      localStorage.setItem(profileStorageKey, nextName)
      setDisplayName(nextName)
    } catch {
      setStorageNotice('The learner name could not be saved in this browser.')
    }
  }

  function existingRecordIds() {
    const ids = new Set<string>()
    savedPaths.forEach((item) => ids.add(item.id))
    journalEntries.forEach((item) => ids.add(item.id))
    customSkills.forEach((item) => ids.add(item.id))
    Object.values(personalResources).flat().forEach((item) => item.id && ids.add(item.id))
    Object.values(pathResources).flat().forEach((item) => item.id && ids.add(item.id))
    return ids
  }

  function startLearning(values: { goal: string; mode: 'empty' | 'suggested' | 'custom'; milestones: string[] }) {
    if (!startSkill) return
    const similar = savedPaths.find((path) => path.title.toLowerCase().includes(startSkill.title.toLowerCase()) || startSkill.title.toLowerCase().includes(path.title.toLowerCase()))
    if (similar && !window.confirm(`A similar learning path already exists: "${similar.title}". Create another intentionally?`)) return
    const milestoneTitles = values.mode === 'empty' ? [] : values.mode === 'suggested' ? startSkill.milestones : values.milestones.filter(Boolean)
    const now = new Date().toISOString()
    const path: SavedLearningPath = {
      id: `path-${Date.now()}`, title: values.goal.trim() ? `${startSkill.title}: ${values.goal.trim()}` : startSkill.title,
      description: values.goal.trim() || `A private learning path for ${startSkill.title}.`, category: startSkill.category,
      color: startSkill.color, icon: startSkill.visual ?? '✦', visibility: 'private', skillId: startSkill.id, goal: values.goal.trim() ? { id: `goal-${Date.now()}`, title: values.goal.trim(), description: '', targetDate: null } : null,
      milestones: milestoneTitles.map((title, index) => ({ id: `milestone-${Date.now()}-${index}`, title, description: 'A suggested starting milestone.', tasks: [{ id: `task-${Date.now()}-${index}`, title: `Practice: ${title}`, description: '', completed: false, completedAt: null }] })),
      practiceSessions: [], suggestedPracticeSessions: [], actualPracticeSessions: [], createdAt: now, updatedAt: now,
    }
    const next = [...savedPaths, path]
    if (!writeStorage('skillpath-learning-paths', next)) return
    setSavedPaths(next)
    setStartSkill(null)
    navigate({ page: 'My learning paths', pathId: path.id })
  }

  function addResource(skillId: string, resource: Skill['resources'][number]) {
    const next = { ...personalResources, [skillId]: [...(personalResources[skillId] ?? []), resource] }
    persistResources(next)
  }

  function updateResource(skillId: string, resource: Skill['resources'][number]) {
    const next = { ...personalResources, [skillId]: (personalResources[skillId] ?? []).map((item) => item.id === resource.id ? resource : item) }
    persistResources(next)
  }

  function deleteResource(skillId: string, resourceId: string) {
    if (!window.confirm('Delete this personal resource?')) return
    persistResources({ ...personalResources, [skillId]: (personalResources[skillId] ?? []).filter((item) => item.id !== resourceId) })
  }

  function saveCustomSkill(skill: Skill) {
    const categoryKey = normalizeSkillCategory(skill.category).toLowerCase()
    const existingCategory = [...catalogSkills, ...customSkills].find((item) => normalizeSkillCategory(item.category).toLowerCase() === categoryKey)?.category
    const savedSkill = { ...skill, category: existingCategory ?? normalizeSkillCategory(skill.category), icon: skill.icon ?? skill.visual ?? '✦', isCustom: true }
    const next = customSkills.some((item) => item.id === skill.id)
      ? customSkills.map((item) => item.id === skill.id ? savedSkill : item)
      : [...customSkills, savedSkill]
    if (!persistCustomSkills(next)) return
    if (selectedSkill?.id === skill.id) setSelectedSkill(savedSkill)
    setIsCreatingCustomSkill(false)
    setEditingSkill(null)
  }

  function deleteCustomSkill(skill: Skill) {
    if (!skill.isCustom) return
    const linkedPaths = savedPaths.filter((path) => path.skillId === skill.id)
    const skillResources = personalResources[skill.id] ?? []
    let nextPersonalResources = personalResources
    let nextPathResources = pathResources
    if (skillResources.length > 0) {
      if (linkedPaths.length > 0) {
        const preserve = window.confirm(`"${skill.title}" has ${skillResources.length} skill resource(s). Move them to the first of its ${linkedPaths.length} linked path(s) and preserve them? Choose Cancel to keep the skill.`)
        if (preserve) {
          nextPathResources = { ...pathResources }
          const targetPath = linkedPaths[0]
          const existingPathResources = nextPathResources[targetPath.id] ?? []
          nextPathResources[targetPath.id] = [...existingPathResources, ...skillResources.filter((resource) => !existingPathResources.some((existing) => existing.id && existing.id === resource.id))]
          nextPersonalResources = { ...personalResources }
          delete nextPersonalResources[skill.id]
        } else if (!window.confirm(`Delete "${skill.title}" and its ${skillResources.length} skill resource(s)? This cannot be undone. Choose Cancel to keep the skill.`)) {
          return
        } else {
          nextPersonalResources = { ...personalResources }
          delete nextPersonalResources[skill.id]
        }
      } else if (!window.confirm(`Delete "${skill.title}" and its ${skillResources.length} skill resource(s)? Choose Cancel to preserve the skill and resources.`)) {
        return
      } else {
        nextPersonalResources = { ...personalResources }
        delete nextPersonalResources[skill.id]
      }
    } else if (!window.confirm(`Delete custom skill "${skill.title}"? Existing learning paths and journal history will be preserved and detached from this catalog skill.`)) {
      return
    }
    const nextPaths = detachSkillFromPaths(savedPaths, skill.id, new Date().toISOString())
    if (!writeStorageBatch({
      'skillpath-custom-skills': customSkills.filter((item) => item.id !== skill.id),
      'skillpath-learning-paths': nextPaths,
      'skillpath-skill-resources': nextPersonalResources,
      'skillpath-path-resources': nextPathResources,
    })) return
    setCustomSkills(customSkills.filter((item) => item.id !== skill.id))
    setSavedPaths(nextPaths)
    setPersonalResources(nextPersonalResources)
    setPathResources(nextPathResources)
    setSelectedSkill(null)
    navigate({ page: 'Explore Skills' })
  }

  function createManualPath(values: { title: string; category: string; description: string; firstTask: string }) {
    const now = new Date().toISOString()
    const path: SavedLearningPath = {
      id: `path-${Date.now()}`,
      title: values.title.trim(),
      description: values.description.trim() || `A personal ${values.category.toLowerCase()} learning path.`,
      category: values.category.trim() || 'Personal',
      color: 'green',
      icon: '✦',
      visibility: 'private',
      goal: null,
      milestones: [{
        id: `milestone-${Date.now()}`,
        title: 'First milestone',
        description: 'Start with one small, achievable step.',
        tasks: [{
          id: `task-${Date.now()}`,
          title: values.firstTask.trim() || 'Choose the first step',
          description: '',
          completed: false,
          completedAt: null,
        }],
      }],
      practiceSessions: [],
      suggestedPracticeSessions: [],
      actualPracticeSessions: [],
      createdAt: now,
      updatedAt: now,
    }
    const next = [...savedPaths, path]
    if (!writeStorage('skillpath-learning-paths', next)) return
    setSavedPaths(next)
    setIsCreatingPath(false)
    navigate({ page: 'My learning paths', pathId: path.id })
  }

  function updateSavedPath(updatedPath: SavedLearningPath) {
    const next = savedPaths.map((path) => path.id === updatedPath.id ? updatedPath : path)
    if (!writeStorage('skillpath-learning-paths', next)) return
    setSavedPaths(next)
    setSelectedPath(updatedPath)
  }

  function deleteSavedPath(pathId: string) {
    const path = savedPaths.find((item) => item.id === pathId)
    if (!path || !window.confirm(`Delete "${path.title}"? This cannot be undone.`)) return
    const linkedResources = pathResources[pathId] ?? []
    let nextPersonalResources = personalResources
    let nextPathResources = pathResources
    if (linkedResources.length > 0) {
      const keep = path.skillId
        ? window.confirm(`This path has ${linkedResources.length} path-only resource(s). Keep them by moving them to the linked skill? Choose Cancel to choose another option.`)
        : false
      if (keep && path.skillId) {
        nextPersonalResources = { ...personalResources, [path.skillId]: [...(personalResources[path.skillId] ?? []), ...linkedResources] }
        nextPathResources = removePathResources(pathResources, pathId)
      } else if (!window.confirm(`Delete ${linkedResources.length} path-only resource(s) with this path? Choose Cancel to keep the path and its resources.`)) {
        return
      } else {
        nextPathResources = removePathResources(pathResources, pathId)
      }
    }
    const nextPaths = savedPaths.filter((item) => item.id !== pathId)
    const nextJournal = journalEntries.map((entry) => entry.pathId === pathId ? { ...entry, pathId: null, updatedAt: new Date().toISOString() } : entry)
    if (!writeStorageBatch({
      'skillpath-learning-paths': nextPaths,
      'skillpath-practice-journal': nextJournal,
      'skillpath-path-resources': nextPathResources,
      'skillpath-skill-resources': nextPersonalResources,
    })) return
    setSavedPaths(nextPaths)
    setJournalEntries(nextJournal)
    setPathResources(nextPathResources)
    setPersonalResources(nextPersonalResources)
    navigate({ page: 'My learning paths' })
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">S</div><span>SkillPath</span></div>
        <nav className="side-nav" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {navigationItems.map((item) => (
            <button className={`nav-item ${activePage === item.label ? 'active' : ''}`} key={item.label} onClick={() => navigate({ page: item.label })} type="button">
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card"><span className="local-dot" /><div><strong>Local mode</strong><span>Private to this browser</span></div></div>
          <button className="nav-item" onClick={() => navigate({ page: 'Settings' })} type="button"><span className="nav-icon" aria-hidden="true">⚙</span>Settings</button>
          <div className="profile"><div className="avatar">{displayName.charAt(0).toUpperCase()}</div><div><strong>{displayName}</strong><span>Keep growing</span></div></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => navigate({ page: 'Dashboard' })} type="button"><span className="brand-mark">S</span><strong>SkillPath</strong></button>
          <div className="breadcrumb"><span>Workspace</span><span>/</span><strong>{selectedSkill?.title ?? activePage}</strong></div>
          <button className="help-button" onClick={() => setShowHelp(true)} type="button" aria-label="Help">?</button>
        </header>

        <div className="page-content">
          {Object.keys(storageProblems).length > 0 && <div className="storage-warning" role="alert"><strong>Browser data needs recovery.</strong> Some stored values are malformed or unreadable, so affected writes are blocked to protect the raw data. {Object.keys(storageProblems).join(', ')}</div>}
          {storageNotice && <div className="storage-warning" role="status">{storageNotice}</div>}
          {activePage === 'Explore Skills' ? (
            selectedSkill ? (
              <SkillDetail skill={selectedSkill} personalResources={personalResources[selectedSkill.id] ?? []} onBack={openExplore} onStart={() => setStartSkill(selectedSkill)} onEdit={selectedSkill.isCustom ? () => setEditingSkill(selectedSkill) : undefined} onDelete={selectedSkill.isCustom ? () => deleteCustomSkill(selectedSkill) : undefined} onAddResource={(resource) => addResource(selectedSkill.id, resource)} onUpdateResource={(resource) => updateResource(selectedSkill.id, resource)} onDeleteResource={(id) => deleteResource(selectedSkill.id, id)} />
            ) : (
              <ExploreSkills skills={filteredSkills} categories={categories} category={category} search={search} onCategoryChange={setCategory} onSearchChange={setSearch} onSelect={(skill) => navigate({ page: 'Explore Skills', skillId: skill.id })} onEdit={(skill) => setEditingSkill(skill)} onDelete={deleteCustomSkill} onCreateCustom={() => setIsCreatingCustomSkill(true)} />
            )
          ) : activePage === 'AI Learning Planner' ? (
            <AIPlanner inputs={plannerInputs} onInputsChange={setPlannerInputs} onSaved={(path) => { const next = [...savedPaths, path]; if (writeStorage('skillpath-learning-paths', next)) setSavedPaths(next) }} />
          ) : activePage === 'My learning paths' ? (
            selectedPath ? <SavedPathDetail key={selectedPath.id} path={selectedPath} journalEntries={journalEntries.filter((entry) => entry.pathId === selectedPath.id)} skill={allSkills.find((item) => item.id === selectedPath.skillId)} skillOptions={allSkills} skillResources={selectedPath.skillId ? personalResources[selectedPath.skillId] ?? [] : []} pathResources={pathResources[selectedPath.id] ?? []} onBack={openMyLearning} onUpdate={updateSavedPath} onAssociate={(skillId) => updateSavedPath({ ...selectedPath, skillId })} onAddSkillResource={(resource) => selectedPath.skillId && addResource(selectedPath.skillId, resource)} onUpdateSkillResource={(resource) => selectedPath.skillId && updateResource(selectedPath.skillId, resource)} onDeleteSkillResource={(resourceId) => selectedPath.skillId && deleteResource(selectedPath.skillId, resourceId)}             onAddPractice={(session) => { addJournalEntry({ id: session.id, pathId: selectedPath.id, date: session.date, type: 'independent', durationMinutes: session.durationMinutes, notes: session.notes, taskId: session.taskId, achievements: '', difficulties: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) }} onAddPathResource={(resource) => persistPathResources({ ...pathResources, [selectedPath.id]: [...(pathResources[selectedPath.id] ?? []), resource] })} onUpdatePathResource={(resource) => persistPathResources({ ...pathResources, [selectedPath.id]: (pathResources[selectedPath.id] ?? []).map((item) => item.id === resource.id ? resource : item) })} onDeletePathResource={(resourceId) => { if (window.confirm('Delete this path resource?')) persistPathResources({ ...pathResources, [selectedPath.id]: (pathResources[selectedPath.id] ?? []).filter((item) => item.id !== resourceId) }) }} /> : <MyLearningPaths paths={savedPaths} onOpen={(path) => navigate({ page: 'My learning paths', pathId: path.id })} onEdit={setEditingPath} onDelete={deleteSavedPath} />
          ) : activePage === 'Practice journal' ? (
            <PracticeJournal entries={journalEntries} paths={savedPaths} onCreate={addJournalEntry} onUpdate={updateJournalEntry} onDelete={deleteJournalEntry} />
          ) : activePage === 'Settings' ? (
            <SettingsPage key={displayName} existingIds={existingRecordIds()} displayName={displayName} onDisplayNameChange={updateDisplayName} onExport={() => downloadBackup()} onImport={applyBackup} />
          ) : activePage === 'Dashboard' ? (
            <Dashboard paths={savedPaths} journalEntries={journalEntries} displayName={displayName} pinnedMotivationId={pinnedMotivationId} onPinMotivation={setPinnedMotivation} onExplore={openExplore} onViewAll={openMyLearning} onCreate={() => setIsCreatingPath(true)} onOpenPath={(path) => navigate({ page: 'My learning paths', pathId: path.id })} onOpenJournal={() => navigate({ page: 'Practice journal' })} />
          ) : (
            <Dashboard paths={savedPaths} journalEntries={journalEntries} displayName={displayName} pinnedMotivationId={pinnedMotivationId} onPinMotivation={setPinnedMotivation} onExplore={openExplore} onViewAll={openMyLearning} onCreate={() => setIsCreatingPath(true)} onOpenPath={(path) => navigate({ page: 'My learning paths', pathId: path.id })} onOpenJournal={() => navigate({ page: 'Practice journal' })} />
          )}
        </div>
        <nav className="mobile-nav" aria-label="Mobile navigation">{navigationItems.map((item) => <button className={`mobile-nav-item ${activePage === item.label ? 'active' : ''}`} key={item.label} onClick={() => navigate({ page: item.label })} type="button"><span aria-hidden="true">{item.icon}</span><small>{item.label === 'AI Learning Planner' ? 'Planner' : item.label === 'My learning paths' ? 'Learning' : item.label.replace(' Skills', '')}</small></button>)}<button className={`mobile-nav-item ${activePage === 'Settings' ? 'active' : ''}`} onClick={() => navigate({ page: 'Settings' })} type="button"><span aria-hidden="true">⚙</span><small>Settings</small></button></nav>
      </main>
      {isCreatingPath && <ManualPathForm onCancel={() => setIsCreatingPath(false)} onCreate={createManualPath} />}
      {editingPath && <EditPathForm path={editingPath} onCancel={() => setEditingPath(null)} onSave={(values) => { updateSavedPath({ ...editingPath, ...values, id: editingPath.id, skillId: editingPath.skillId, milestones: editingPath.milestones, practiceSessions: editingPath.practiceSessions, suggestedPracticeSessions: editingPath.suggestedPracticeSessions, actualPracticeSessions: editingPath.actualPracticeSessions, resources: editingPath.resources, createdAt: editingPath.createdAt, updatedAt: new Date().toISOString() }); setEditingPath(null) }} />}
      {startSkill && <StartLearningForm skill={startSkill} onCancel={() => setStartSkill(null)} onStart={startLearning} />}
      {isCreatingCustomSkill && <CustomSkillForm categories={categories.filter((item) => item !== 'All')} onCancel={() => setIsCreatingCustomSkill(false)} onCreate={saveCustomSkill} />}
      {editingSkill && <CustomSkillForm key={editingSkill.id} categories={categories.filter((item) => item !== 'All')} initialSkill={editingSkill} onCancel={() => setEditingSkill(null)} onCreate={saveCustomSkill} />}
      {showHelp && <HelpPanel page={activePage} onClose={() => setShowHelp(false)} />}
    </div>
  )
}

function getDailyMotivationId(date = new Date()) {
  const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
  let hash = 0
  for (const character of dateKey) hash = (hash * 31 + character.charCodeAt(0)) % motivations.length
  return `motivation-${hash}`
}

function Dashboard({ paths, journalEntries, displayName, pinnedMotivationId, onPinMotivation, onExplore, onViewAll, onCreate, onOpenPath, onOpenJournal }: { paths: SavedLearningPath[]; journalEntries: JournalEntry[]; displayName: string; pinnedMotivationId: string | null; onPinMotivation: (id: string | null) => void; onExplore: () => void; onViewAll: () => void; onCreate: () => void; onOpenPath: (path: SavedLearningPath) => void; onOpenJournal: () => void }) {
  const [practicePeriod, setPracticePeriod] = useState<PracticePeriod>('all')
  const totalTasks = paths.reduce((total, path) => total + path.milestones.reduce((count, milestone) => count + milestone.tasks.length, 0), 0)
  const completedTasks = paths.reduce((total, path) => total + path.milestones.reduce((count, milestone) => count + milestone.tasks.filter((task) => task.completed).length, 0), 0)
  const filteredPractice = journalEntries.filter((entry) => entry.durationMinutes > 0 && isPracticeDateInPeriod(entry.date, practicePeriod))
  const practiceMinutes = filteredPractice.reduce((total, entry) => total + entry.durationMinutes, 0)
  const periodLabel = practicePeriod === 'day' ? 'Today' : practicePeriod === 'week' ? 'This week · Monday–Sunday' : practicePeriod === 'month' ? 'This month' : 'All time'
  const nextTasks = paths.flatMap((path) => path.milestones.flatMap((milestone) => milestone.tasks.filter((task) => !task.completed).map((task) => ({ path, task }))))
  const now = new Date()
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now)
  const greeting = getTimeGreeting(now)
  const dailyMotivationId = getDailyMotivationId()
  const motivationId = pinnedMotivationId ?? dailyMotivationId
  const motivationIndex = Number(motivationId.replace('motivation-', ''))
  const motivation = Number.isInteger(motivationIndex) && motivationIndex >= 0 && motivationIndex < motivations.length ? motivations[motivationIndex] : motivations[Number(dailyMotivationId.replace('motivation-', ''))]
  const isPinned = pinnedMotivationId !== null
  return (
    <>
      <section className="welcome-row">
        <div><p className="eyebrow">{dateLabel}</p><h1>{greeting}, {displayName} <span aria-hidden="true">✦</span></h1><p className="welcome-copy">A little progress every day adds up to something remarkable.</p></div>
        <button className="primary-button" onClick={onCreate} type="button"><span aria-hidden="true">+</span> New learning path</button>
      </section>
      <section className="inspiration-strip" aria-label="Daily motivation"><div className="inspiration-art" aria-hidden="true"><span className="sun-shape" /><span className="leaf-shape leaf-one" /><span className="leaf-shape leaf-two" /><span className="book-shape" /></div><div><span className="inspiration-label">Daily motivation</span><p>{motivation}</p></div><button className="motivation-pin" onClick={() => onPinMotivation(isPinned ? null : motivationId)} type="button" aria-pressed={isPinned}>{isPinned ? 'Unpin' : 'Pin'} <span aria-hidden="true">{isPinned ? '★' : '☆'}</span></button></section>
      <section className="stats-heading"><div><span className="eyebrow">Practice period</span><strong>{periodLabel}</strong><small>Based on actual Practice Journal entries; zero-minute reflections are excluded.</small></div><div className="period-selector" role="group" aria-label="Practice time period">{(['day', 'week', 'month', 'all'] as PracticePeriod[]).map((period) => <button className={practicePeriod === period ? 'active' : ''} key={period} onClick={() => setPracticePeriod(period)} type="button">{period === 'day' ? 'Day' : period === 'week' ? 'Week' : period === 'month' ? 'Month' : 'All time'}</button>)}</div></section>
      <section className="stats-grid" aria-label="Learning overview"><article className="stat-card"><div className="stat-icon peach">◎</div><div><span>Active paths</span><strong>{paths.length}</strong></div><span className="stat-note">saved locally</span></article><article className="stat-card"><div className="stat-icon lavender">✓</div><div><span>Tasks completed</span><strong>{completedTasks}</strong></div><span className="stat-note">of {totalTasks} total</span></article><article className="stat-card"><div className="stat-icon mint">◷</div><div><span>Practice time · {periodLabel}</span><strong>{formatDuration(practiceMinutes)}</strong></div><span className="stat-note">{practiceMinutes ? 'actual practice' : 'not tracked'}</span></article></section>
      <section className="section-heading"><div><h2>Your learning paths</h2><p>{paths.length ? 'Keep your momentum going.' : 'Your saved paths will appear here.'}</p></div><button className="text-button" onClick={onViewAll} type="button">View all <span aria-hidden="true">→</span></button></section>
      {paths.length === 0 ? <div className="empty-state dashboard-empty"><h2>No learning paths yet</h2><p>Create a path manually or generate one with AI Learning Planner.</p><button className="secondary-button" onClick={onCreate} type="button">Create your first path <span aria-hidden="true">→</span></button></div> : <section className="paths-grid" aria-label="Saved learning paths">{paths.map((path) => { const tasks = path.milestones.flatMap((milestone) => milestone.tasks); const progress = getProgress(tasks); const nextTask = tasks.find((task) => !task.completed); return <article className="path-card" key={path.id}><div className={`path-visual ${path.color}`} aria-hidden="true"><span className="visual-orbit" /><span className="path-icon">{path.icon}</span></div><div className="path-card-top"><span className="category">{path.category}</span></div><h3>{path.title}</h3><p className="path-description">{path.description}</p><div className="progress-meta"><span>Progress</span><strong>{progress}%</strong></div><div className="progress-track"><div className={`progress-fill ${path.color}`} style={{ width: `${progress}%` }} /></div><div className="path-footer"><span><span className="tiny-check">✓</span> {tasks.filter((task) => task.completed).length}/{tasks.length} tasks</span><span className="next-label">{nextTask ? <>Next: <strong>{nextTask.title}</strong></> : 'Complete'}</span><button className="text-button" onClick={() => onOpenPath(path)} type="button">Open <span aria-hidden="true">→</span></button></div></article> })}</section>}
      <section className="explore-callout"><div><span className="eyebrow">Find your next curiosity</span><h2>Explore skills made for your kind of learning.</h2><p>Browse music, crafts, languages, movement and technology.</p></div><button className="secondary-button" onClick={onExplore} type="button">Explore skills <span aria-hidden="true">→</span></button></section>
      <section className="lower-grid"><article className="panel"><div className="panel-heading"><div><h2>Up next</h2><p>{nextTasks.length ? 'Small steps for today.' : 'No incomplete tasks yet.'}</p></div><button className="text-button" onClick={onViewAll} type="button">See all <span aria-hidden="true">→</span></button></div>{nextTasks.length ? nextTasks.slice(0, 3).map(({ path, task }) => <div className="task-row" key={`${path.id}-${task.id}`}><div className="task-circle" /><div><strong>{task.title}</strong><span>{path.title}</span></div><span className="task-date">Next</span></div>) : <div className="empty-state"><p>Complete a task in My Learning to see it here.</p><button className="secondary-button" onClick={onViewAll} type="button">Open My Learning <span aria-hidden="true">→</span></button></div>}</article><article className="panel practice-panel"><div className="panel-heading"><div><h2>Practice journal</h2><p>{practiceMinutes ? `${formatDuration(practiceMinutes)} of actual practice recorded.` : 'No actual practice recorded yet.'}</p></div></div><div className="empty-state"><p>AI-suggested sessions are kept separate and are not counted.</p>      <button className="secondary-button" onClick={onOpenJournal} type="button">Open practice journal <span aria-hidden="true">→</span></button></div></article></section>
    </>
  )
}

function SettingsPage({ existingIds, displayName, onDisplayNameChange, onExport, onImport }: { existingIds: Set<string>; displayName: string; onDisplayNameChange: (value: string) => void; onExport: () => void; onImport: (backup: SkillPathBackup, mode: 'merge' | 'replace') => { ok: boolean; message: string } }) {
  const [preview, setPreview] = useState<SkillPathBackup | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isReading, setIsReading] = useState(false)
  const [nameDraft, setNameDraft] = useState(displayName)
  const [nameStatus, setNameStatus] = useState('')

  function saveName() {
    const nextName = normalizeDisplayName(nameDraft)
    setNameDraft(nextName)
    onDisplayNameChange(nextName)
    setNameStatus('Display name saved.')
  }

  function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setIsReading(true)
    setError('')
    setMessage('')
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const result = validateBackup(JSON.parse(String(reader.result)))
        if (result.error) { setPreview(null); setError(result.error) } else setPreview(result.backup ?? null)
      } catch { setPreview(null); setError('The selected file is not valid JSON.') }
      setIsReading(false)
    }
    reader.onerror = () => { setIsReading(false); setError('The backup file could not be read.') }
    reader.readAsText(file)
  }

  function conflictCount() {
    if (!preview) return 0
    const ids = [...preview.data.learningPaths.map((item) => item.id), ...preview.data.practiceJournal.map((item) => item.id), ...preview.data.customSkills.map((item) => item.id), ...Object.values(preview.data.skillResources).flat().map((item) => item.id), ...Object.values(preview.data.pathResources).flat().map((item) => item.id)].filter(Boolean) as string[]
    return ids.filter((id) => existingIds.has(id)).length
  }

  function importBackup(mode: 'merge' | 'replace') {
    if (!preview) return
    if (mode === 'replace' && !window.confirm('Replace SkillPath data? Export the current data first, then confirm again to continue.')) return
    if (mode === 'replace') onExport()
    if (!window.confirm(mode === 'replace' ? 'I understand this replaces SkillPath data while preserving unrelated browser storage.' : 'Merge this backup without replacing existing records? Conflicts will be skipped.')) return
    const result = onImport(preview, mode)
    setMessage(result.message)
    if (result.ok) setPreview(null)
  }

  return <section className="settings-page"><section className="explore-header"><div><p className="eyebrow">Your local workspace</p><h1>Settings <span aria-hidden="true">⚙</span></h1><p className="welcome-copy">Understand and protect the data stored in this browser.</p></div></section><div className="settings-grid"><article className="detail-panel"><span className="eyebrow">Learner profile</span><h2>How should SkillPath greet you?</h2><label className="profile-name-field">Display name<input value={nameDraft} maxLength={60} onChange={(event) => { setNameDraft(event.target.value); setNameStatus('') }} onBlur={saveName} /></label><button className="secondary-button" onClick={saveName} type="button">Save display name</button>{nameStatus && <p className="resource-success" role="status">{nameStatus}</p>}<p className="section-help">This optional name stays in this browser and is included in SkillPath backups. Leave it blank to use Learner.</p><span className="eyebrow">Local Mode</span><h2>Private to this browser</h2><p>SkillPath stores learning paths, journal entries, custom skills and resources in this browser's localStorage. It is not cloud-synced and is not an account or secure multi-user database.</p><p>Public visibility does not publish a path online in Local Mode. It is only a saved setting until a future server-backed sharing feature exists.</p><h2>Privacy</h2><p>Backups contain your SkillPath data only. API keys, .env files, server settings and secrets are never read or exported.</p></article><article className="detail-panel backup-panel"><span className="eyebrow">Data backup</span><h2>Export your data</h2><p>Download a versioned JSON backup with its creation date before changing devices or importing another backup.</p><button className="primary-button" onClick={onExport} type="button">Download JSON backup</button><h2>Import a backup</h2><p>Files are validated locally, including record relationships, before any write occurs.</p><label className="file-button secondary-button">Choose JSON backup<input type="file" accept="application/json,.json" onChange={readFile} /></label>{isReading && <p className="section-help">Reading backup…</p>}{error && <p className="planner-error" role="alert">{error}</p>}{message && <p className="resource-success" role="status">{message}</p>}{preview && <div className="backup-preview"><strong>Backup preview</strong><span>Created {new Date(preview.createdAt).toLocaleString()}</span><span>{preview.data.learningPaths.length} paths · {preview.data.practiceJournal.length} journal entries</span><span>{preview.data.customSkills.length} custom skills · {countResources(preview.data.skillResources)} skill resources</span><span>{countResources(preview.data.pathResources)} path resources · {conflictCount()} existing ID conflicts</span><p>Merge preserves existing records and skips conflicts. Replace restores only SkillPath keys after exporting current data; unrelated localStorage keys remain untouched.</p><div className="manual-path-actions"><button className="secondary-button" onClick={() => importBackup('merge')} type="button">Merge safely</button><button className="delete-button" onClick={() => importBackup('replace')} type="button">Export and replace</button></div></div>}</article></div></section>
}

function HelpPanel({ page, onClose }: { page: View; onClose: () => void }) {
  const help: Record<View, { title: string; text: string }> = {
    Dashboard: { title: 'Dashboard help', text: 'Dashboard totals come from saved paths and actual Practice Journal entries. AI suggestions are not counted as completed practice.' },
    'Explore Skills': { title: 'Explore Skills help', text: 'Search or filter the catalog, open a skill, add private resources, and Start Learning with an empty, suggested or custom path.' },
    'AI Learning Planner': { title: 'AI Learning Planner help', text: 'AI is optional. Review and edit a generated preview before approving it. Your API key stays on the server and is never exported.' },
    'My learning paths': { title: 'My Learning help', text: 'Open a path to learn, complete tasks, log practice and manage resources. Edit changes path details only; Delete requires confirmation.' },
    'Practice journal': { title: 'Practice Journal help', text: 'Record lessons, independent practice or reflections. Only actual journal durations contribute to Dashboard Practice Time.' },
    Settings: { title: 'Privacy and backup help', text: 'Local Mode is browser-only and not cloud-synced. Export JSON backups regularly. Public visibility does not publish online in Local Mode.' },
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="manual-path-modal panel help-panel" role="dialog" aria-modal="true" aria-labelledby="help-title"><div className="panel-heading"><div><span className="eyebrow">SkillPath guide</span><h2 id="help-title">{help[page].title}</h2></div><button className="close-button" onClick={onClose} type="button" aria-label="Close help">×</button></div><p>{help[page].text}</p><p>Need a full backup? Open Settings to validate, preview and safely merge or replace supported SkillPath data.</p><button className="secondary-button" onClick={onClose} type="button">Close help</button></section></div>
}

function ManualPathForm({ onCancel, onCreate }: { onCancel: () => void; onCreate: (values: { title: string; category: string; description: string; firstTask: string }) => void }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Personal')
  const [description, setDescription] = useState('')
  const [firstTask, setFirstTask] = useState('')

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}><section className="manual-path-modal panel" role="dialog" aria-modal="true" aria-labelledby="manual-path-title"><div className="panel-heading"><div><span className="eyebrow">A simple beginning</span><h2 id="manual-path-title">Create a learning path</h2><p>Start privately and add more milestones later.</p></div><button className="close-button" onClick={onCancel} type="button" aria-label="Close">×</button></div><form className="manual-path-form" onSubmit={(event) => { event.preventDefault(); if (title.trim()) onCreate({ title, category, description, firstTask }) }}><label>Path name<input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Learn guitar" /></label><label>Category<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="e.g. Music" /></label><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="What would you like to learn?" /></label><label>First task<input value={firstTask} onChange={(event) => setFirstTask(event.target.value)} placeholder="e.g. Find a beginner lesson" /></label><div className="manual-path-actions"><button className="secondary-button" onClick={onCancel} type="button">Cancel</button><button className="primary-button" type="submit">Create privately</button></div></form></section></div>
}

function PracticeJournal({ entries, paths, onCreate, onUpdate, onDelete }: { entries: JournalEntry[]; paths: SavedLearningPath[]; onCreate: (entry: JournalEntry) => void; onUpdate: (entry: JournalEntry) => void; onDelete: (entryId: string) => void }) {
  const [filterPath, setFilterPath] = useState('all')
  const [filterType, setFilterType] = useState<'all' | PracticeType>('all')
  const [practicePeriod, setPracticePeriod] = useState<PracticePeriod>('all')
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null)
  const [isEntryFormOpen, setIsEntryFormOpen] = useState(false)
  const visibleEntries = [...entries].filter((entry) => (filterPath === 'all' || entry.pathId === filterPath) && (filterType === 'all' || entry.type === filterType) && isPracticeDateInPeriod(entry.date, practicePeriod)).sort((a, b) => `${b.date}-${b.createdAt}`.localeCompare(`${a.date}-${a.createdAt}`))
  const totalMinutes = entries.filter((entry) => entry.durationMinutes > 0 && isPracticeDateInPeriod(entry.date, practicePeriod)).reduce((total, entry) => total + entry.durationMinutes, 0)
  const periodLabel = practicePeriod === 'day' ? 'Today' : practicePeriod === 'week' ? 'This week · Monday–Sunday' : practicePeriod === 'month' ? 'This month' : 'All time'

  function saveEntry(entry: JournalEntry) {
    if (editingEntry) onUpdate(entry)
    else onCreate(entry)
    setEditingEntry(null)
    setIsEntryFormOpen(false)
  }

  return <><section className="explore-header"><div><p className="eyebrow">Your real practice record</p><h1>Practice journal <span aria-hidden="true">▤</span></h1><p className="welcome-copy">Record lessons, independent practice and reflections in one place.</p></div></section><section className="journal-summary panel"><div><span className="eyebrow">Actual time · {periodLabel}</span><strong>{formatDuration(totalMinutes)}</strong><p>Actual Practice Journal time only; suggested sessions and zero-minute reflections are excluded.</p></div><div className="period-selector" role="group" aria-label="Journal time period">{(['day', 'week', 'month', 'all'] as PracticePeriod[]).map((period) => <button className={practicePeriod === period ? 'active' : ''} key={period} onClick={() => setPracticePeriod(period)} type="button">{period === 'day' ? 'Day' : period === 'week' ? 'Week' : period === 'month' ? 'Month' : 'All time'}</button>)}</div><button className="primary-button" onClick={() => { setEditingEntry(null); setIsEntryFormOpen(true) }} type="button">+ Add journal entry</button></section><section className={`journal-layout ${isEntryFormOpen ? 'form-open' : ''}`}>{isEntryFormOpen && <article className="panel journal-entry-editor"><div className="panel-heading"><div><h2>{editingEntry ? 'Edit entry' : 'New entry'}</h2><p>Capture what happened during your learning.</p></div><button className="close-button" onClick={() => { setEditingEntry(null); setIsEntryFormOpen(false) }} type="button" aria-label="Close journal entry form">×</button></div><JournalEntryForm key={editingEntry?.id ?? 'new'} entry={editingEntry} paths={paths} onCancel={() => { setEditingEntry(null); setIsEntryFormOpen(false) }} onSave={saveEntry} /></article>}<article className="panel journal-history-panel"><div className="panel-heading"><div><h2>History</h2><p>{visibleEntries.length} {visibleEntries.length === 1 ? 'entry' : 'entries'} · {periodLabel}</p></div></div><div className="journal-filters"><select value={filterPath} onChange={(event) => setFilterPath(event.target.value)} aria-label="Filter by learning path"><option value="all">All learning paths</option>{paths.map((path) => <option key={path.id} value={path.id}>{path.title}</option>)}</select><select value={filterType} onChange={(event) => setFilterType(event.target.value as 'all' | PracticeType)} aria-label="Filter by session type"><option value="all">All types</option><option value="lesson">Lessons</option><option value="independent">Independent practice</option><option value="reflection">Reflections</option></select></div>{visibleEntries.length === 0 ? <div className="empty-state"><p>No journal entries match these filters.</p></div> : <div className="journal-history">{visibleEntries.map((entry) => <article className="journal-entry" key={entry.id}><div className="journal-entry-top"><span className="category">{entry.type}</span><time dateTime={entry.date}>{entry.date}</time></div><strong>{entry.notes || 'No notes added.'}</strong>{entry.pathId ? <span className="journal-path">{paths.find((path) => path.id === entry.pathId)?.title ?? 'Saved learning path'}</span> : <span className="journal-path">General learning</span>}<div className="journal-entry-details"><span>{formatDuration(entry.durationMinutes)}</span>{entry.achievements && <span>Achievement: {entry.achievements}</span>}{entry.difficulties && <span>Difficulty: {entry.difficulties}</span>}</div><div className="journal-entry-actions"><button className="text-button" onClick={() => { setEditingEntry(entry); setIsEntryFormOpen(true) }} type="button">Edit</button><button className="delete-button" onClick={() => onDelete(entry.id)} type="button">Delete</button></div></article>)}</div>}</article></section></>
}

function JournalEntryForm({ entry, paths, onCancel, onSave }: { entry: JournalEntry | null; paths: SavedLearningPath[]; onCancel: () => void; onSave: (entry: JournalEntry) => void }) {
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const [date, setDate] = useState(entry?.date ?? localDateKey(new Date()))
  const [pathId, setPathId] = useState(entry?.pathId ?? '')
  const [type, setType] = useState<PracticeType>(entry?.type ?? 'independent')
  const [duration, setDuration] = useState(String(entry?.durationMinutes ?? 20))
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [achievements, setAchievements] = useState(entry?.achievements ?? '')
  const [difficulties, setDifficulties] = useState(entry?.difficulties ?? '')
  const [error, setError] = useState('')

  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const durationMinutes = Number(duration)
    if (!date || !Number.isInteger(durationMinutes) || durationMinutes < 0 || (type !== 'reflection' && durationMinutes === 0)) {
      setError(type === 'reflection' ? 'Enter a valid duration of zero or more minutes.' : 'Enter a duration greater than zero.')
      return
    }
    const now = new Date().toISOString()
    onSave({ id: entry?.id ?? `journal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, pathId: pathId || null, date, type, durationMinutes, notes: notes.trim(), achievements: achievements.trim(), difficulties: difficulties.trim(), createdAt: entry?.createdAt ?? now, updatedAt: now })
    setError('')
  }

  return <form className="journal-entry-form" onSubmit={submit}><label>Date<input ref={firstFieldRef} type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>Learning path<select value={pathId} onChange={(event) => setPathId(event.target.value)}><option value="">No specific path</option>{paths.map((path) => <option key={path.id} value={path.id}>{path.title}</option>)}</select></label><label>Type<select value={type} onChange={(event) => setType(event.target.value as PracticeType)}><option value="lesson">Lesson</option><option value="independent">Independent practice</option><option value="reflection">Reflection</option></select></label><label>Actual duration (minutes)<input type="number" min="0" step="1" value={duration} onChange={(event) => setDuration(event.target.value)} /><small>Reflections may be zero minutes.</small></label><label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="What did you work on?" /></label><label>Achievements<textarea value={achievements} onChange={(event) => setAchievements(event.target.value)} rows={2} placeholder="What went well?" /></label><label>Difficulties<textarea value={difficulties} onChange={(event) => setDifficulties(event.target.value)} rows={2} placeholder="What felt challenging?" /></label>{error && <p className="planner-error" role="alert">{error}</p>}<div className="manual-path-actions"><button className="secondary-button" onClick={onCancel} type="button">Cancel</button><button className="primary-button" type="submit">{entry ? 'Save changes' : 'Save entry'}</button></div></form>
}

function ResourceForm({ resource, onSave }: { resource?: Skill['resources'][number] | null; onSave: (resource: Skill['resources'][number]) => void }) {
  const [label, setLabel] = useState(resource?.label ?? '')
  const [url, setUrl] = useState(resource?.url ?? '')
  const [type, setType] = useState(resource?.type ?? 'Book')
  const [notes, setNotes] = useState(resource?.notes ?? '')
  const [notice, setNotice] = useState('')
  return <form className="resource-form" onSubmit={(event) => { event.preventDefault(); const trimmedUrl = url.trim(); if (!label.trim()) return; if (trimmedUrl && !isSafeResourceUrl(trimmedUrl)) { setNotice('Use an http:// or https:// URL, or leave this resource offline.'); return } onSave({ id: resource?.id ?? `resource-${Date.now()}`, label: label.trim(), url: trimmedUrl || undefined, type, notes: notes.trim() }); setNotice(resource ? 'Resource updated and saved in this browser.' : 'Resource added and saved in this browser.'); if (!resource) { setLabel(''); setUrl(''); setNotes('') } }}><input required value={label} onChange={(event) => { setNotice(''); setLabel(event.target.value) }} placeholder="Title, teacher or course" /><input value={url} onChange={(event) => { setNotice(''); setUrl(event.target.value) }} placeholder="URL (optional for offline resources)" aria-describedby="resource-url-help" /><small id="resource-url-help">Only http:// and https:// links are allowed.</small><select value={type} onChange={(event) => setType(event.target.value)}><option>Book</option><option>Teacher</option><option>Course</option><option>Offline material</option><option>Article</option><option>Video</option><option>Other</option></select><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Personal notes" /><button className="secondary-button" type="submit">{resource ? 'Save resource' : 'Add resource'}</button>{notice && <p className="resource-success" role="status">{notice}</p>}</form>
}

function StartLearningForm({ skill, onCancel, onStart }: { skill: Skill; onCancel: () => void; onStart: (values: { goal: string; mode: 'empty' | 'suggested' | 'custom'; milestones: string[] }) => void }) {
  const [goal, setGoal] = useState('')
  const [mode, setMode] = useState<'empty' | 'suggested' | 'custom'>('suggested')
  const [milestones, setMilestones] = useState(skill.milestones.join('\n'))
  return <div className="modal-backdrop" role="presentation"><section className="manual-path-modal panel" role="dialog" aria-modal="true" aria-labelledby="start-skill-title"><div className="panel-heading"><div><span className="eyebrow">Start privately</span><h2 id="start-skill-title">Begin {skill.title}</h2><p>AI is optional. You can edit everything later.</p></div><button className="close-button" onClick={onCancel} type="button" aria-label="Close">×</button></div><form className="manual-path-form" onSubmit={(event) => { event.preventDefault(); onStart({ goal, mode, milestones: milestones.split('\n').map((item) => item.trim()).filter(Boolean) }) }}><label>Personal goal<input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Optional goal" /></label><label>Starting point<select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="empty">Empty path</option><option value="suggested">Use suggested milestones</option><option value="custom">Create my own milestones</option></select></label>{mode === 'custom' && <label>Milestones, one per line<textarea value={milestones} onChange={(event) => setMilestones(event.target.value)} rows={5} /></label>}<div className="manual-path-actions"><button className="secondary-button" onClick={onCancel} type="button">Cancel</button><button className="primary-button" type="submit">Create private path</button></div></form></section></div>
}

function CustomSkillForm({ categories, initialSkill, onCancel, onCreate }: { categories: string[]; initialSkill?: Skill; onCancel: () => void; onCreate: (skill: Skill) => void }) {
  const [title, setTitle] = useState(initialSkill?.title ?? '')
  const [category, setCategory] = useState(initialSkill?.category ?? categories[0] ?? 'Personal')
  const [newCategory, setNewCategory] = useState('')
  const [categoryMode, setCategoryMode] = useState<'existing' | 'new'>('existing')
  const [icon, setIcon] = useState(initialSkill?.icon ?? initialSkill?.visual ?? '✦')
  const [color, setColor] = useState(initialSkill?.color ?? 'sage')
  const [tags, setTags] = useState(initialSkill?.tags?.join(', ') ?? '')
  const [summary, setSummary] = useState(initialSkill?.summary ?? '')
  const icons = ['✦', '♪', '✎', '◌', '⌂', '◇', '✿', '▣']
  const colors = ['sage', 'lavender', 'peach', 'blue', 'mint']
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    onCreate({
      id: `custom-${Date.now()}`, title: title.trim(),
      category: categoryMode === 'new' ? newCategory : category,
      summary: summary.trim() || `Learn ${title.trim()} at your own pace.`,
      color,       equipment: initialSkill?.equipment ?? 'Choose accessible beginner materials.',
      roadmap: initialSkill?.roadmap ?? ['Get oriented with the basics', 'Practice one small skill', 'Reflect on progress'],
      milestones: initialSkill?.milestones ?? ['Understand the foundations', 'Complete a beginner exercise'],
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      visual: icon, icon: icon, resources: initialSkill?.resources ?? [], isCustom: true,
    })
  }
  return <div className="modal-backdrop" role="presentation"><section className="manual-path-modal panel" role="dialog" aria-modal="true" aria-labelledby="custom-skill-title"><div className="panel-heading"><div><span className="eyebrow">Your curiosity</span><h2 id="custom-skill-title">{initialSkill ? 'Edit custom skill' : 'Create a custom skill'}</h2></div><button className="close-button" onClick={onCancel} type="button" aria-label="Close">×</button></div><form className="manual-path-form" onSubmit={submit}><label>Name<input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Film photography" /></label><label>Category<select value={categoryMode === 'new' ? '__new__' : category} onChange={(event) => { if (event.target.value === '__new__') setCategoryMode('new'); else { setCategoryMode('existing'); setCategory(event.target.value) } }}><option value="" disabled>Select a category</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}<option value="__new__">Create new category…</option></select></label>{categoryMode === 'new' && <label>New category name<input required value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="e.g. Culture" /></label>}<fieldset className="picker-field"><legend>Illustration icon</legend><div className="picker-options">{icons.map((item) => <button className={icon === item ? 'picker-option selected' : 'picker-option'} key={item} onClick={() => setIcon(item)} type="button" aria-label={item}>{item}</button>)}</div></fieldset><fieldset className="picker-field"><legend>Pastel background</legend><div className="picker-options">{colors.map((item) => <button className={'picker-option color-option ' + item + (color === item ? ' selected' : '')} key={item} onClick={() => setColor(item)} type="button" aria-label={item} />)}</div></fieldset><label>Tags<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="creative, beginner, weekend" /></label><label>Description<textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} /></label><div className="manual-path-actions"><button className="secondary-button" onClick={onCancel} type="button">Cancel</button><button className="primary-button" type="submit">{initialSkill ? 'Save changes' : 'Save custom skill'}</button></div></form></section></div>
}

function getSavedPathProgress(path: SavedLearningPath) {
  const tasks = path.milestones.flatMap((milestone) => milestone.tasks)
  return tasks.length === 0 ? 0 : Math.round((tasks.filter((task) => task.completed).length / tasks.length) * 100)
}

function MyLearningPaths({ paths, onOpen, onEdit, onDelete }: { paths: SavedLearningPath[]; onOpen: (path: SavedLearningPath) => void; onEdit: (path: SavedLearningPath) => void; onDelete: (pathId: string) => void }) {
  return <><section className="explore-header"><div><p className="eyebrow">Your saved practice</p><h1>My learning paths <span aria-hidden="true">◎</span></h1><p className="welcome-copy">Plans you approved and saved privately in this browser.</p></div></section>{paths.length === 0 ? <div className="empty-explore"><span aria-hidden="true">◎</span><h2>No saved learning paths yet</h2><p>Generate a plan in AI Learning Planner, then approve it to see it here.</p></div> : <section className="paths-grid saved-paths-grid" aria-label="Saved learning paths">{paths.map((path) => { const progress = getSavedPathProgress(path); return <article className="path-card saved-path-card" key={path.id}><div className={`path-visual ${path.color}`} aria-hidden="true"><span className="visual-orbit" /><span className="path-icon">{path.icon}</span></div><div className="path-card-top"><span className="category">{path.visibility}</span></div><h3>{path.title}</h3><p className="path-description">{path.description}</p><div className="progress-meta"><span>Progress</span><strong>{progress}%</strong></div><div className="progress-track"><div className={`progress-fill ${path.color}`} style={{ width: `${progress}%` }} /></div><div className="path-footer"><span>{path.milestones.length} milestones</span><div className="path-actions"><button className="text-button" onClick={() => onOpen(path)} type="button">Open</button><button className="text-button" onClick={() => onEdit(path)} type="button">Edit</button><button className="delete-button" onClick={() => onDelete(path.id)} type="button">Delete</button></div></div></article> })}</section>}</>
}

function EditPathForm({ path, onCancel, onSave }: { path: SavedLearningPath; onCancel: () => void; onSave: (values: Pick<SavedLearningPath, 'title' | 'description' | 'category' | 'visibility' | 'goal'>) => void }) {
  const [title, setTitle] = useState(path.title)
  const [description, setDescription] = useState(path.description)
  const [category, setCategory] = useState(path.category)
  const [visibility, setVisibility] = useState(path.visibility)
  const [goal, setGoal] = useState(path.goal?.title ?? '')

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim()) return
    onSave({
      title: title.trim(),
      description: description.trim(),
      category: category.trim() || 'Personal',
      visibility,
      goal: goal.trim() ? { id: path.goal?.id ?? `goal-${Date.now()}`, title: goal.trim(), description: path.goal?.description ?? '', targetDate: path.goal?.targetDate ?? null } : null,
    })
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}><section className="manual-path-modal panel" role="dialog" aria-modal="true" aria-labelledby="edit-path-title"><div className="panel-heading"><div><span className="eyebrow">Edit saved path</span><h2 id="edit-path-title">Update your learning path</h2><p>Milestones, completed tasks, practice and resources stay unchanged.</p></div><button className="close-button" onClick={onCancel} type="button" aria-label="Close">×</button></div><form className="manual-path-form" onSubmit={submit}><label>Path title<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label><label>Category<input value={category} onChange={(event) => setCategory(event.target.value)} /></label><label>Personal goal<input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Optional goal" /></label><label>Visibility<select value={visibility} onChange={(event) => setVisibility(event.target.value as SavedLearningPath['visibility'])}><option value="private">Private</option><option value="public">Public</option></select></label><div className="manual-path-actions"><button className="secondary-button" onClick={onCancel} type="button">Cancel</button><button className="primary-button" type="submit">Save changes</button></div></form></section></div>
}

function SavedPathDetail({ path, journalEntries, skill, skillOptions, skillResources, pathResources, onBack, onUpdate, onAssociate, onAddSkillResource, onUpdateSkillResource, onDeleteSkillResource, onAddPractice, onAddPathResource, onUpdatePathResource, onDeletePathResource }: { path: SavedLearningPath; journalEntries: JournalEntry[]; skill?: Skill; skillOptions: Skill[]; skillResources: PersonalResource[]; pathResources: PersonalResource[]; onBack: () => void; onUpdate: (path: SavedLearningPath) => void; onAssociate: (skillId?: string) => void; onAddSkillResource: (resource: PersonalResource) => void; onUpdateSkillResource: (resource: PersonalResource) => void; onDeleteSkillResource: (resourceId: string) => void; onAddPractice: (session: PracticeSession) => void; onAddPathResource: (resource: PersonalResource) => void; onUpdatePathResource: (resource: PersonalResource) => void; onDeletePathResource: (resourceId: string) => void }) {
  const [practiceDate, setPracticeDate] = useState(new Date().toISOString().slice(0, 10))
  const [practiceMinutes, setPracticeMinutes] = useState('20')
  const [practiceNotes, setPracticeNotes] = useState('')
  const [isAddingPractice, setIsAddingPractice] = useState(false)
  const [editingSkillResource, setEditingSkillResource] = useState<PersonalResource | null>(null)
  const [editingPathResource, setEditingPathResource] = useState<PersonalResource | null>(null)
  const completedTasks = path.milestones.flatMap((milestone) => milestone.tasks).filter((task) => task.completed).length
  const totalTasks = path.milestones.flatMap((milestone) => milestone.tasks).length

  function updatePath(patch: Partial<SavedLearningPath>) {
    onUpdate({ ...path, ...patch, updatedAt: new Date().toISOString() })
  }

  function toggleTask(milestoneId: string, taskId: string) {
    updatePath({ milestones: path.milestones.map((milestone) => milestone.id === milestoneId ? { ...milestone, tasks: milestone.tasks.map((task) => task.id === taskId ? { ...task, completed: !task.completed, completedAt: !task.completed ? new Date().toISOString() : null } : task) } : milestone) })
  }

  function addPracticeSession() {
    const minutes = Number(practiceMinutes)
    if (isAddingPractice || !practiceNotes.trim() || !Number.isInteger(minutes) || minutes <= 0) return
    setIsAddingPractice(true)
    const session = { id: `actual-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: practiceDate, durationMinutes: minutes, notes: practiceNotes.trim(), taskId: null }
    onAddPractice(session)
    setPracticeNotes('')
    setIsAddingPractice(false)
  }

  const actualSessions = path.actualPracticeSessions ?? []
  const suggestedSessions = path.suggestedPracticeSessions ?? path.practiceSessions
  const curatedResources = skill?.resources ?? []
  const completedTaskTitles = path.milestones.flatMap((milestone) => milestone.tasks.filter((task) => task.completed).map((task) => task.title))
  const remainingTaskTitles = path.milestones.flatMap((milestone) => milestone.tasks.filter((task) => !task.completed).map((task) => task.title))
  return <><button className="back-button" onClick={onBack} type="button">← Back to My Learning</button><section className="skill-detail-hero saved-detail-hero"><div className={`path-visual ${path.color}`} aria-hidden="true"><span className="visual-orbit" />{skill ? <SkillVisual skill={skill} /> : <span className="path-icon">{path.icon}</span>}</div><div><span className="category">{path.visibility} learning path</span><h1>{path.title}</h1><p>{path.description}</p><label className="association-control">Linked skill<select value={path.skillId ?? ''} onChange={(event) => onAssociate(event.target.value || undefined)}><option value="">Not linked</option>{skillOptions.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}</select></label><span className="local-path-note">Private to this browser · {completedTasks}/{totalTasks} tasks complete</span></div></section><div className="detail-grid"><article className="detail-panel"><span className="eyebrow">Roadmap</span><h2>Milestones and tasks</h2>{path.milestones.map((milestone, milestoneIndex) => <div className="saved-milestone" key={milestone.id}><input className="saved-title-input" value={milestone.title} onChange={(event) => updatePath({ milestones: path.milestones.map((item, index) => index === milestoneIndex ? { ...item, title: event.target.value } : item) })} /><p>{milestone.description}</p><ul>{milestone.tasks.map((task) => <li key={task.id}><input className="task-checkbox" type="checkbox" checked={task.completed} onChange={() => toggleTask(milestone.id, task.id)} /><input className="saved-task-input" value={task.title} onChange={(event) => updatePath({ milestones: path.milestones.map((item) => item.id === milestone.id ? { ...item, tasks: item.tasks.map((currentTask) => currentTask.id === task.id ? { ...currentTask, title: event.target.value } : currentTask) } : item) })} />{task.estimatedMinutes ? <small>{task.estimatedMinutes} min</small> : null}</li>)}</ul></div>)}<ReflectionCoach path={path} journalEntries={journalEntries} completedTaskTitles={completedTaskTitles} remainingTaskTitles={remainingTaskTitles} /></article><article className="detail-panel"><span className="eyebrow">Resources</span><h2>Skill resources</h2><p className="section-help">{skill ? 'Curated and personal resources available to paths linked to this skill.' : 'Link this path to a skill to see its shared resources.'}</p><div className="resource-list">{curatedResources.map((resource) => resource.url && isSafeResourceUrl(resource.url) ? <a href={resource.url} key={`${resource.label}-${resource.url}`}   rel="noopener noreferrer" target="_blank"><span>Curated · {resource.type}</span><strong>{resource.label}</strong><em aria-hidden="true">↗</em></a> : <div className="saved-session" key={resource.id ?? resource.label}><span>{resource.type}</span><strong>{resource.label}</strong><em>Offline</em></div>)}  </div><div className="resource-list">{skillResources.map((resource) => <div className="saved-session" key={resource.id}><span>Skill · {resource.type}</span><strong>{resource.label}{resource.notes ? ` — ${resource.notes}` : ''}</strong>{resource.url && isSafeResourceUrl(resource.url) ? <a href={resource.url} target="_blank" rel="noopener noreferrer">Open</a> : <em>Offline</em>}<button className="text-button" onClick={() => setEditingSkillResource(resource)} type="button">Edit</button><button className="delete-button" onClick={() => resource.id && onDeleteSkillResource(resource.id)} type="button">Delete</button></div>)}</div><ResourceForm key={editingSkillResource?.id ?? 'new-skill-resource'} resource={editingSkillResource} onSave={(resource) => { if (editingSkillResource) onUpdateSkillResource(resource); else onAddSkillResource(resource); setEditingSkillResource(null) }} /><h2>Path-only resources</h2><ResourceForm key={editingPathResource?.id ?? 'new-path-resource'} resource={editingPathResource} onSave={(resource) => { if (editingPathResource) onUpdatePathResource(resource); else onAddPathResource(resource); setEditingPathResource(null) }} /><div className="resource-list">{pathResources.map((resource) => <div className="saved-session" key={resource.id}><span>Path · {resource.type}</span><strong>{resource.label}{resource.notes ? ` — ${resource.notes}` : ''}</strong>{resource.url && isSafeResourceUrl(resource.url) ? <a href={resource.url} target="_blank" rel="noopener noreferrer">Open</a> : <em>Offline</em>}<button className="text-button" onClick={() => setEditingPathResource(resource)} type="button">Edit</button><button className="delete-button" onClick={() => resource.id && onDeletePathResource(resource.id)} type="button">Delete</button></div>)}</div><h2>Practice journal</h2><div className="practice-form"><input type="date" value={practiceDate} onChange={(event) => setPracticeDate(event.target.value)} /><input type="number" min="1" value={practiceMinutes} onChange={(event) => setPracticeMinutes(event.target.value)} placeholder="Minutes" /><textarea value={practiceNotes} onChange={(event) => setPracticeNotes(event.target.value)} placeholder="What did you practice?" rows={2} /><button className="secondary-button" disabled={isAddingPractice} onClick={addPracticeSession} type="button">{isAddingPractice ? 'Saving…' : 'Add practice session'}</button></div><h2>Actual practice</h2><div className="resource-list">{actualSessions.map((session) => <div className="saved-session" key={session.id}><span>{session.date}</span><strong>{session.notes}</strong><em>{formatDuration(session.durationMinutes)}</em></div>)}</div><h2>Suggested guidance</h2><div className="resource-list">{suggestedSessions.map((session) => <div className="saved-session suggested-session" key={session.id}><span>{session.date}</span><strong>{session.notes}</strong><em>{formatDuration(session.durationMinutes)}</em></div>)}</div>{path.reviewGuidance && <><h2>Review your progress</h2><p>{path.reviewGuidance}</p></>}  </article></div></>
}

function ExploreSkills({ skills: filteredSkills, categories, category, search, onCategoryChange, onSearchChange, onSelect, onEdit, onDelete, onCreateCustom }: { skills: Skill[]; categories: string[]; category: string; search: string; onCategoryChange: (value: string) => void; onSearchChange: (value: string) => void; onSelect: (skill: Skill) => void; onEdit: (skill: Skill) => void; onDelete: (skill: Skill) => void; onCreateCustom: () => void }) {
  return <><section className="explore-header"><div><p className="eyebrow">A library for curious people</p><h1>Explore skills <span aria-hidden="true">✦</span></h1><p className="welcome-copy">Choose something that makes you want to begin.</p></div><button className="secondary-button" onClick={onCreateCustom} type="button">Create custom skill</button></section><section className="explore-tools"><label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search skills or tags" aria-label="Search skills or tags" /></label><div className="category-list" aria-label="Filter by category">{categories.map((item) => <button className={category === item ? 'category-filter active' : 'category-filter'} key={item} onClick={() => onCategoryChange(item)} type="button">{item}</button>)}</div></section><section className="skills-grid" aria-label="Explore skills">{filteredSkills.map((skill) => <article className="skill-card" key={skill.id}><SkillVisual skill={skill} /><div className="skill-card-body"><span className="category">{skill.category}</span><h3>{skill.title}</h3><p>{skill.summary}</p><div className="skill-tags">{(skill.tags ?? []).slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}</div><div className="skill-card-actions"><button className="text-button" onClick={() => onSelect(skill)} type="button">View skill <span aria-hidden="true">→</span></button>{skill.isCustom && <><button className="text-button" onClick={() => onEdit(skill)} type="button">Edit</button><button className="delete-button" onClick={() => onDelete(skill)} type="button">Delete</button></>}</div></div></article>)}</section>{filteredSkills.length === 0 && <div className="empty-explore"><span aria-hidden="true">✦</span><h2>No skills found</h2><p>Try a different search or category.</p></div>}<p className="demo-note"><span aria-hidden="true">✦</span> Curated links are preserved; personal resources are labeled separately.</p></>
}

function SkillDetail({ skill, onBack, onStart, onEdit, onDelete, personalResources, onAddResource, onUpdateResource, onDeleteResource }: { skill: Skill; onBack: () => void; onStart: () => void; onEdit?: () => void; onDelete?: () => void; personalResources: Skill['resources']; onAddResource: (resource: Skill['resources'][number]) => void; onUpdateResource: (resource: Skill['resources'][number]) => void; onDeleteResource: (id: string) => void }) {
  const [editingResource, setEditingResource] = useState<Skill['resources'][number] | null>(null)
  return <><button className="back-button" onClick={onBack} type="button">← Back to Explore Skills</button><section className="skill-detail-hero"><SkillVisual skill={skill} /><div><span className="category">{skill.category}</span><h1>{skill.title}</h1><p>{skill.summary}</p><button className="primary-button" onClick={onStart} type="button">Start learning <span aria-hidden="true">→</span></button>{skill.isCustom && <div className="skill-actions"><button className="text-button" onClick={onEdit} type="button">Edit skill</button><button className="delete-button" onClick={onDelete} type="button">Delete skill</button></div>}</div></section><div className="detail-grid"><article className="detail-panel"><span className="eyebrow">Begin here</span><h2>What you’ll need</h2><p>{skill.equipment}</p><h2>How to start</h2><ol className="roadmap">{skill.roadmap.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol></article><article className="detail-panel"><span className="eyebrow">A gentle progression</span><h2>Suggested milestones</h2><ul className="milestone-list">{skill.milestones.map((milestone) => <li key={milestone}><span>○</span>{milestone}</li>)}</ul><h2>Learning resources</h2><div className="resource-list">{skill.resources.map((resource) => resource.url && isSafeResourceUrl(resource.url) ? <a href={resource.url} key={`${resource.label}-${resource.url}`} rel="noopener noreferrer" target="_blank"><span>{resource.type}</span><strong>{resource.label}</strong><em aria-hidden="true">↗</em></a> : <div className="saved-session" key={resource.id ?? resource.label}><span>{resource.type}</span><strong>{resource.label}</strong><em>Offline</em></div>)}</div><h2>Personal resources</h2><ResourceForm key={editingResource?.id ?? 'new-resource'} resource={editingResource} onSave={(resource) => { if (editingResource) onUpdateResource(resource); else onAddResource(resource); setEditingResource(null) }} /><div className="resource-list">{personalResources.map((resource) => <div className="saved-session" key={resource.id}><span>{resource.type}</span><strong>{resource.label}{resource.notes ? ` — ${resource.notes}` : ''}</strong>{resource.url && isSafeResourceUrl(resource.url) ? <a href={resource.url} target="_blank"   rel="noopener noreferrer">Open</a> : <em>Offline</em>}<button className="text-button" onClick={() => setEditingResource(resource)} type="button">Edit</button><button className="delete-button" onClick={() => { if (resource.id) onDeleteResource(resource.id) }} type="button">Delete</button></div>)}</div></article></div></>
}

function ReflectionCoach({ path, journalEntries, completedTaskTitles, remainingTaskTitles }: { path: SavedLearningPath; journalEntries: JournalEntry[]; completedTaskTitles: string[]; remainingTaskTitles: string[] }) {
  const [question, setQuestion] = useState('')
  const [reflection, setReflection] = useState<Reflection | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const selectedJournalEntries = journalEntries.filter((entry) => entry.pathId === path.id)
  const achievements = selectedJournalEntries.filter((entry) => entry.achievements.trim()).map((entry) => entry.achievements.trim())
  const difficulties = selectedJournalEntries.filter((entry) => entry.difficulties.trim()).map((entry) => entry.difficulties.trim())
  const boundedJournalEntries = selectedJournalEntries.slice(-30)
  const journalEntriesTruncated = selectedJournalEntries.length > boundedJournalEntries.length
  const actualPracticeMinutes = boundedJournalEntries.filter((entry) => entry.durationMinutes > 0).reduce((total, entry) => total + entry.durationMinutes, 0)
  const questions = ['What progress have I recorded?', 'What patterns appear in my practice?', 'What could I focus on next?', 'Help me reflect on recent difficulties.']

  async function askCoach() {
    if (isLoading || !question.trim()) return
    setIsLoading(true)
    setError('')
    try {
      const response = await fetch('/api/learning-reflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          context: {
            pathId: path.id,
            pathTitle: path.title,
            goal: path.goal?.title ?? null,
            completedTasks: completedTaskTitles.slice(0, 100),
            remainingTasks: remainingTaskTitles.slice(0, 100),
            actualPracticeMinutes,
            journalEntriesTruncated,
            journalEntries: boundedJournalEntries.map((entry) => ({
              id: entry.id,
              pathId: entry.pathId,
              date: entry.date,
              type: entry.type,
              durationMinutes: entry.durationMinutes,
              notes: entry.notes.slice(0, 500),
              achievements: entry.achievements.slice(0, 500),
              difficulties: entry.difficulties.slice(0, 500),
            })),
          },
        }),
      })
      const payload = await response.json() as { reflection?: Reflection; tool?: { ran?: boolean }; error?: { message?: string } }
      if (!response.ok || !payload.reflection) throw new Error(payload.error?.message ?? 'Reflection Coach is temporarily unavailable.')
      setReflection({ ...payload.reflection, toolRan: payload.tool?.ran === true } as Reflection & { toolRan: boolean })
    } catch (coachError) {
      setError(coachError instanceof Error ? coachError.message : 'Reflection Coach is temporarily unavailable.')
    } finally {
      setIsLoading(false)
    }
  }

  return <section className={`reflection-coach panel ${isExpanded ? 'expanded' : 'collapsed'}`}><button className="reflection-toggle" onClick={() => setIsExpanded((current) => !current)} type="button" aria-expanded={isExpanded}><span><span className="eyebrow">Optional AI reflection</span><strong>Reflection Coach</strong><small>Read-only analysis of this path's recorded progress.</small></span><span aria-hidden="true">{isExpanded ? '−' : '+'}</span></button>{isExpanded && <div className="reflection-content"><p className="section-help">Your selected path, tasks and journal records will be sent to Gemini when you click Ask Coach. Nothing is saved or changed automatically.</p><div className="reflection-facts"><span>Goal: <strong>{path.goal?.title ?? 'No goal recorded'}</strong></span><span>{completedTaskTitles.length} completed · {remainingTaskTitles.length} remaining tasks</span><span>{formatDuration(actualPracticeMinutes)} actual practice · {selectedJournalEntries.length} journal entries</span><span>{achievements.length} achievements · {difficulties.length} difficulties recorded</span></div><div className="reflection-questions">{questions.map((item) => <button className="category-filter" key={item} onClick={() => setQuestion(item)} type="button">{item}</button>)}</div><textarea className="reflection-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question about your recorded progress..." rows={3} /><button className="primary-button" disabled={isLoading || !question.trim()} onClick={askCoach} type="button">{isLoading ? 'Reflecting…' : 'Ask Coach'}</button>{error && <p className="planner-error" role="alert">{error}</p>}{reflection && <div className="reflection-answer" role="status">{reflection.answer}{'toolRan' in reflection && reflection.toolRan ? <small className="reflection-tool-status">Practice consistency tool used</small> : null}</div>}</div>}</section>
}

function AIPlanner({ inputs, onInputsChange, onSaved }: { inputs: PlannerInputs; onInputsChange: (inputs: PlannerInputs) => void; onSaved: (path: SavedLearningPath) => void }) {
  const [draft, setDraft] = useState<GeneratedPlan | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function updateInput(key: keyof PlannerInputs, value: string) {
    onInputsChange({ ...inputs, [key]: value })
  }

  async function generatePlan() {
    setIsLoading(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/learning-plans/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: inputs.skill, experience: inputs.level, goal: inputs.goal, practiceTime: inputs.time, preferences: inputs.preferences }),
      })
      const payload = await response.json() as { plan?: GeneratedPlan; error?: { message?: string } }
      if (!response.ok || !payload.plan) {
        throw new Error(payload.error?.message ?? 'The learning plan could not be generated.')
      }
      setDraft(payload.plan)
      setNotice('Draft generated. Review and edit it before saving.')
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'The learning plan could not be generated.')
    } finally {
      setIsLoading(false)
    }
  }

  function saveDraft() {
    if (!draft) return
    const now = new Date().toISOString()
    const learningPath: SavedLearningPath = {
      id: `path-${Date.now()}`,
      title: draft.title,
      description: draft.overview,
      category: inputs.skill,
      color: 'sage',
      icon: '✦',
      visibility: 'private',
      goal: { id: `goal-${Date.now()}`, title: inputs.goal, description: draft.overview, targetDate: null },
      milestones: draft.milestones.map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        description: milestone.description,
        tasks: milestone.tasks.map((task) => ({ id: task.id, title: task.title, completed: false, completedAt: null, description: task.description, estimatedMinutes: task.estimatedMinutes })),
      })),
      practiceSessions: draft.practiceSessions.map((session) => ({ id: session.id, date: session.dayLabel, durationMinutes: session.durationMinutes, notes: session.activity, taskId: null })),
      suggestedPracticeSessions: draft.practiceSessions.map((session) => ({ id: session.id, date: session.dayLabel, durationMinutes: session.durationMinutes, notes: session.activity, taskId: null })),
      actualPracticeSessions: [],
      createdAt: now,
      updatedAt: now,
      assumptions: draft.assumptions,
      reviewGuidance: draft.reviewGuidance,
    }
    onSaved(learningPath)
    setIsSaved(true)
    setNotice('Plan approved and saved privately in My Learning.')
  }

  function updateDraft(patch: Partial<GeneratedPlan>) {
    setDraft((current) => current ? { ...current, ...patch } : current)
  }

  function discardDraft() {
    setDraft(null)
    setIsSaved(false)
    setNotice('Draft discarded. Your planner inputs remain available.')
  }

  return <><section className="prompt-lab-header"><div><p className="eyebrow">Your next learning chapter</p><h1>AI Learning Planner <span aria-hidden="true">✦</span></h1><p className="welcome-copy">Tell us about your goal and receive a draft plan to review.</p></div></section>
    <section className="prompt-context panel"><div className="panel-heading"><div><h2>1. Tell us about your learning goal</h2><p>Your answers shape the personalized roadmap.</p></div></div><div className="planner-form"><label>Skill or hobby<input value={inputs.skill} onChange={(event) => updateInput('skill', event.target.value)} placeholder="e.g. piano, knitting, Python" /></label><label>Current level<select value={inputs.level} onChange={(event) => updateInput('level', event.target.value)}><option>Beginner</option><option>Some experience</option><option>Intermediate</option><option>Advanced</option></select></label><label>Learning goal<textarea value={inputs.goal} onChange={(event) => updateInput('goal', event.target.value)} placeholder="What would you like to be able to do?" rows={2} /></label><label>Available practice time<input value={inputs.time} onChange={(event) => updateInput('time', event.target.value)} placeholder="e.g. 20 minutes, 4 days a week" /></label><label>Learning preferences<textarea value={inputs.preferences} onChange={(event) => updateInput('preferences', event.target.value)} placeholder="e.g. visual examples, gentle pace, projects" rows={2} /></label></div><button className="primary-button planner-generate-button" disabled={isLoading} onClick={generatePlan} type="button">{isLoading ? 'Creating your draft…' : 'Generate my learning plan'}</button></section>
    {error && <p className="planner-error" role="alert">{error}</p>}{notice && <p className="lab-notice" role="status">{notice}</p>}
    {draft ? <PlanDraft draft={draft} onChange={updateDraft} onSave={saveDraft} onDiscard={discardDraft} isSaved={isSaved} /> : <section className="planner-coming-soon panel"><div className="journal-icon" aria-hidden="true">✧</div><div><h2>Your plan will appear here</h2><p>Gemini will create a draft with milestones, tasks and practice sessions. Nothing is saved until you approve it.</p><p className="section-help">If generation fails or reaches a rate limit, your form inputs will remain unchanged.</p></div></section>}
    <section className="planner-flow"><span>1. Enter skill and goals</span><span>→</span><span>2. Generate draft</span><span>→</span><span>3. Review and edit</span><span>→</span><span>4. Approve and save</span></section>
  </>
}

function PlanDraft({ draft, onChange, onSave, onDiscard, isSaved }: { draft: GeneratedPlan; onChange: (patch: Partial<GeneratedPlan>) => void; onSave: () => void; onDiscard: () => void; isSaved: boolean }) {
  return <section className="plan-draft"><div className="draft-heading"><div><span className="eyebrow">2. Review your draft</span><h2>{draft.title}</h2></div><div className="draft-actions"><button className="secondary-button" disabled={isSaved} onClick={onDiscard} type="button">Discard draft</button><button className="primary-button" disabled={isSaved} onClick={onSave} type="button">{isSaved ? 'Saved privately' : 'Approve and save privately'}</button></div></div><label className="draft-field">Plan title<input value={draft.title} onChange={(event) => onChange({ title: event.target.value })} /></label><label className="draft-field">Overview<textarea value={draft.overview} onChange={(event) => onChange({ overview: event.target.value })} rows={3} /></label><div className="draft-milestones"><h3>Milestones and tasks</h3>{draft.milestones.map((milestone, milestoneIndex) => <article className="draft-milestone" key={milestone.id}><input value={milestone.title} onChange={(event) => { const milestones = [...draft.milestones]; milestones[milestoneIndex] = { ...milestones[milestoneIndex], title: event.target.value }; onChange({ milestones }) }} /><p>{milestone.description}</p>{milestone.tasks.map((task, taskIndex) => <label className="draft-task" key={task.id}><span>Task</span><input value={task.title} onChange={(event) => { const milestones = [...draft.milestones]; const tasks = [...milestones[milestoneIndex].tasks]; tasks[taskIndex] = { ...tasks[taskIndex], title: event.target.value }; milestones[milestoneIndex] = { ...milestones[milestoneIndex], tasks }; onChange({ milestones }) }} /><small>{task.estimatedMinutes} min</small></label>)}</article>)}</div><div className="draft-sessions"><h3>Practice guidance</h3>{draft.practiceSessions.map((session, index) => <label className="draft-task" key={session.id}><span>{session.dayLabel}</span><input value={session.activity} onChange={(event) => { const practiceSessions = [...draft.practiceSessions]; practiceSessions[index] = { ...practiceSessions[index], activity: event.target.value }; onChange({ practiceSessions }) }} /><small>{session.durationMinutes} min</small></label>)}</div><p className="limitations-note"><strong>Private by default:</strong> approval saves this draft to this browser’s My Learning data. It does not create real public sharing.</p></section>
}

export default App

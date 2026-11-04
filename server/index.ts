import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { learningPlanRequestSchema } from './schemas/learningPlan.ts'
import { learningReflectionRequestSchema } from './schemas/learningReflection.ts'
import { GeminiProviderError, GeminiResponseError, generateLearningPlan } from './services/geminiPlanner.ts'
import { generateLearningReflection } from './services/geminiReflectionCoach.ts'
import { ZodError } from 'zod'

if (existsSync('.env')) {
  loadEnvFile('.env')
}
const port = Number(process.env.PORT ?? 8787)
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
])
const isDevelopment = process.env.NODE_ENV !== 'production'

function logDiagnostic(event: string, details: Record<string, string | number | undefined>) {
  if (isDevelopment) {
    console.warn(`[learning-plan] ${event}`, details)
  }
}

function classifyProviderFailure(error: GeminiProviderError) {
  if (error.httpStatus === 401 || error.httpStatus === 403) return 'authentication-or-model-access'
  if (error.httpStatus === 404) return 'model-not-found-or-model-access'
  if (error.httpStatus === 429) return 'quota-or-rate-limit'
  if (error.httpStatus && error.httpStatus >= 500) return 'provider-server-error'
  return 'provider-request-error'
}

function getCorsHeaders(origin: string | undefined) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'Content-Type',
  }
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers.Vary = 'Origin'
  }
  return headers
}

function sendJson(response: ServerResponse, status: number, body: unknown, origin?: string) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...getCorsHeaders(origin),
  })
  response.end(JSON.stringify(body))
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    if (Buffer.concat(chunks).length > 100_000) {
      throw new Error('Request body is too large')
    }
  }
  const body = Buffer.concat(chunks).toString('utf8')
  return body ? JSON.parse(body) : {}
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      ...getCorsHeaders(origin),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    })
    response.end()
    return
  }

  if (request.method === 'GET' && request.url === '/api/health') {
    sendJson(response, 200, { ok: true, service: 'skillpath-api', geminiConfigured: Boolean(process.env.GEMINI_API_KEY) }, origin)
    return
  }

  if (request.method === 'POST' && request.url === '/api/learning-plans/generate') {
    let rawInput: unknown
    try {
      rawInput = await readJson(request)
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendJson(response, 400, { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } }, origin)
        return
      }
      if (error instanceof Error && error.message === 'Request body is too large') {
        sendJson(response, 413, { error: { code: 'REQUEST_TOO_LARGE', message: error.message } }, origin)
        return
      }
      sendJson(response, 400, { error: { code: 'INVALID_REQUEST', message: 'Request body could not be read.' } }, origin)
      return
    }

    const parsedInput = learningPlanRequestSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      sendJson(response, 400, { error: { code: 'INVALID_REQUEST', message: 'Request did not match the learning-plan input schema.' } }, origin)
      return
    }

    try {
      if (!process.env.GEMINI_API_KEY) {
        sendJson(response, 503, { error: { code: 'AI_NOT_CONFIGURED', message: 'Gemini is not configured. Add GEMINI_API_KEY to the server .env file.' } }, origin)
        return
      }
      const plan = await generateLearningPlan(parsedInput.data)
      sendJson(response, 200, { plan }, origin)
    } catch (error) {
      if (error instanceof Error && error.message === 'Gemini is not configured. Add GEMINI_API_KEY to the server .env file.') {
        sendJson(response, 503, { error: { code: 'AI_NOT_CONFIGURED', message: error.message } }, origin)
        return
      }
      if (error instanceof GeminiResponseError && error.kind === 'invalid-json') {
        logDiagnostic('invalid-model-json', { response: 'non-JSON or unparsable' })
        sendJson(response, 502, { error: { code: 'INVALID_MODEL_RESPONSE', message: 'Gemini returned a response that was not valid JSON.' } }, origin)
        return
      }
      if (error instanceof GeminiResponseError && error.kind === 'empty') {
        logDiagnostic('empty-model-response', { response: 'empty' })
        sendJson(response, 502, { error: { code: 'EMPTY_MODEL_RESPONSE', message: 'Gemini returned an empty learning plan.' } }, origin)
        return
      }
      if (error instanceof ZodError) {
        const paths = error.issues.map((issue) => issue.path.join('.') || '<root>').slice(0, 20)
        logDiagnostic('schema-validation-failed', { issueCount: error.issues.length, paths: paths.join(',') })
        sendJson(response, 502, { error: { code: 'INVALID_MODEL_RESPONSE', message: 'Gemini returned JSON that did not match the learning-plan schema.' } }, origin)
        return
      }
      if (error instanceof GeminiProviderError) {
        const category = classifyProviderFailure(error)
        logDiagnostic('gemini-provider-failure', { category, httpStatus: error.httpStatus, providerCode: error.providerCode })
        if (category === 'quota-or-rate-limit') {
          sendJson(response, 429, { error: { code: 'RATE_LIMITED', message: 'Gemini rate limit or quota reached. Please wait before trying again.' } }, origin)
          return
        }
        if (category === 'authentication-or-model-access' || category === 'model-not-found-or-model-access') {
          sendJson(response, 502, { error: { code: 'AI_PROVIDER_ACCESS_ERROR', message: 'The configured Gemini model is not accessible. Check the server model configuration and API project access.' } }, origin)
          return
        }
        sendJson(response, 502, { error: { code: 'AI_PROVIDER_ERROR', message: 'Gemini could not generate a learning plan.' } }, origin)
        return
      }
      if (error instanceof Error && /429|rate limit|quota/i.test(error.message)) {
        logDiagnostic('unclassified-rate-limit', { category: 'quota-or-rate-limit' })
        sendJson(response, 429, { error: { code: 'RATE_LIMITED', message: 'Gemini rate limit or quota reached. Please wait before trying again.' } }, origin)
        return
      }
      logDiagnostic('unclassified-generation-failure', { category: 'unknown' })
      sendJson(response, 502, { error: { code: 'AI_GENERATION_FAILED', message: 'The learning plan could not be generated. Please try again later.' } }, origin)
    }
    return
  }

  if (request.method === 'POST' && request.url === '/api/learning-reflections') {
    let rawInput: unknown
    try {
      rawInput = await readJson(request)
    } catch (error) {
      const code = error instanceof Error && error.message === 'Request body is too large' ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON'
      sendJson(response, code === 'REQUEST_TOO_LARGE' ? 413 : 400, { error: { code, message: code === 'REQUEST_TOO_LARGE' ? 'Request body is too large.' : 'Request body must be valid JSON.' } }, origin)
      return
    }
    const parsedInput = learningReflectionRequestSchema.safeParse(rawInput)
    if (!parsedInput.success) {
      sendJson(response, 400, { error: { code: 'INVALID_REQUEST', message: 'Reflection request did not match the required format.' } }, origin)
      return
    }
    try {
      if (!process.env.GEMINI_API_KEY) {
        sendJson(response, 503, { error: { code: 'AI_NOT_CONFIGURED', message: 'Reflection Coach is not configured.' } }, origin)
        return
      }
      logDiagnostic('reflection-context', {
        pathId: parsedInput.data.context.pathId,
        journalCount: parsedInput.data.context.journalEntries.filter((entry) => entry.pathId === parsedInput.data.context.pathId).length,
        journalTruncated: parsedInput.data.context.journalEntriesTruncated ? 1 : 0,
      })
      const result = await generateLearningReflection(parsedInput.data)
      sendJson(response, 200, { reflection: result.reflection, tool: { ran: result.toolRan } }, origin)
    } catch (error) {
      if (error instanceof GeminiResponseError) {
        logDiagnostic(`reflection-${error.kind}`, { response: error.kind })
        sendJson(response, 502, { error: { code: 'INVALID_MODEL_RESPONSE', message: 'Reflection Coach returned an unusable response.' } }, origin)
        return
      }
      if (error instanceof ZodError) {
        logDiagnostic('reflection-schema-validation-failed', { issueCount: error.issues.length, paths: error.issues.map((issue) => issue.path.join('.')).slice(0, 20).join(',') })
        sendJson(response, 502, { error: { code: 'INVALID_MODEL_RESPONSE', message: 'Reflection Coach returned an invalid response.' } }, origin)
        return
      }
      if (error instanceof GeminiProviderError) {
        const category = classifyProviderFailure(error)
        logDiagnostic('reflection-provider-failure', { category, httpStatus: error.httpStatus, providerCode: error.providerCode })
        if (category === 'quota-or-rate-limit') {
          sendJson(response, 429, { error: { code: 'RATE_LIMITED', message: 'Reflection Coach is rate-limited. Please wait before trying again.' } }, origin)
          return
        }
        sendJson(response, 502, { error: { code: 'AI_PROVIDER_ERROR', message: 'Reflection Coach is temporarily unavailable.' } }, origin)
        return
      }
      logDiagnostic('reflection-generation-failure', { category: 'unknown' })
      sendJson(response, 502, { error: { code: 'AI_GENERATION_FAILED', message: 'Reflection Coach is temporarily unavailable.' } }, origin)
    }
    return
  }

  sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Route not found.' } }, origin)
})

server.listen(port, () => {
  console.log(`SkillPath API listening on http://localhost:${port}`)
})

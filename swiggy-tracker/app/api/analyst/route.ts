import { NextResponse } from 'next/server';
import { computeStatsSnapshot } from '@/lib/compute-stats';
import { computeAdvisorOpsKpis } from '@/lib/compute-advisor-ops';
import { generateAdvisorReply, type AdvisorMessage } from '@/lib/analyst-model';
import { computeAdvisorItemInsights, shouldFetchItemInsights } from '@/lib/compute-advisor-items';
import { classifyAdvisorIntent, intentConfidenceBand, type AdvisorIntent } from '@/lib/advisor-intent';
import { deriveAdvisorSession } from '@/lib/advisor-session';
import { buildDeterministicAdvisorReply, shouldUseDeterministicItemReply } from '@/lib/advisor-response';

const MAX_BODY_BYTES = 40 * 1024;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;
const MAX_TOTAL_CHARS = 12000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

type AnalystBody = {
  messages: AdvisorMessage[];
  category?: string;
  period?: string;
};

type RateLimitStore = Map<string, number[]>;
type AdvisorTelemetry = {
  requestsTotal: number;
  successTotal: number;
  errorTotal: number;
  blockMessageTooLongTotal: number;
  blockTotalCharsTooLongTotal: number;
  rateLimitedTotal: number;
  latencyLt2s: number;
  latency2To5s: number;
  latency5To10s: number;
  latencyGt10s: number;
};

function getTelemetryStore(): AdvisorTelemetry {
  const globalForStore = globalThis as typeof globalThis & { __advisorTelemetry?: AdvisorTelemetry };
  if (!globalForStore.__advisorTelemetry) {
    globalForStore.__advisorTelemetry = {
      requestsTotal: 0,
      successTotal: 0,
      errorTotal: 0,
      blockMessageTooLongTotal: 0,
      blockTotalCharsTooLongTotal: 0,
      rateLimitedTotal: 0,
      latencyLt2s: 0,
      latency2To5s: 0,
      latency5To10s: 0,
      latencyGt10s: 0,
    };
  }
  return globalForStore.__advisorTelemetry;
}

function bucketLatency(telemetry: AdvisorTelemetry, durationMs: number) {
  if (durationMs < 2000) {
    telemetry.latencyLt2s += 1;
    return;
  }
  if (durationMs < 5000) {
    telemetry.latency2To5s += 1;
    return;
  }
  if (durationMs < 10000) {
    telemetry.latency5To10s += 1;
    return;
  }
  telemetry.latencyGt10s += 1;
}

function recordTelemetryEvent({
  outcome,
  status,
  errorCode,
  durationMs,
  bodyBytes,
  currentMessageChars,
  itemInsightsUsed,
  itemInsightsType,
  intent,
  intentConfidenceBand,
  entityResolutionOutcome,
  candidateCount,
  resolvedItemCount,
  contextSwitchDetected,
}: {
  outcome: 'success' | 'validation_block' | 'rate_limited' | 'error';
  status: number;
  errorCode?: string;
  durationMs: number;
  bodyBytes?: number;
  currentMessageChars?: number;
  itemInsightsUsed?: boolean;
  itemInsightsType?: 'item_movers' | 'item_trend';
  intent?: AdvisorIntent;
  intentConfidenceBand?: 'low' | 'medium' | 'high';
  entityResolutionOutcome?: 'resolved' | 'assumed' | 'clarified' | 'unresolved';
  candidateCount?: number;
  resolvedItemCount?: number;
  contextSwitchDetected?: boolean;
}) {
  const telemetry = getTelemetryStore();
  telemetry.requestsTotal += 1;
  bucketLatency(telemetry, durationMs);

  if (outcome === 'success') telemetry.successTotal += 1;
  if (outcome === 'error') telemetry.errorTotal += 1;
  if (outcome === 'rate_limited') telemetry.rateLimitedTotal += 1;
  if (errorCode === 'MESSAGE_TOO_LONG') telemetry.blockMessageTooLongTotal += 1;
  if (errorCode === 'TOTAL_MESSAGES_TOO_LONG') telemetry.blockTotalCharsTooLongTotal += 1;

  console.info('advisor.telemetry', {
    outcome,
    status,
    errorCode: errorCode || null,
    durationMs,
    bodyBytes: typeof bodyBytes === 'number' ? bodyBytes : null,
    currentMessageChars: typeof currentMessageChars === 'number' ? currentMessageChars : null,
    itemInsightsUsed: itemInsightsUsed === true,
    itemInsightsType: itemInsightsType || null,
    intent: intent || null,
    intentConfidenceBand: intentConfidenceBand || null,
    entityResolutionOutcome: entityResolutionOutcome || null,
    candidateCount: typeof candidateCount === 'number' ? candidateCount : null,
    resolvedItemCount: typeof resolvedItemCount === 'number' ? resolvedItemCount : null,
    contextSwitchDetected: contextSwitchDetected === true,
    counters: {
      requestsTotal: telemetry.requestsTotal,
      successTotal: telemetry.successTotal,
      errorTotal: telemetry.errorTotal,
      blockMessageTooLongTotal: telemetry.blockMessageTooLongTotal,
      blockTotalCharsTooLongTotal: telemetry.blockTotalCharsTooLongTotal,
      rateLimitedTotal: telemetry.rateLimitedTotal,
      latencyLt2s: telemetry.latencyLt2s,
      latency2To5s: telemetry.latency2To5s,
      latency5To10s: telemetry.latency5To10s,
      latencyGt10s: telemetry.latencyGt10s,
    },
  });
}

function getRateLimitStore(): RateLimitStore {
  const globalForStore = globalThis as typeof globalThis & { __analystRateLimitStore?: RateLimitStore };
  if (!globalForStore.__analystRateLimitStore) {
    globalForStore.__analystRateLimitStore = new Map<string, number[]>();
  }
  return globalForStore.__analystRateLimitStore;
}

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

function checkRateLimit(request: Request): boolean {
  const ip = getClientIp(request);
  const store = getRateLimitStore();
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const existing = store.get(ip) || [];
  const recent = existing.filter((timestamp) => timestamp >= windowStart);
  recent.push(now);
  store.set(ip, recent);
  return recent.length <= RATE_LIMIT_MAX_REQUESTS;
}

function safeError(
  message: string,
  status: number,
  details?: Record<string, unknown>
) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status });
}

function parseAndValidateBody(rawBody: string): { ok: true; body: AnalystBody } | { ok: false; error: string; status: number } {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: 'Invalid JSON body.', status: 400 };
  }

  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.', status: 400 };
  }

  const body = payload as Partial<AnalystBody>;
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { ok: false, error: 'messages must be a non-empty array.', status: 400 };
  }
  if (body.messages.length > MAX_MESSAGES) {
    return { ok: false, error: `messages must contain at most ${MAX_MESSAGES} entries.`, status: 400 };
  }

  const validatedMessages: AdvisorMessage[] = [];
  let totalChars = 0;
  for (const msg of body.messages) {
    if (!msg || typeof msg !== 'object') {
      return { ok: false, error: 'Each message must be an object.', status: 400 };
    }
    if (msg.role !== 'user' && msg.role !== 'assistant') {
      return { ok: false, error: 'Message role must be user or assistant.', status: 400 };
    }
    if (typeof msg.content !== 'string') {
      return { ok: false, error: 'Message content must be a string.', status: 400 };
    }
    const trimmed = msg.content.trim();
    if (!trimmed) {
      return { ok: false, error: 'Message content cannot be empty.', status: 400 };
    }
    if (trimmed.length > MAX_MESSAGE_CHARS) {
      return {
        ok: false,
        error: `Your message is too long (${trimmed.length} characters).`,
        status: 400,
      };
    }
    totalChars += trimmed.length;
    validatedMessages.push({ role: msg.role, content: trimmed });
  }

  if (totalChars > MAX_TOTAL_CHARS) {
    return { ok: false, error: `messages content must be at most ${MAX_TOTAL_CHARS} characters in total.`, status: 400 };
  }

  const lastMessage = validatedMessages[validatedMessages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    return { ok: false, error: 'The last message must be from the user.', status: 400 };
  }

  return {
    ok: true,
    body: {
      messages: validatedMessages,
      category: typeof body.category === 'string' ? body.category : undefined,
      period: typeof body.period === 'string' ? body.period : undefined,
    },
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  if (!checkRateLimit(request)) {
    recordTelemetryEvent({
      outcome: 'rate_limited',
      status: 429,
      errorCode: 'RATE_LIMITED',
      durationMs: Date.now() - startedAt,
    });
    return safeError('Too many requests. Please wait and try again.', 429);
  }

  try {
    const rawBody = await request.text();
    const bodySize = new TextEncoder().encode(rawBody).length;
    if (bodySize > MAX_BODY_BYTES) {
      recordTelemetryEvent({
        outcome: 'validation_block',
        status: 413,
        errorCode: 'REQUEST_TOO_LARGE',
        durationMs: Date.now() - startedAt,
        bodyBytes: bodySize,
      });
      return safeError('Request payload is too large.', 413);
    }

    const parsed = parseAndValidateBody(rawBody);
    if (!parsed.ok) {
      if (parsed.error.startsWith('Your message is too long')) {
        const lengthMatch = parsed.error.match(/\((\d+)\s+characters\)/);
        const currentLength = lengthMatch ? Number.parseInt(lengthMatch[1], 10) : null;
        recordTelemetryEvent({
          outcome: 'validation_block',
          status: parsed.status,
          errorCode: 'MESSAGE_TOO_LONG',
          durationMs: Date.now() - startedAt,
          bodyBytes: bodySize,
          currentMessageChars: currentLength ?? undefined,
        });
        return safeError(parsed.error, parsed.status, {
          code: 'MESSAGE_TOO_LONG',
          maxMessageChars: MAX_MESSAGE_CHARS,
          currentLength,
        });
      }
      if (parsed.error.includes(`${MAX_TOTAL_CHARS} characters in total`)) {
        recordTelemetryEvent({
          outcome: 'validation_block',
          status: parsed.status,
          errorCode: 'TOTAL_MESSAGES_TOO_LONG',
          durationMs: Date.now() - startedAt,
          bodyBytes: bodySize,
        });
        return safeError(parsed.error, parsed.status, {
          code: 'TOTAL_MESSAGES_TOO_LONG',
          maxTotalChars: MAX_TOTAL_CHARS,
        });
      }
      recordTelemetryEvent({
        outcome: 'validation_block',
        status: parsed.status,
        errorCode: 'VALIDATION_ERROR',
        durationMs: Date.now() - startedAt,
        bodyBytes: bodySize,
      });
      return safeError(parsed.error, parsed.status, { code: 'VALIDATION_ERROR' });
    }

    const { stats, categoryFilter, periodFilter } = await computeStatsSnapshot(parsed.body.category, parsed.body.period);
    const opsKpis = await computeAdvisorOpsKpis();
    const currentQuestion = parsed.body.messages[parsed.body.messages.length - 1]?.content || '';
    const session = deriveAdvisorSession(parsed.body.messages, currentQuestion);
    const intentResult = classifyAdvisorIntent(currentQuestion, session, parsed.body.messages);
    const confidenceBand = intentConfidenceBand(intentResult.confidence);
    let itemInsights:
      | Awaited<ReturnType<typeof computeAdvisorItemInsights>>
      | undefined;
    if (
      shouldFetchItemInsights(currentQuestion, parsed.body.messages) ||
      session.inItemComparison ||
      intentResult.intent === 'item_trend' ||
      intentResult.intent === 'item_movers' ||
      intentResult.intent === 'mixed'
    ) {
      try {
        itemInsights = await computeAdvisorItemInsights({
          question: currentQuestion,
          categoryFilter,
          intentResult,
          messages: parsed.body.messages,
          session,
        });
      } catch (itemInsightError) {
        // Non-fatal: keep advisor available even if item analytics retrieval fails.
        console.warn('Advisor item insights unavailable:', itemInsightError);
      }
    }

    let reply: string;
    const useDeterministicItemReply =
      !!itemInsights &&
      shouldUseDeterministicItemReply(itemInsights, intentResult, currentQuestion);

    if (useDeterministicItemReply && itemInsights) {
      reply = buildDeterministicAdvisorReply(itemInsights);
    } else {
      reply = await generateAdvisorReply({
        messages: parsed.body.messages,
        stats,
        opsKpis,
        itemInsights,
        intentResult,
        categoryFilter,
        periodFilter,
      });
    }

    recordTelemetryEvent({
      outcome: 'success',
      status: 200,
      durationMs: Date.now() - startedAt,
      bodyBytes: bodySize,
      currentMessageChars: parsed.body.messages[parsed.body.messages.length - 1]?.content.length,
      itemInsightsUsed: !!itemInsights,
      itemInsightsType: itemInsights?.type,
      intent: intentResult.intent,
      intentConfidenceBand: confidenceBand,
      entityResolutionOutcome: itemInsights?.type === 'item_trend' ? itemInsights.resolution_outcome : undefined,
      candidateCount: itemInsights?.type === 'item_trend' ? (itemInsights.candidate_items?.length || 0) : undefined,
      resolvedItemCount: itemInsights?.type === 'item_trend' ? (itemInsights.resolved_item_count || 0) : undefined,
      contextSwitchDetected: itemInsights?.type === 'item_trend' ? itemInsights.context_switch_detected : undefined,
    });
    return NextResponse.json({ reply }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error: any) {
    if (error instanceof Error && error.message === 'MISSING_GEMINI_API_KEY') {
      recordTelemetryEvent({
        outcome: 'error',
        status: 503,
        errorCode: 'MISSING_GEMINI_API_KEY',
        durationMs: Date.now() - startedAt,
      });
      return safeError('AI advisor is currently unavailable because GEMINI_API_KEY is not configured.', 503);
    }
    recordTelemetryEvent({
      outcome: 'error',
      status: 500,
      errorCode: 'ADVISOR_API_ERROR',
      durationMs: Date.now() - startedAt,
    });
    console.error('AI analyst API error:', error);
    return safeError('Failed to generate advisor response.', 500);
  }
}

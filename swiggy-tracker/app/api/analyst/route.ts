import { NextResponse } from 'next/server';
import { computeStatsSnapshot } from '@/lib/compute-stats';
import { generateAdvisorReply, type AdvisorMessage } from '@/lib/analyst-model';

const MAX_BODY_BYTES = 40 * 1024;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 1200;
const MAX_TOTAL_CHARS = 12000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

type AnalystBody = {
  messages: AdvisorMessage[];
  category?: string;
  period?: string;
};

type RateLimitStore = Map<string, number[]>;

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

function safeError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
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
      return { ok: false, error: `Each message must be at most ${MAX_MESSAGE_CHARS} characters.`, status: 400 };
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
  if (!checkRateLimit(request)) {
    return safeError('Too many requests. Please wait and try again.', 429);
  }

  try {
    const rawBody = await request.text();
    const bodySize = new TextEncoder().encode(rawBody).length;
    if (bodySize > MAX_BODY_BYTES) {
      return safeError('Request payload is too large.', 413);
    }

    const parsed = parseAndValidateBody(rawBody);
    if (!parsed.ok) {
      return safeError(parsed.error, parsed.status);
    }

    const { stats, categoryFilter, periodFilter } = await computeStatsSnapshot(parsed.body.category, parsed.body.period);
    const reply = await generateAdvisorReply({
      messages: parsed.body.messages,
      stats,
      categoryFilter,
      periodFilter,
    });

    return NextResponse.json({ reply }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error: any) {
    if (error instanceof Error && error.message === 'MISSING_GEMINI_API_KEY') {
      return safeError('AI advisor is currently unavailable because GEMINI_API_KEY is not configured.', 503);
    }
    console.error('AI analyst API error:', error);
    return safeError('Failed to generate advisor response.', 500);
  }
}

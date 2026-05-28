import type { AdvisorMessage } from '@/lib/analyst-model';
import type { ItemMetricHint } from '@/lib/advisor-intent';

export type AdvisorSessionState = {
  activeItems: string[];
  metric?: ItemMetricHint;
  trendMonths?: number;
  trendWeeks?: number;
  inItemComparison?: boolean;
};

function cleanItemPhrase(raw: string): string {
  return raw
    .trim()
    .replace(/[?.!,]+$/g, '')
    .replace(/\s+for\s+last\s+(?:\d+|two|three|four|five|six)\s*(?:month|week)s?\s*$/i, '')
    .replace(/\s+(?:over|during)\s+(?:the\s+)?last\s+.+$/i, '')
    .trim();
}

/** Extract product names from natural chat phrasing (not only formal "trend for X"). */
export function extractItemPhrasesFromQuestion(text: string): string[] {
  const quoted = text.match(/["“]([^"”]{2,80})["”]/);
  if (quoted?.[1]) return [cleanItemPhrase(quoted[1])];

  const patterns: RegExp[] = [
    /\b(?:what|how)\s+about\s+(.+?)[?.!,]*$/i,
    /\b(?:yes|yeah|yea|it\s+is|that's|that is)\s+(.+?)[?.!,]*$/i,
    /\b(?:volume|spend)\s+trend\s+for\s+(.+?)(?:\s+for\s+last\b|\s+over\s+|\s+in\s+last\b|[?.!,]|$)/i,
    /\b(?:trend|trends)\s+(?:on|for)\s+item\s+(.+?)(?:\s+(?:over|for|in|during|last)|[?.!,]|$)/i,
    /\b(?:trend|trends)\s+(?:on|for)\s+(.+?)(?:\s+(?:over|for|in|during|last)|[?.!,]|$)/i,
    /\b(?:spend|volume|quantity)\s+(?:on|for)\s+(.+?)(?:\s+(?:over|for|in|during|last)|[?.!,]|$)/i,
    /\bitem\s+(.+?)\s+(?:over|for|in|during|last)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1]
        .split(/\s*(?:,| and | & )\s*/i)
        .map((part) => cleanItemPhrase(part))
        .filter((part) => part.length >= 2)
        .slice(0, 4);
    }
  }

  return [];
}

export function isItemComparisonContext(messages: AdvisorMessage[]): boolean {
  const recentAssistants = messages.filter((m) => m.role === 'assistant').slice(-4);
  if (
    recentAssistants.some(
      (m) => /\|\s*Period\s*\|/i.test(m.content) || /\border volume trend\b/i.test(m.content) || /\bspend trend\b/i.test(m.content)
    )
  ) {
    return true;
  }

  return messages
    .filter((m) => m.role === 'user')
    .some((m) => /\b(?:trend|volume|last\s+\d+\s*month)\b/i.test(m.content) && extractItemPhrasesFromQuestion(m.content).length > 0);
}

export function isItemFollowUp(text: string): boolean {
  return (
    /\b(?:what|how)\s+about\b/i.test(text) ||
    /\b(this|that|same)\s+(item|product)\b/i.test(text) ||
    /\b(?:yes|yeah|yea|it\s+is|that's|that is)\s+\S/i.test(text) ||
    /\bnot\s+overall\b/i.test(text) ||
    /\blast\s+\d+\s*month/i.test(text) ||
    /\blast\s+(?:two|three|four|2|3|4)\s*month/i.test(text) ||
    /\b(?:i\s+)?(?:asked|meant|wanted)\s+(?:for\s+)?last\b/i.test(text)
  );
}

function parseTrendMonths(text: string): number | undefined {
  const explicit = text.match(/\b(?:last\s+)?(\d+)\s*month/i);
  if (explicit?.[1]) {
    const n = Number.parseInt(explicit[1], 10);
    if (Number.isFinite(n) && n >= 1 && n <= 12) return n;
  }
  if (/\b2\s*month|\btwo\s*month/i.test(text)) return 2;
  if (/\b3\s*month|\bthree\s*month/i.test(text)) return 3;
  if (/\b4\s*month|\bfour\s*month/i.test(text)) return 4;
  if (/\b6\s*month|\bsix\s*month/i.test(text)) return 6;
  return undefined;
}

function parseTrendWeeks(text: string): number | undefined {
  if (/\b3\s*week|\bthree\s*week/i.test(text)) return 3;
  if (/\b2\s*week|\btwo\s*week/i.test(text)) return 2;
  if (/\bweek/i.test(text)) return 6;
  return undefined;
}

export function deriveAdvisorSession(
  messages: AdvisorMessage[],
  currentQuestion: string
): AdvisorSessionState {
  const userMessages = messages.filter((m) => m.role === 'user').map((m) => m.content);
  const allUser = userMessages;
  const inItemComparison = isItemComparisonContext(messages);

  const currentPhrases = extractItemPhrasesFromQuestion(currentQuestion);
  let activeItems = currentPhrases;

  if (activeItems.length === 0 && inItemComparison) {
    for (let i = allUser.length - 1; i >= 0; i -= 1) {
      const phrases = extractItemPhrasesFromQuestion(allUser[i]);
      if (phrases.length > 0) {
        activeItems = phrases;
        break;
      }
    }
  }

  let trendMonths: number | undefined;
  let trendWeeks: number | undefined;
  for (let i = allUser.length - 1; i >= 0; i -= 1) {
    const months = parseTrendMonths(allUser[i]);
    const weeks = parseTrendWeeks(allUser[i]);
    if (months) trendMonths = months;
    if (weeks) trendWeeks = weeks;
    if (trendMonths || trendWeeks) break;
  }
  if (!trendMonths && inItemComparison) trendMonths = 3;

  let metric: ItemMetricHint | undefined;
  for (let i = allUser.length - 1; i >= 0; i -= 1) {
    if (/\b(volume|quantity|quantities|count|counts|ordered)\b/i.test(allUser[i])) {
      metric = 'volume';
      break;
    }
    if (/\b(spend|spent|spending)\b/i.test(allUser[i])) {
      metric = 'spend';
      break;
    }
  }
  if (!metric && inItemComparison) metric = 'volume';

  return { activeItems, metric, trendMonths, trendWeeks, inItemComparison };
}

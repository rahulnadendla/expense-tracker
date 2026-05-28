export type AdvisorIntent = 'overall_analytics' | 'item_trend' | 'item_movers' | 'mixed' | 'unknown';
export type ItemMetricHint = 'spend' | 'volume';
export type WindowHint = 'week' | '3_weeks' | 'month' | '3_months';
export type DirectionHint = 'increase' | 'decrease' | 'both';

import type { AdvisorMessage } from '@/lib/analyst-model';
import type { AdvisorSessionState } from '@/lib/advisor-session';
import {
  extractItemPhrasesFromQuestion,
  isItemComparisonContext,
  isItemFollowUp,
} from '@/lib/advisor-session';

export type AdvisorIntentResult = {
  intent: AdvisorIntent;
  confidence: number;
  hints: {
    metric?: ItemMetricHint;
    window?: WindowHint;
    direction?: DirectionHint;
    rawItemPhrase?: string;
    rawItemPhrases?: string[];
  };
};

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function parseMetric(question: string): ItemMetricHint {
  return /\b(volume|quantity|quantities|count|counts|ordered|orders)\b/i.test(question) ? 'volume' : 'spend';
}

function parseWindow(question: string, session?: AdvisorSessionState): WindowHint {
  if (/\b3\s*week|\bthree\s*week/i.test(question)) return '3_weeks';
  if (/\bweek\b/i.test(question)) return 'week';
  if (/\b3\s*month|\bthree\s*month/i.test(question)) return '3_months';
  if (/\b2\s*month|\btwo\s*month/i.test(question)) return '3_months';
  if (session?.trendMonths && session.trendMonths >= 3) return '3_months';
  if (session?.trendWeeks && session.trendWeeks >= 3) return '3_weeks';
  return 'month';
}

function parseDirection(question: string): DirectionHint {
  const hasIncrease = /\bincrease|increased|up|rise|higher|grew|growth|spike\b/i.test(question);
  const hasDecrease = /\bdecrease|decreased|down|drop|lower|fell|decline\b/i.test(question);
  if (hasIncrease && hasDecrease) return 'both';
  if (hasIncrease) return 'increase';
  if (hasDecrease) return 'decrease';
  return 'both';
}

function extractRawItemPhrase(question: string): string | undefined {
  const phrases = extractItemPhrasesFromQuestion(question);
  return phrases[0];
}

function splitItemPhrases(phrase: string): string[] {
  return phrase
    .split(/\s*(?:,| and | & )\s*/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
    .slice(0, 4);
}

export function classifyAdvisorIntent(
  question: string,
  session?: AdvisorSessionState,
  messages?: AdvisorMessage[]
): AdvisorIntentResult {
  const normalized = question.trim();
  const hasItemWords = /\bitem|items|sku|product|products|milk\b/i.test(normalized);
  const hasTrendWord = /\btrend|trends\b/i.test(normalized);
  const hasChangeWord = /\bincrease|decrease|mover|movers|up|down|delta|changed\b/i.test(normalized);
  const hasOverallWords = /\boverall|total|summary|dashboard|category|vendor|restaurant|orders\b/i.test(normalized);
  const hasWellnessAsk = /\bhealthier|healthy|wellness|alternative|alternatives|nutrition|diet|substitute\b/i.test(normalized);
  const rawItemPhrases = extractItemPhrasesFromQuestion(normalized);
  const rawItemPhrase = rawItemPhrases[0];
  const inComparison = session?.inItemComparison || (messages ? isItemComparisonContext(messages) : false);
  const hasItemReference = hasItemWords || rawItemPhrases.length > 0 || (inComparison && isItemFollowUp(normalized));

  let intent: AdvisorIntent = 'unknown';
  let confidence = 0.45;

  if (hasItemReference && hasTrendWord) {
    intent = 'item_trend';
    confidence = 0.86;
  } else if (hasItemReference && hasChangeWord) {
    intent = 'item_movers';
    confidence = 0.83;
  } else if (hasItemReference && hasWellnessAsk && !hasTrendWord && !hasChangeWord) {
    intent = 'overall_analytics';
    confidence = 0.78;
  } else if (hasItemReference && rawItemPhrases.length > 0) {
    intent = 'item_trend';
    confidence = 0.72;
  } else if (hasOverallWords && !hasItemReference) {
    intent = 'overall_analytics';
    confidence = 0.82;
  } else if (hasOverallWords && hasChangeWord) {
    intent = 'mixed';
    confidence = 0.65;
  }

  if (
    (intent === 'unknown' || intent === 'overall_analytics') &&
    inComparison &&
    (rawItemPhrases.length > 0 || isItemFollowUp(normalized) || (session?.activeItems?.length || 0) > 0)
  ) {
    intent = 'item_trend';
    confidence = Math.max(confidence, 0.88);
  }

  if (
    (intent === 'unknown' || intent === 'overall_analytics') &&
    (isItemFollowUp(normalized) || (session?.activeItems?.length || 0) > 0) &&
    (hasTrendWord || /\blast\s+\d+\s*month/i.test(normalized) || /\bnot\s+overall\b/i.test(normalized))
  ) {
    intent = 'item_trend';
    confidence = Math.max(confidence, 0.8);
  }

  return {
    intent,
    confidence: clamp01(confidence),
    hints: {
      metric: session?.metric || parseMetric(normalized),
      window: parseWindow(normalized, session),
      direction: parseDirection(normalized),
      rawItemPhrase,
      rawItemPhrases,
    },
  };
}

export function intentConfidenceBand(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

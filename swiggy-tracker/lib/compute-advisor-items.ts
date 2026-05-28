import { supabase } from '@/lib/supabase';
import type { CategoryFilter } from '@/lib/compute-stats';
import type { AdvisorIntentResult, WindowHint, ItemMetricHint } from '@/lib/advisor-intent';
import type { AdvisorSessionState } from '@/lib/advisor-session';
import {
  extractItemPhrasesFromQuestion,
  isItemComparisonContext,
  isItemFollowUp,
} from '@/lib/advisor-session';

type OrderRow = {
  id: string | number;
  order_date: string;
  category: 'food' | 'grocery';
};

type ItemRow = {
  order_id: string | number;
  item_name: string;
  quantity: number | null;
  total_price: string | null;
};

type ItemMetric = 'spend' | 'volume';
type ResolutionOutcome = 'resolved' | 'assumed' | 'clarified' | 'unresolved';

export type AdvisorItemMover = {
  item_name: string;
  current_value: number;
  previous_value: number;
  absolute_delta: number;
  percent_delta: number | null;
};

export type AdvisorItemInsights =
  | {
      type: 'item_movers';
      metric: ItemMetric;
      window: 'month' | '3_months' | 'week' | '3_weeks';
      category: CategoryFilter;
      top_increases: AdvisorItemMover[];
      top_decreases: AdvisorItemMover[];
    }
  | {
      type: 'item_trend';
      metric: ItemMetric;
      granularity: 'month' | 'week';
      category: CategoryFilter;
      period_keys: string[];
      data_through?: string;
      requested_item: string | null;
      resolved_item: string | null;
      points: Array<{ period: string; value: number }>;
      trends?: Array<{
        requested_item: string | null;
        resolved_item: string | null;
        points: Array<{ period: string; value: number }>;
        candidate_items?: string[];
        resolution_outcome: ResolutionOutcome;
        resolution_note?: string;
      }>;
      candidate_items?: string[];
      resolution_outcome: ResolutionOutcome;
      resolved_item_count?: number;
      context_switch_detected?: boolean;
      resolution_note?: string;
    };

function toAmount(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value || '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function toQuantity(value: number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  return 1;
}

function getWeekKey(dateStr: string): string {
  const date = new Date(dateStr);
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 10).slice(0, 7);
}

function toDateOnly(dateStr: string): string {
  return dateStr.slice(0, 10);
}

function getLatestOrderDate(orders: OrderRow[]): string | null {
  let max = '';
  for (const order of orders) {
    const day = toDateOnly(order.order_date);
    if (day > max) max = day;
  }
  return max || null;
}

/** Anchor trend windows to latest order in data (not wall-clock when data lags). */
function getTrendAnchorDate(orders: OrderRow[], now: Date): Date {
  const latest = getLatestOrderDate(orders);
  if (!latest) return now;
  const latestDate = new Date(`${latest}T12:00:00`);
  return latestDate.getTime() > now.getTime() ? now : latestDate;
}

function cleanItemPhrase(raw: string): string {
  return raw
    .trim()
    .replace(/[?.!,]+$/g, '')
    .replace(/\s+for\s+last\s+(?:\d+|two|three|four|five|six)\s*(?:month|week)s?\s*$/i, '')
    .replace(/\s+(?:over|during)\s+(?:the\s+)?last\s+.+$/i, '')
    .trim();
}

function normalizeItemName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shiftDate(date: Date, unit: 'month' | 'week', amount: number): Date {
  const d = new Date(date);
  if (unit === 'month') {
    d.setMonth(d.getMonth() + amount);
  } else {
    d.setDate(d.getDate() + amount * 7);
  }
  return d;
}

function parseMetricFromHint(metric: ItemMetricHint | undefined, question: string): ItemMetric {
  if (metric) return metric;
  return /\b(volume|quantity|quantities|times|count|counts|ordered)\b/i.test(question) ? 'volume' : 'spend';
}

function isTrendIntent(
  question: string,
  intentResult?: AdvisorIntentResult,
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>,
  session?: AdvisorSessionState
): boolean {
  if (intentResult?.intent === 'item_trend') return true;
  if (intentResult?.intent === 'item_movers') return false;
  if (session?.inItemComparison || (messages && isItemComparisonContext(messages))) {
    if (extractItemPhrasesFromQuestion(question).length > 0 || isItemFollowUp(question)) return true;
  }
  if (isItemFollowUp(question) && !/\bmover|movers\b/i.test(question)) return true;
  if (!/\btrend|trends\b/i.test(question)) return false;
  return /\bitem\b/i.test(question) || /\bon\s+.+\s+(?:over|for|in|during|last)\b/i.test(question) || /\bfor\s+.+\s+(?:over|in|during|last)\b/i.test(question);
}

function parseTrendWindow(
  question: string,
  session?: AdvisorSessionState
): { granularity: 'month' | 'week'; periods: number } {
  const explicitMonths = question.match(/\b(?:last\s+)?(\d+)\s*month/i);
  if (explicitMonths?.[1]) {
    const n = Number.parseInt(explicitMonths[1], 10);
    if (Number.isFinite(n) && n >= 1 && n <= 12) {
      return { granularity: 'month', periods: n };
    }
  }
  if (/\b6\s*month|\bsix\s*month/i.test(question)) return { granularity: 'month', periods: 6 };
  if (/\b4\s*month|\bfour\s*month/i.test(question)) return { granularity: 'month', periods: 4 };
  if (/\b2\s*month|\btwo\s*month/i.test(question)) return { granularity: 'month', periods: 2 };
  if (/\b3\s*month|\bthree\s*month/i.test(question)) return { granularity: 'month', periods: 3 };

  const explicitWeeks = question.match(/\b(?:last\s+)?(\d+)\s*week/i);
  if (explicitWeeks?.[1]) {
    const n = Number.parseInt(explicitWeeks[1], 10);
    if (Number.isFinite(n) && n >= 1 && n <= 12) {
      return { granularity: 'week', periods: n };
    }
  }
  if (/\b3\s*week|\bthree\s*week/i.test(question)) return { granularity: 'week', periods: 3 };
  if (/\b2\s*week|\btwo\s*week/i.test(question)) return { granularity: 'week', periods: 2 };
  if (/\bweek/i.test(question)) return { granularity: 'week', periods: 6 };

  if (session?.trendMonths) return { granularity: 'month', periods: session.trendMonths };
  if (session?.trendWeeks) return { granularity: 'week', periods: session.trendWeeks };

  return { granularity: 'month', periods: 3 };
}

function buildMonthPeriodKeys(anchor: Date, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    keys.push(`${d.getFullYear()}-${month}`);
  }
  return keys;
}

function buildWeekPeriodKeys(anchor: Date, count: number): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(anchor);
    d.setDate(d.getDate() - i * 7);
    const key = getWeekKey(d.toISOString().slice(0, 10));
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  while (keys.length < count) {
    const d = new Date(anchor);
    d.setDate(d.getDate() - keys.length * 7);
    const key = getWeekKey(d.toISOString().slice(0, 10));
    if (!seen.has(key)) {
      seen.add(key);
      keys.unshift(key);
    } else {
      break;
    }
  }
  return keys.slice(-count);
}

function buildPeriodPoints(
  periodKeys: string[],
  periodMap: Map<string, number>
): Array<{ period: string; value: number }> {
  return periodKeys.map((period) => ({
    period,
    value: periodMap.get(period) ?? 0,
  }));
}

function parseMoverWindow(question: string, hintWindow?: WindowHint): 'month' | '3_months' | 'week' | '3_weeks' {
  if (hintWindow) return hintWindow;
  if (/\b3\s*week|\bthree\s*week/i.test(question)) return '3_weeks';
  if (/\bweek/i.test(question)) return 'week';
  if (/\b3\s*month|\bthree\s*month/i.test(question)) return '3_months';
  return 'month';
}

function extractRequestedItems(question: string, rawHints?: string[]): string[] {
  if (rawHints && rawHints.length > 0) {
    return rawHints.map((v) => cleanItemPhrase(v)).filter(Boolean).slice(0, 4);
  }
  return extractItemPhrasesFromQuestion(question);
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function tokenOverlapScore(a: string, b: string): number {
  const aTokens = new Set(a.split(' ').filter(Boolean));
  const bTokens = new Set(b.split(' ').filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  aTokens.forEach((token) => {
    if (bTokens.has(token)) overlap += 1;
  });
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function buildItemNameResolver(itemNames: string[]) {
  const normalized = itemNames.map((name) => ({ original: name, norm: normalizeItemName(name) }));
  return (requested: string | null): { resolved: string | null; outcome: ResolutionOutcome; note?: string; candidates: string[] } => {
    if (!requested) return { resolved: null, outcome: 'unresolved', note: 'No item name detected in question.', candidates: [] };
    const q = normalizeItemName(requested);
    if (!q) return { resolved: null, outcome: 'unresolved', note: 'No item name detected in question.', candidates: [] };

    const exact = normalized.find((item) => item.norm === q);
    if (exact) return { resolved: exact.original, outcome: 'resolved', candidates: [exact.original] };

    const queryTokens = q.split(' ').filter((t) => t.length >= 2);
    const scored = normalized
      .map((item) => {
        const containsBonus = item.norm.includes(q) || q.includes(item.norm) ? 0.25 : 0;
        const allTokensInName =
          queryTokens.length > 0 && queryTokens.every((token) => item.norm.includes(token)) ? 0.3 : 0;
        const overlap = tokenOverlapScore(q, item.norm);
        const distance = levenshteinDistance(q, item.norm);
        const maxLen = Math.max(q.length, item.norm.length) || 1;
        const distanceScore = 1 - distance / maxLen;
        const score = Math.max(
          0,
          Math.min(1, overlap * 0.5 + distanceScore * 0.4 + containsBonus + allTokensInName)
        );
        return { name: item.original, score };
      })
      .sort((a, b) => b.score - a.score);

    const candidates = scored.slice(0, 3).map((s) => s.name);
    if (scored.length === 0 || scored[0].score < 0.45) {
      return { resolved: null, outcome: 'unresolved', note: `Could not confidently match item name "${requested}".`, candidates };
    }
    if (scored[0].score >= 0.8) {
      return { resolved: scored[0].name, outcome: 'resolved', candidates };
    }
    if (scored.length > 1 && scored[0].score - scored[1].score <= 0.06) {
      return { resolved: null, outcome: 'clarified', note: `Multiple close matches found for "${requested}".`, candidates };
    }
    return {
      resolved: scored[0].name,
      outcome: 'assumed',
      note: `Assuming "${scored[0].name}" for "${requested}".`,
      candidates,
    };
  };
}

const ORDER_ITEMS_BATCH_SIZE = 200;

async function fetchItemsForOrderIds(orderIds: Array<string | number>): Promise<ItemRow[]> {
  if (orderIds.length === 0) return [];

  const allItems: ItemRow[] = [];
  for (let i = 0; i < orderIds.length; i += ORDER_ITEMS_BATCH_SIZE) {
    const batch = orderIds.slice(i, i + ORDER_ITEMS_BATCH_SIZE);
    const { data, error } = await supabase
      .from('order_items')
      .select('order_id, item_name, quantity, total_price')
      .in('order_id', batch);

    if (error) throw new Error(error.message);
    allItems.push(...((data || []) as ItemRow[]));
  }
  return allItems;
}

async function loadOrdersAndItems(fromDateIso: string, category: CategoryFilter): Promise<{ orders: OrderRow[]; items: ItemRow[] }> {
  const { data: ordersData, error: ordersError } = await supabase
    .from('orders')
    .select('id, order_date, category')
    .gte('order_date', fromDateIso)
    .order('order_date', { ascending: false });

  if (ordersError) throw new Error(ordersError.message);

  const rawOrders = (ordersData || []) as OrderRow[];
  const orders = category === 'all' ? rawOrders : rawOrders.filter((o) => o.category === category);
  const items = await fetchItemsForOrderIds(orders.map((o) => o.id));
  return { orders, items };
}

function itemMatchesOrderId(orderIdSet: Set<string>, orderId: string | number): boolean {
  const key = String(orderId);
  return orderIdSet.has(key);
}

function itemValue(metric: ItemMetric, row: ItemRow): number {
  return metric === 'spend' ? toAmount(row.total_price) : toQuantity(row.quantity);
}

export function shouldFetchItemInsights(
  question: string,
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
): boolean {
  return (
    /\bitem|items|volume|quantity|quantities|increase|decrease|mover|movers|trend|milk\b/i.test(question) ||
    isItemFollowUp(question) ||
    extractItemPhrasesFromQuestion(question).length > 0 ||
    (messages ? isItemComparisonContext(messages) : false)
  );
}

export async function computeAdvisorItemInsights({
  question,
  categoryFilter,
  intentResult,
  messages,
  session,
}: {
  question: string;
  categoryFilter: CategoryFilter;
  intentResult?: AdvisorIntentResult;
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  session?: AdvisorSessionState;
}): Promise<AdvisorItemInsights> {
  const now = new Date();
  const trendIntent = isTrendIntent(question, intentResult, messages, session);
  const metric = parseMetricFromHint(session?.metric || intentResult?.hints.metric, question);

  if (trendIntent) {
    const { granularity, periods } = parseTrendWindow(question, session);
    const requestedItems = extractRequestedItems(question, intentResult?.hints.rawItemPhrases);
    const previousUserMessages = (messages || []).filter((msg) => msg.role === 'user').slice(0, -1);
    const lastUserMessage = previousUserMessages[previousUserMessages.length - 1];
    const lastRequestedItems = lastUserMessage ? extractRequestedItems(lastUserMessage.content) : [];
    const usesPronounReference =
      /\b(this|that|same)\s+(item|product)\b/i.test(question) || isItemFollowUp(question);

    const sessionItems = session?.activeItems || [];
    const inComparison = session?.inItemComparison || (messages ? isItemComparisonContext(messages) : false);
    const effectiveRequestedItems =
      requestedItems.length > 0
        ? requestedItems
        : sessionItems.length > 0 && (usesPronounReference || isItemFollowUp(question) || inComparison)
          ? sessionItems
          : usesPronounReference
            ? lastRequestedItems
            : [];
    const contextSwitchDetected =
      requestedItems.length > 0 &&
      lastRequestedItems.length > 0 &&
      requestedItems[0].toLowerCase() !== lastRequestedItems[0].toLowerCase();

    const lookbackStart = shiftDate(now, granularity === 'month' ? 'month' : 'week', -(periods + 14));
    const { orders, items } = await loadOrdersAndItems(
      `${lookbackStart.getFullYear()}-${String(lookbackStart.getMonth() + 1).padStart(2, '0')}-${String(lookbackStart.getDate()).padStart(2, '0')}`,
      categoryFilter
    );
    const anchorDate = getTrendAnchorDate(orders, now);
    const periodKeys =
      granularity === 'month'
        ? buildMonthPeriodKeys(anchorDate, periods)
        : buildWeekPeriodKeys(anchorDate, periods);
    const dataThrough = getLatestOrderDate(orders);
    const orderIdSet = new Set(orders.map((o) => String(o.id)));
    const orderPeriod = new Map<string, string>();
    orders.forEach((o) => {
      const key = granularity === 'month' ? getMonthKey(o.order_date) : getWeekKey(o.order_date);
      orderPeriod.set(String(o.id), key);
    });

    const allItemNames = Array.from(new Set(items.map((i) => i.item_name)));
    const resolveItem = buildItemNameResolver(allItemNames);
    const requestedList = effectiveRequestedItems.length > 0 ? effectiveRequestedItems : [null];
    const trendEntries = requestedList.map((requestedItem) => {
      const { resolved, note, candidates, outcome } = resolveItem(requestedItem);
      if (!resolved) {
        return {
          requested_item: requestedItem,
          resolved_item: null,
          points: [],
          candidate_items: candidates,
          resolution_outcome: outcome,
          resolution_note: note,
        };
      }

      const periodMap = new Map<string, number>();
      for (const row of items) {
        if (row.item_name !== resolved) continue;
        if (!itemMatchesOrderId(orderIdSet, row.order_id)) continue;
        const period = orderPeriod.get(String(row.order_id));
        if (!period || !periodKeys.includes(period)) continue;
        periodMap.set(period, (periodMap.get(period) || 0) + itemValue(metric, row));
      }

      const points = buildPeriodPoints(periodKeys, periodMap);

      return {
        requested_item: requestedItem,
        resolved_item: resolved,
        points,
        candidate_items: candidates,
        resolution_outcome: outcome,
        ...(note ? { resolution_note: note } : {}),
      };
    });

    const primary = trendEntries[0] || {
      requested_item: null,
      resolved_item: null,
      points: [],
      resolution_outcome: 'unresolved' as ResolutionOutcome,
    };
    const resolvedCount = trendEntries.filter((entry) => !!entry.resolved_item).length;
    if (!primary.resolved_item && trendEntries.length === 1) {
      return {
        type: 'item_trend',
        metric,
        granularity,
        category: categoryFilter,
        period_keys: periodKeys,
        data_through: dataThrough || undefined,
        requested_item: primary.requested_item,
        resolved_item: null,
        points: [],
        candidate_items: primary.candidate_items,
        resolution_outcome: primary.resolution_outcome,
        resolved_item_count: resolvedCount,
        context_switch_detected: contextSwitchDetected,
        resolution_note: primary.resolution_note,
      };
    }

    return {
      type: 'item_trend',
      metric,
      granularity,
      category: categoryFilter,
      period_keys: periodKeys,
      data_through: dataThrough || undefined,
      requested_item: primary.requested_item,
      resolved_item: primary.resolved_item,
      points: primary.points,
      trends: trendEntries.slice(0, 3),
      candidate_items: primary.candidate_items,
      resolution_outcome: primary.resolution_outcome,
      resolved_item_count: resolvedCount,
      context_switch_detected: contextSwitchDetected,
      ...(primary.resolution_note ? { resolution_note: primary.resolution_note } : {}),
    };
  }

  const window = parseMoverWindow(question, intentResult?.hints.window);
  const directionUnit = window === 'month' || window === '3_months' ? 'month' : 'week';
  const span = window === 'month' || window === 'week' ? 1 : 3;
  const lookbackStart = shiftDate(now, directionUnit, -(span * 3 + 6));
  const { orders, items } = await loadOrdersAndItems(
    `${lookbackStart.getFullYear()}-${String(lookbackStart.getMonth() + 1).padStart(2, '0')}-${String(lookbackStart.getDate()).padStart(2, '0')}`,
    categoryFilter
  );
  const anchorDate = getTrendAnchorDate(orders, now);
  const currentStart = shiftDate(anchorDate, directionUnit, -span);
  const previousStart = shiftDate(anchorDate, directionUnit, -span * 2);
  const orderIdSet = new Set(orders.map((o) => String(o.id)));
  const orderDateById = new Map<string, Date>();
  orders.forEach((o) => orderDateById.set(String(o.id), new Date(`${toDateOnly(o.order_date)}T12:00:00`)));

  const currentMap = new Map<string, number>();
  const previousMap = new Map<string, number>();
  for (const row of items) {
    if (!itemMatchesOrderId(orderIdSet, row.order_id)) continue;
    const orderDate = orderDateById.get(String(row.order_id));
    if (!orderDate) continue;
    const value = itemValue(metric, row);
    const itemName = row.item_name;
    if (orderDate >= currentStart && orderDate <= anchorDate) {
      currentMap.set(itemName, (currentMap.get(itemName) || 0) + value);
    } else if (orderDate >= previousStart && orderDate < currentStart) {
      previousMap.set(itemName, (previousMap.get(itemName) || 0) + value);
    }
  }

  const allNames = new Set<string>([
    ...Array.from(currentMap.keys()),
    ...Array.from(previousMap.keys()),
  ]);
  const movers: AdvisorItemMover[] = [];
  for (const name of Array.from(allNames)) {
    const currentValue = currentMap.get(name) || 0;
    const previousValue = previousMap.get(name) || 0;
    if (currentValue <= 0 && previousValue <= 0) continue;
    const absoluteDelta = currentValue - previousValue;
    const percentDelta = previousValue > 0 ? (absoluteDelta / previousValue) * 100 : null;
    movers.push({
      item_name: name,
      current_value: currentValue,
      previous_value: previousValue,
      absolute_delta: absoluteDelta,
      percent_delta: percentDelta,
    });
  }

  movers.sort((a, b) => b.absolute_delta - a.absolute_delta);
  return {
    type: 'item_movers',
    metric,
    window,
    category: categoryFilter,
    top_increases: movers.slice(0, 10),
    top_decreases: [...movers].reverse().slice(0, 10),
  };
}

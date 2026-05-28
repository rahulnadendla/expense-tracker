import { supabase } from '@/lib/supabase';
import type { CategoryFilter } from '@/lib/compute-stats';

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
      requested_item: string | null;
      resolved_item: string | null;
      points: Array<{ period: string; value: number }>;
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
  return dateStr.slice(0, 7);
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

function parseMetric(question: string): ItemMetric {
  return /\b(volume|quantity|quantities|times|count|counts|ordered)\b/i.test(question) ? 'volume' : 'spend';
}

function isTrendIntent(question: string): boolean {
  return /\btrend\b/i.test(question) && /\bitem\b/i.test(question);
}

function parseTrendWindow(question: string): { granularity: 'month' | 'week'; periods: number } {
  if (/\b3\s*week|\bthree\s*week/i.test(question)) return { granularity: 'week', periods: 3 };
  if (/\bweek/i.test(question)) return { granularity: 'week', periods: 6 };
  return { granularity: 'month', periods: 3 };
}

function parseMoverWindow(question: string): 'month' | '3_months' | 'week' | '3_weeks' {
  if (/\b3\s*week|\bthree\s*week/i.test(question)) return '3_weeks';
  if (/\bweek/i.test(question)) return 'week';
  if (/\b3\s*month|\bthree\s*month/i.test(question)) return '3_months';
  return 'month';
}

function extractRequestedItem(question: string): string | null {
  const quoted = question.match(/["“]([^"”]{2,80})["”]/);
  if (quoted?.[1]) return quoted[1].trim();

  const trendFor = question.match(/\btrend\s+for\s+item\s+(.+?)$/i) || question.match(/\btrend\s+for\s+(.+?)$/i);
  if (trendFor?.[1]) return trendFor[1].trim().replace(/[?.!,]+$/g, '');

  const itemOf = question.match(/\bitem\s+(.+?)\s+(?:over|for|in|during|last)\b/i);
  if (itemOf?.[1]) return itemOf[1].trim().replace(/[?.!,]+$/g, '');
  return null;
}

function buildItemNameResolver(itemNames: string[]) {
  const normalized = itemNames.map((name) => ({ original: name, lower: name.toLowerCase() }));
  return (requested: string | null): { resolved: string | null; note?: string } => {
    if (!requested) return { resolved: null, note: 'No item name detected in question.' };
    const q = requested.toLowerCase().trim();
    if (!q) return { resolved: null, note: 'No item name detected in question.' };

    const exact = normalized.find((item) => item.lower === q);
    if (exact) return { resolved: exact.original };

    const contains = normalized.filter((item) => item.lower.includes(q) || q.includes(item.lower));
    if (contains.length === 1) return { resolved: contains[0].original };
    if (contains.length > 1) {
      return { resolved: contains[0].original, note: `Matched closest item from multiple candidates for "${requested}".` };
    }
    return { resolved: null, note: `Could not confidently match item name "${requested}".` };
  };
}

async function loadOrdersAndItems(fromDateIso: string, category: CategoryFilter): Promise<{ orders: OrderRow[]; items: ItemRow[] }> {
  const { data: ordersData, error: ordersError } = await supabase
    .from('orders')
    .select('id, order_date, category')
    .gte('order_date', fromDateIso);

  if (ordersError) throw new Error(ordersError.message);

  const rawOrders = (ordersData || []) as OrderRow[];
  const orders = category === 'all' ? rawOrders : rawOrders.filter((o) => o.category === category);
  const orderIds = new Set(orders.map((o) => String(o.id)));

  const { data: itemsData, error: itemsError } = await supabase
    .from('order_items')
    .select('order_id, item_name, quantity, total_price');

  if (itemsError) throw new Error(itemsError.message);

  const items = ((itemsData || []) as ItemRow[]).filter((item) => orderIds.has(String(item.order_id)));
  return { orders, items };
}

function itemValue(metric: ItemMetric, row: ItemRow): number {
  return metric === 'spend' ? toAmount(row.total_price) : toQuantity(row.quantity);
}

export function shouldFetchItemInsights(question: string): boolean {
  return /\bitem|items|volume|quantity|quantities|increase|decrease|mover|movers|trend\b/i.test(question);
}

export async function computeAdvisorItemInsights({
  question,
  categoryFilter,
}: {
  question: string;
  categoryFilter: CategoryFilter;
}): Promise<AdvisorItemInsights> {
  const now = new Date();
  const trendIntent = isTrendIntent(question);
  const metric = parseMetric(question);

  if (trendIntent) {
    const { granularity, periods } = parseTrendWindow(question);
    const requestedItem = extractRequestedItem(question);
    const lookbackStart = shiftDate(now, granularity === 'month' ? 'month' : 'week', -(periods + 1));
    const { orders, items } = await loadOrdersAndItems(lookbackStart.toISOString().slice(0, 10), categoryFilter);
    const orderPeriod = new Map<string, string>();
    orders.forEach((o) => {
      const key = granularity === 'month' ? getMonthKey(o.order_date) : getWeekKey(o.order_date);
      orderPeriod.set(String(o.id), key);
    });

    const allItemNames = Array.from(new Set(items.map((i) => i.item_name)));
    const resolveItem = buildItemNameResolver(allItemNames);
    const { resolved, note } = resolveItem(requestedItem);
    if (!resolved) {
      return {
        type: 'item_trend',
        metric,
        granularity,
        category: categoryFilter,
        requested_item: requestedItem,
        resolved_item: null,
        points: [],
        resolution_note: note,
      };
    }

    const periodMap = new Map<string, number>();
    for (const row of items) {
      if (row.item_name !== resolved) continue;
      const period = orderPeriod.get(String(row.order_id));
      if (!period) continue;
      periodMap.set(period, (periodMap.get(period) || 0) + itemValue(metric, row));
    }

    const points = Array.from(periodMap.entries())
      .map(([period, value]) => ({ period, value }))
      .sort((a, b) => a.period.localeCompare(b.period))
      .slice(-periods);

    return {
      type: 'item_trend',
      metric,
      granularity,
      category: categoryFilter,
      requested_item: requestedItem,
      resolved_item: resolved,
      points,
      ...(note ? { resolution_note: note } : {}),
    };
  }

  const window = parseMoverWindow(question);
  const directionUnit = window === 'month' || window === '3_months' ? 'month' : 'week';
  const span = window === 'month' || window === 'week' ? 1 : 3;
  const currentStart = shiftDate(now, directionUnit, -span);
  const previousStart = shiftDate(now, directionUnit, -span * 2);

  const { orders, items } = await loadOrdersAndItems(previousStart.toISOString().slice(0, 10), categoryFilter);
  const orderDateById = new Map<string, Date>();
  orders.forEach((o) => orderDateById.set(String(o.id), new Date(o.order_date)));

  const currentMap = new Map<string, number>();
  const previousMap = new Map<string, number>();
  for (const row of items) {
    const orderDate = orderDateById.get(String(row.order_id));
    if (!orderDate) continue;
    const value = itemValue(metric, row);
    const itemName = row.item_name;
    if (orderDate >= currentStart) {
      currentMap.set(itemName, (currentMap.get(itemName) || 0) + value);
    } else if (orderDate >= previousStart) {
      previousMap.set(itemName, (previousMap.get(itemName) || 0) + value);
    }
  }

  const allNames = new Set<string>([...currentMap.keys(), ...previousMap.keys()]);
  const movers: AdvisorItemMover[] = [];
  for (const name of allNames) {
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

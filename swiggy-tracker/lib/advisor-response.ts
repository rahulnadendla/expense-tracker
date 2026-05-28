import type { AdvisorItemInsights } from '@/lib/compute-advisor-items';
import type { AdvisorIntentResult } from '@/lib/advisor-intent';
import type { CategoryFilter } from '@/lib/compute-stats';

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function metricLabel(metric: 'spend' | 'volume'): string {
  return metric === 'spend' ? 'Spend' : 'Quantity';
}

function categoryLabel(category: CategoryFilter): string {
  if (category === 'all') return 'all categories';
  return category;
}

export function shouldUseDeterministicItemReply(
  insights: AdvisorItemInsights,
  _intentResult?: AdvisorIntentResult,
  _question?: string
): boolean {
  if (insights.type === 'item_trend') {
    return true;
  }

  if (insights.type === 'item_movers') {
    const q = _question || '';
    return (
      _intentResult?.intent === 'item_movers' ||
      /\bmover|movers|increase|decrease|changed\b/i.test(q) ||
      /\btop\s+\d+\s+items?\b/i.test(q)
    );
  }

  return false;
}

function formatClarification(insights: Extract<AdvisorItemInsights, { type: 'item_trend' }>): string {
  const entries =
    insights.trends && insights.trends.length > 0
      ? insights.trends.filter((t) => t.resolution_outcome === 'unresolved' || t.resolution_outcome === 'clarified')
      : [insights];

  const lines: string[] = ['I need a quick clarification before I can show the trend.'];
  for (const entry of entries) {
    const requested = entry.requested_item || insights.requested_item || 'that item';
    if (entry.resolution_note) lines.push(`- ${entry.resolution_note}`);
    else lines.push(`- I could not confidently match "${requested}".`);
    const candidates = entry.candidate_items || insights.candidate_items || [];
    if (candidates.length > 0) {
      lines.push('', 'Did you mean one of these?');
      candidates.slice(0, 5).forEach((name, idx) => {
        lines.push(`${idx + 1}. ${name}`);
      });
      lines.push('', 'Reply with the exact item name (or number from the list).');
    } else {
      lines.push('', 'Please share the exact item name as it appears on your invoices.');
    }
  }
  return lines.join('\n');
}

function formatTrendTable(
  resolvedItem: string,
  requestedItem: string | null,
  metric: 'spend' | 'volume',
  granularity: 'month' | 'week',
  periodKeys: string[],
  points: Array<{ period: string; value: number }>,
  note?: string
): string {
  const valueByPeriod = new Map(points.map((p) => [p.period, p.value]));
  const lines: string[] = [];
  const label = metricLabel(metric);
  const windowLabel = granularity === 'month' ? `${periodKeys.length} calendar months` : `${periodKeys.length} weeks`;

  lines.push(`### ${resolvedItem}`);
  if (requestedItem && requestedItem.toLowerCase() !== resolvedItem.toLowerCase()) {
    lines.push(`Matched from: "${requestedItem}"`);
  }
  if (note) lines.push(note);
  lines.push('');
  lines.push(`| Period | ${label} |`);
  lines.push('| --- | ---: |');
  for (const period of periodKeys) {
    const value = valueByPeriod.get(period) ?? 0;
    const formatted = metric === 'spend' ? formatInr(value) : value.toLocaleString('en-IN');
    lines.push(`| ${period} | ${formatted} |`);
  }
  lines.push('');
  lines.push(`Window: last ${windowLabel} ending at the latest month in your order data (missing periods shown as 0).`);
  return lines.join('\n');
}

function formatItemTrendReply(insights: Extract<AdvisorItemInsights, { type: 'item_trend' }>): string {
  const periodKeys = insights.period_keys || [];
  const allEntries = insights.trends || [];
  const resolvedEntries = allEntries.filter((t) => t.resolved_item);
  const unresolvedEntries = allEntries.filter(
    (t) => t.resolution_outcome === 'unresolved' || t.resolution_outcome === 'clarified'
  );

  const primaryResolved =
    resolvedEntries[0] ||
    (insights.resolved_item
      ? {
          requested_item: insights.requested_item,
          resolved_item: insights.resolved_item,
          points: insights.points,
          resolution_note: insights.resolution_note,
        }
      : null);

  if (!primaryResolved && unresolvedEntries.length === 0) {
    return formatClarification(insights);
  }

  const sections: string[] = [];
  const metric = insights.metric;

  if (primaryResolved) {
    sections.push(
      `Here is the ${metric === 'spend' ? 'spend' : 'order volume'} trend for your selected filter (${categoryLabel(insights.category)}).`
    );
    if (insights.data_through) {
      sections.push(`_Order data through **${insights.data_through}** (trend window ends at your latest order)._`);
    }
    if (insights.context_switch_detected) {
      sections.push('_Switched to the newly requested item(s) for this answer._');
    }
    sections.push('');

    const list = resolvedEntries.length > 0 ? resolvedEntries : [primaryResolved];
    for (const entry of list) {
      if (!entry.resolved_item) continue;
      sections.push(
        formatTrendTable(
          entry.resolved_item,
          entry.requested_item,
          metric,
          insights.granularity,
          periodKeys,
          entry.points,
          entry.resolution_note
        )
      );
    }
  }

  if (unresolvedEntries.length > 0 || (!primaryResolved && insights.resolution_outcome !== 'resolved')) {
    sections.push(formatClarification({ ...insights, trends: unresolvedEntries.length > 0 ? unresolvedEntries : insights.trends }));
  }

  const totalInWindow = (insights.trends || [])
    .filter((t) => t.resolved_item)
    .reduce((sum, t) => sum + t.points.reduce((p, pt) => p + pt.value, 0), 0);
  if (primaryResolved && totalInWindow === 0) {
    sections.push(
      '_No orders for this item in the selected window. Try a longer range, another category filter, or confirm the exact invoice item name._'
    );
  } else if (primaryResolved) {
    sections.push('**Next step:** Ask for healthier alternatives or compare another item in the same window.');
  }
  return sections.join('\n');
}

function formatMoversReply(insights: Extract<AdvisorItemInsights, { type: 'item_movers' }>): string {
  const metric = insights.metric;
  const label = metricLabel(metric);
  const formatValue = (v: number) => (metric === 'spend' ? formatInr(v) : v.toLocaleString('en-IN'));

  const lines: string[] = [
    `Top item movers (${label.toLowerCase()}, ${insights.window.replace('_', ' ')}, ${categoryLabel(insights.category)}):`,
    '',
    '**Biggest increases**',
    '',
    '| Item | Current | Previous | Change |',
    '| --- | ---: | ---: | ---: |',
  ];

  const increases = insights.top_increases.filter((m) => m.absolute_delta > 0).slice(0, 5);
  if (increases.length === 0) {
    lines.push('| — | — | — | No increases in this window |');
  } else {
    for (const m of increases) {
      const pct = m.percent_delta != null ? `${m.percent_delta >= 0 ? '+' : ''}${m.percent_delta.toFixed(0)}%` : 'n/a';
      lines.push(
        `| ${m.item_name} | ${formatValue(m.current_value)} | ${formatValue(m.previous_value)} | ${formatValue(m.absolute_delta)} (${pct}) |`
      );
    }
  }

  lines.push('', '**Biggest decreases**', '', '| Item | Current | Previous | Change |', '| --- | ---: | ---: | ---: |');
  const decreases = insights.top_decreases.filter((m) => m.absolute_delta < 0).slice(0, 5);
  if (decreases.length === 0) {
    lines.push('| — | — | — | No decreases in this window |');
  } else {
    for (const m of decreases) {
      const pct = m.percent_delta != null ? `${m.percent_delta.toFixed(0)}%` : 'n/a';
      lines.push(
        `| ${m.item_name} | ${formatValue(m.current_value)} | ${formatValue(m.previous_value)} | ${formatValue(m.absolute_delta)} (${pct}) |`
      );
    }
  }

  lines.push('', '**Next step:** Ask for a trend on a specific item over the last 2 or 3 months.');
  return lines.join('\n');
}

export function buildDeterministicAdvisorReply(insights: AdvisorItemInsights): string {
  if (insights.type === 'item_movers') {
    return formatMoversReply(insights);
  }
  return formatItemTrendReply(insights);
}

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { AdminStats } from '@/lib/types';

const IST_OFFSET_MINUTES = 330;
const STALE_HOURS_THRESHOLD = 24;
const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

function getCurrentIstMonth(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function addOneMonth(month: string): string {
  const [yearStr, monthStr] = month.split('-');
  const year = Number.parseInt(yearStr, 10);
  const monthIndex = Number.parseInt(monthStr, 10) - 1;
  const next = new Date(Date.UTC(year, monthIndex + 1, 1));
  const nextYear = next.getUTCFullYear();
  const nextMonth = `${next.getUTCMonth() + 1}`.padStart(2, '0');
  return `${nextYear}-${nextMonth}`;
}

function getIstMonthWindow(month: string): {
  startUtcIso: string;
  endUtcIso: string;
  startDate: string;
  endDateExclusive: string;
  startIst: string;
  endIstExclusive: string;
} {
  const [yearStr, monthStr] = month.split('-');
  const year = Number.parseInt(yearStr, 10);
  const monthIndex = Number.parseInt(monthStr, 10) - 1;

  const startUtcMs = Date.UTC(year, monthIndex, 1, 0, 0, 0, 0) - IST_OFFSET_MINUTES * 60 * 1000;
  const endUtcMs = Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0) - IST_OFFSET_MINUTES * 60 * 1000;

  const nextMonth = addOneMonth(month);

  return {
    startUtcIso: new Date(startUtcMs).toISOString(),
    endUtcIso: new Date(endUtcMs).toISOString(),
    startDate: `${month}-01`,
    endDateExclusive: `${nextMonth}-01`,
    startIst: `${month}-01T00:00:00+05:30`,
    endIstExclusive: `${nextMonth}-01T00:00:00+05:30`,
  };
}

function getLatestIso(values: Array<string | null | undefined>): string | null {
  const valid = values.filter((v): v is string => Boolean(v));
  if (valid.length === 0) return null;
  return valid.reduce((latest, current) =>
    new Date(current).getTime() > new Date(latest).getTime() ? current : latest
  );
}

function getStaleHours(lastEventAt: string | null): number | null {
  if (!lastEventAt) return null;
  const diffMs = Date.now() - new Date(lastEventAt).getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return 0;
  return Number((diffMs / (1000 * 60 * 60)).toFixed(1));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const monthInput = searchParams.get('month');
    const selectedMonth = monthInput && MONTH_REGEX.test(monthInput) ? monthInput : getCurrentIstMonth();
    const monthWindow = getIstMonthWindow(selectedMonth);

    const { data: invoiceRows, error: invoicesError } = await supabase
      .from('invoices_raw')
      .select('id, created_at, file_name, parsed_status, parsed_at, email_date')
      .gte('created_at', monthWindow.startUtcIso)
      .lt('created_at', monthWindow.endUtcIso);

    if (invoicesError) {
      return NextResponse.json(
        { error: 'Failed to fetch invoices', details: invoicesError.message },
        { status: 500 }
      );
    }

    const invoicesUploaded = (invoiceRows || []).length;
    const parsingStatusCounts = (invoiceRows || []).reduce(
      (acc, invoice: any) => {
        const status = invoice.parsed_status;
        if (status === 'completed') acc.completed += 1;
        else if (status === 'failed') acc.failed += 1;
        else if (status === 'processing') acc.processing += 1;
        else acc.pending += 1;
        return acc;
      },
      { completed: 0, failed: 0, processing: 0, pending: 0 }
    );
    const invoicesParsed = parsingStatusCounts.completed;

    const { data: ordersRows, error: ordersError } = await supabase
      .from('orders')
      .select('id, category, order_date')
      .gte('order_date', monthWindow.startDate)
      .lt('order_date', monthWindow.endDateExclusive);

    if (ordersError) {
      return NextResponse.json(
        { error: 'Failed to fetch orders', details: ordersError.message },
        { status: 500 }
      );
    }

    const monthOrdersCountByOrderDate = (ordersRows || []).length;

    const invoiceIds = (invoiceRows || []).map((invoice: any) => invoice.id).filter(Boolean);
    let cohortOrdersRows: any[] = [];
    if (invoiceIds.length > 0) {
      const { data: cohortOrdersData, error: cohortOrdersError } = await supabase
        .from('orders')
        .select('id, category, order_date, invoice_id')
        .in('invoice_id', invoiceIds);

      if (cohortOrdersError) {
        return NextResponse.json(
          { error: 'Failed to fetch cohort orders', details: cohortOrdersError.message },
          { status: 500 }
        );
      }
      cohortOrdersRows = cohortOrdersData || [];
    }

    const cohortOrdersCount = cohortOrdersRows.length;
    const foodCount = cohortOrdersRows.filter((order: any) => order.category === 'food').length;
    const groceryCount = cohortOrdersRows.filter((order: any) => order.category === 'grocery').length;

    const { count: totalOrdersCount, error: totalOrdersError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });

    if (totalOrdersError) {
      return NextResponse.json(
        { error: 'Failed to fetch total orders count', details: totalOrdersError.message },
        { status: 500 }
      );
    }

    const completedInvoicesForCohort = (invoiceRows || [])
      .filter((invoice: any) => invoice.parsed_status === 'completed' && invoice.parsed_at)
      .sort((a: any, b: any) => new Date(b.parsed_at).getTime() - new Date(a.parsed_at).getTime());
    const lastParsedFromCohort = completedInvoicesForCohort[0] || null;
    const lastParsedInvoice =
      lastParsedFromCohort && lastParsedFromCohort.parsed_at
        ? {
            parsed_at: lastParsedFromCohort.parsed_at,
            file_name: lastParsedFromCohort.file_name ?? null,
            parsed_status: lastParsedFromCohort.parsed_status ?? 'completed',
          }
        : null;

    const { data: logsData, error: logsError } = invoiceIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from('parsing_logs')
          .select('created_at, error_message, invoice_id, invoices_raw(file_name, email_date)')
          .eq('status', 'failed')
          .in('invoice_id', invoiceIds)
          .order('created_at', { ascending: false });

    if (logsError) {
      return NextResponse.json(
        { error: 'Failed to fetch failed parsing logs', details: logsError.message },
        { status: 500 }
      );
    }

    const failedParsingLogs = (logsData || []).map((row: any) => ({
      created_at: row.created_at,
      error_message: row.error_message ?? null,
      file_name: row.invoices_raw?.file_name ?? null,
      order_date: row.invoices_raw?.email_date ?? null,
    }));

    const failureReasonMap = new Map<string, number>();
    failedParsingLogs.forEach((log) => {
      const reason = (log.error_message || 'Unknown parsing error').trim();
      failureReasonMap.set(reason, (failureReasonMap.get(reason) || 0) + 1);
    });
    const topFailureReasons = Array.from(failureReasonMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const lastInvoiceUploadedAt = getLatestIso((invoiceRows || []).map((invoice: any) => invoice.created_at));
    const lastParsedAt = lastParsedInvoice?.parsed_at ?? null;
    const lastOrderAt = getLatestIso(
      cohortOrdersRows.map((order: any) => (order.order_date ? `${order.order_date}T00:00:00+05:30` : null))
    );
    const staleHours = getStaleHours(lastParsedAt || lastInvoiceUploadedAt);

    const stats: AdminStats = {
      selectedMonth,
      monthRange: {
        startIst: monthWindow.startIst,
        endIstExclusive: monthWindow.endIstExclusive,
      },
      invoicesUploaded,
      invoicesParsed,
      ordersCount: totalOrdersCount ?? 0,
      reconciliation: {
        invoicesUploaded,
        invoicesParsed,
        ordersCreated: cohortOrdersCount,
        deltaParsedVsOrders: invoicesParsed - cohortOrdersCount,
        isMismatch: invoicesParsed !== cohortOrdersCount,
      },
      parsing: {
        total: invoicesUploaded,
        completed: parsingStatusCounts.completed,
        failed: parsingStatusCounts.failed,
        pending: parsingStatusCounts.pending,
        processing: parsingStatusCounts.processing,
        successRate: invoicesUploaded > 0 ? Number(((parsingStatusCounts.completed / invoicesUploaded) * 100).toFixed(1)) : 0,
        topFailureReasons,
      },
      categorySplit: {
        food: foodCount,
        grocery: groceryCount,
        total: cohortOrdersCount,
      },
      freshness: {
        lastInvoiceUploadedAt,
        lastParsedAt,
        lastOrderAt,
        staleHours,
        isStale: staleHours !== null && staleHours > STALE_HOURS_THRESHOLD,
      },
      lastParsedInvoice,
      failedParsingLogs,
    };

    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('Admin stats API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

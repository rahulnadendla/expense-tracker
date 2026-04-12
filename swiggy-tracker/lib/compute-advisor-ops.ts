import { supabase } from '@/lib/supabase';

const IST_OFFSET_MINUTES = 330;

export type AdvisorOpsKpis = {
  selectedMonth: string;
  monthRange: {
    startIst: string;
    endIstExclusive: string;
  };
  invoicesUploaded: number;
  invoicesParsed: number;
  ordersCount: number;
  parsing: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    processing: number;
    successRate: number;
  };
  categorySplit: {
    food: number;
    grocery: number;
    total: number;
  };
};

function getCurrentIstMonth(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
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
  const nextMonth = addOneMonth(month);

  const startUtcMs = Date.UTC(year, monthIndex, 1, 0, 0, 0, 0) - IST_OFFSET_MINUTES * 60 * 1000;
  const endUtcMs = Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0) - IST_OFFSET_MINUTES * 60 * 1000;

  return {
    startUtcIso: new Date(startUtcMs).toISOString(),
    endUtcIso: new Date(endUtcMs).toISOString(),
    startDate: `${month}-01`,
    endDateExclusive: `${nextMonth}-01`,
    startIst: `${month}-01T00:00:00+05:30`,
    endIstExclusive: `${nextMonth}-01T00:00:00+05:30`,
  };
}

export async function computeAdvisorOpsKpis(): Promise<AdvisorOpsKpis> {
  const selectedMonth = getCurrentIstMonth();
  const monthWindow = getIstMonthWindow(selectedMonth);

  const { data: invoiceRows, error: invoicesError } = await supabase
    .from('invoices_raw')
    .select('id, parsed_status')
    .gte('created_at', monthWindow.startUtcIso)
    .lt('created_at', monthWindow.endUtcIso);

  if (invoicesError) {
    throw new Error(invoicesError.message);
  }

  const invoicesUploaded = (invoiceRows || []).length;
  const parsingStatusCounts = (invoiceRows || []).reduce(
    (acc, invoice: { parsed_status: string | null }) => {
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

  const { count: totalOrdersCount, error: totalOrdersError } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true });

  if (totalOrdersError) {
    throw new Error(totalOrdersError.message);
  }

  const { data: monthlyOrders, error: monthlyOrdersError } = await supabase
    .from('orders')
    .select('category')
    .gte('order_date', monthWindow.startDate)
    .lt('order_date', monthWindow.endDateExclusive);

  if (monthlyOrdersError) {
    throw new Error(monthlyOrdersError.message);
  }

  const foodCount = (monthlyOrders || []).filter((order: { category: string | null }) => order.category === 'food').length;
  const groceryCount = (monthlyOrders || []).filter((order: { category: string | null }) => order.category === 'grocery').length;

  return {
    selectedMonth,
    monthRange: {
      startIst: monthWindow.startIst,
      endIstExclusive: monthWindow.endIstExclusive,
    },
    invoicesUploaded,
    invoicesParsed,
    ordersCount: totalOrdersCount ?? 0,
    parsing: {
      total: invoicesUploaded,
      completed: parsingStatusCounts.completed,
      failed: parsingStatusCounts.failed,
      pending: parsingStatusCounts.pending,
      processing: parsingStatusCounts.processing,
      successRate: invoicesUploaded > 0 ? Number(((parsingStatusCounts.completed / invoicesUploaded) * 100).toFixed(1)) : 0,
    },
    categorySplit: {
      food: foodCount,
      grocery: groceryCount,
      total: (monthlyOrders || []).length,
    },
  };
}

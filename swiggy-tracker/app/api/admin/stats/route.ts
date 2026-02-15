import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { AdminStats } from '@/lib/types';

export async function GET() {
  try {
    // invoicesUploaded: count(*) from invoices_raw
    const { count: invoicesUploaded, error: countAllError } = await supabase
      .from('invoices_raw')
      .select('*', { count: 'exact', head: true });

    if (countAllError) {
      return NextResponse.json(
        { error: 'Failed to count invoices', details: countAllError.message },
        { status: 500 }
      );
    }

    // invoicesParsed: count where parsed_status = 'completed'
    const { count: invoicesParsed, error: countParsedError } = await supabase
      .from('invoices_raw')
      .select('*', { count: 'exact', head: true })
      .eq('parsed_status', 'completed');

    if (countParsedError) {
      return NextResponse.json(
        { error: 'Failed to count parsed invoices', details: countParsedError.message },
        { status: 500 }
      );
    }

    // lastParsedInvoice: one row where parsed_status = 'completed', order by parsed_at desc
    const { data: lastRow, error: lastError } = await supabase
      .from('invoices_raw')
      .select('parsed_at, file_name, parsed_status')
      .eq('parsed_status', 'completed')
      .order('parsed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastError) {
      return NextResponse.json(
        { error: 'Failed to fetch last parsed invoice', details: lastError.message },
        { status: 500 }
      );
    }

    const lastParsedInvoice =
      lastRow && lastRow.parsed_at
        ? { parsed_at: lastRow.parsed_at, file_name: lastRow.file_name ?? null, parsed_status: lastRow.parsed_status ?? 'completed' }
        : null;

    // failedParsingLogs: parsing_logs where status = 'failed', with file_name and email_date from invoices_raw
    const { data: logsData, error: logsError } = await supabase
      .from('parsing_logs')
      .select('created_at, error_message, invoice_id, invoices_raw(file_name, email_date)')
      .eq('status', 'failed')
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
    })).sort((a, b) => {
      const aDate = a.order_date ? new Date(a.order_date).getTime() : 0;
      const bDate = b.order_date ? new Date(b.order_date).getTime() : 0;
      return bDate - aDate;
    });

    const { count: totalOrdersCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });

    const stats: AdminStats = {
      invoicesUploaded: invoicesUploaded ?? 0,
      invoicesParsed: invoicesParsed ?? 0,
      ordersCount: totalOrdersCount ?? 0,
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

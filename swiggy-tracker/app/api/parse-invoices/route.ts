import { NextResponse } from 'next/server';
import { supabase, BUCKET_NAME } from '@/lib/supabase';
import { parsePDF } from '@/lib/pdf-parser';
import type { InvoiceRaw, ParseFreshnessStatus, ParseResult, ParseSummary } from '@/lib/types';

const BATCH_SIZE = 20; // Process 20 invoices per request (paid tier: 1000 RPM, 10K RPD)
const PARSE_COOLDOWN_MS = 60 * 1000;
const STALE_ON_LOAD_MINUTES = 24 * 60;
const INTERACTIVE_PARSE_COOLDOWN_MS = 15 * 1000;

type ParseSource = 'manual' | 'auto' | 'cron' | 'auto_on_load';
type ProcessInvoiceResult = ParseResult & { skipped?: boolean };

declare global {
  // eslint-disable-next-line no-var
  var __parseInvoicesInProgress: boolean | undefined;
  // eslint-disable-next-line no-var
  var __parseInvoicesLastRunAt: number | undefined;
  // eslint-disable-next-line no-var
  var __manualParseLastRunByIp: Map<string, number> | undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode');
  if (mode === 'status') {
    return getParseStatusResponse();
  }

  const source = parseSourceFromRaw(searchParams.get('source'));
  if (source !== 'cron') return NextResponse.json({ error: 'GET not supported for this source' }, { status: 405 });
  const authResponse = validateCronAuth(source, request);
  if (authResponse) return authResponse;

  return parseInvoices(source);
}

export async function POST(request: Request) {
  const sourceHeader = request.headers.get('x-parse-source');
  if (!sourceHeader || !isParseSource(sourceHeader)) {
    return NextResponse.json({ error: 'Invalid parse source' }, { status: 400 });
  }
  const source = sourceHeader;
  const interactiveResponse = validateInteractiveRequest(source, request);
  if (interactiveResponse) return interactiveResponse;
  const authResponse = validateCronAuth(source, request);
  if (authResponse) return authResponse;

  return parseInvoices(source);
}

async function parseInvoices(source: ParseSource) {
  if (globalThis.__parseInvoicesInProgress) {
    return NextResponse.json(
      {
        message: 'Parsing already in progress',
        source,
      },
      { status: 202 }
    );
  }

  const now = Date.now();
  const lastRunAt = globalThis.__parseInvoicesLastRunAt ?? 0;
  if (source !== 'manual' && now - lastRunAt < PARSE_COOLDOWN_MS) {
    return NextResponse.json(
      {
        message: 'Auto parse skipped due to cooldown',
        source,
      },
      { status: 200 }
    );
  }

  globalThis.__parseInvoicesInProgress = true;

  const summary: ParseSummary = {
    parsed: 0,
    failed: 0,
    skipped: 0,
    remaining: 0,
    errors: [],
  };

  try {
    // 1. Query pending invoices
    const { data: pendingInvoices, error: queryError } = await supabase
      .from('invoices_raw')
      .select('*')
      .eq('parsed_status', 'pending')
      .limit(BATCH_SIZE);

    if (queryError) {
      console.error('Failed to query pending invoices:', queryError);
      return NextResponse.json(
        { error: 'Failed to query pending invoices' },
        { status: 500 }
      );
    }

    if (!pendingInvoices || pendingInvoices.length === 0) {
      return NextResponse.json({
        message: 'No pending invoices to process',
        source,
        summary,
      });
    }

    summary.remaining = pendingInvoices.length;

    // 2. Process each invoice with rate limiting (avoid API limits)
    for (const invoice of pendingInvoices as InvoiceRaw[]) {
      const result = await processOneInvoice(invoice);

      if (result.skipped) {
        summary.skipped++;
      } else if (result.success) {
        summary.parsed++;
      } else {
        summary.failed++;
        if (result.error) {
          summary.errors.push(`${invoice.file_name}: ${result.error}`);
        }
      }

      summary.remaining--;

      // Rate limiting: 100ms delay between API calls (paid tier: 1000 RPM = ~60ms per request)
      if (summary.remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // 3. Count remaining pending invoices
    const { count } = await supabase
      .from('invoices_raw')
      .select('*', { count: 'exact', head: true })
      .eq('parsed_status', 'pending');

    summary.remaining = count || 0;

    return NextResponse.json({
      message: `Processed ${summary.parsed} invoices`,
      source,
      summary,
    });
  } catch (error: any) {
    console.error('Parse invoices error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    globalThis.__parseInvoicesInProgress = false;
    globalThis.__parseInvoicesLastRunAt = Date.now();
  }
}

async function processOneInvoice(invoice: InvoiceRaw): Promise<ProcessInvoiceResult> {
  try {
    const { data: claimedRows, error: claimError } = await supabase
      .from('invoices_raw')
      .update({ parsed_status: 'processing' })
      .eq('id', invoice.id)
      .eq('parsed_status', 'pending')
      .select('id');

    if (claimError) {
      throw new Error(`Failed to claim invoice for processing: ${claimError.message}`);
    }

    if (!claimedRows || claimedRows.length === 0) {
      return {
        success: true,
        invoice_id: invoice.id,
        skipped: true,
      };
    }

    // 1. Download PDF from Storage
    const pdfPath = extractPathFromUrl(invoice.pdf_url || '', invoice.file_name || '');
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from(BUCKET_NAME)
      .download(pdfPath);

    if (downloadError || !pdfData) {
      throw new Error(`Failed to download PDF: ${downloadError?.message || 'No data'}`);
    }

    // Convert Blob to Buffer
    const arrayBuffer = await pdfData.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    // 2. Parse PDF
    const parsedOrder = await parsePDF(pdfBuffer);

    // 3. Check for duplicate order_id
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('order_id', parsedOrder.order_id)
      .single();

    if (existingOrder) {
      // Already parsed, mark as completed but skip insert
      await supabase
        .from('invoices_raw')
        .update({
          parsed_status: 'completed',
          parsed_at: new Date().toISOString(),
        })
        .eq('id', invoice.id);

      return {
        success: true,
        invoice_id: invoice.id,
        order_id: parsedOrder.order_id,
      };
    }

    // 4. Insert into orders table
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert({
        invoice_id: invoice.id,
        order_id: parsedOrder.order_id,
        order_date: parsedOrder.order_date,
        order_time: parsedOrder.order_time,
        category: parsedOrder.category,
        restaurant_name: parsedOrder.restaurant_name,
        store_name: parsedOrder.store_name,
        subtotal: parsedOrder.subtotal,
        delivery_fee: parsedOrder.delivery_fee,
        taxes: parsedOrder.taxes,
        discounts: parsedOrder.discounts,
        total_amount: parsedOrder.total_amount,
        payment_method: parsedOrder.payment_method,
      })
      .select('id')
      .single();

    if (orderError || !orderData) {
      throw new Error(`Failed to insert order: ${orderError?.message || 'No data'}`);
    }

    // 5. Insert items into order_items table
    if (parsedOrder.items.length > 0) {
      const itemsToInsert = parsedOrder.items.map((item) => ({
        order_id: orderData.id,
        item_name: item.item_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(itemsToInsert);

      if (itemsError) {
        // Log but don't fail the whole parse
        console.error('Failed to insert items:', itemsError);
      }
    }

    // 6. Update invoice status to completed
    await supabase
      .from('invoices_raw')
      .update({
        parsed_status: 'completed',
        parsed_at: new Date().toISOString(),
        parse_error: null,
      })
      .eq('id', invoice.id);

    // 7. Log success to parsing_logs
    await supabase.from('parsing_logs').insert({
      invoice_id: invoice.id,
      attempt_number: 1,
      status: 'success',
      extracted_text: null, // Could store first 500 chars if needed
      error_message: null,
    });

    return {
      success: true,
      invoice_id: invoice.id,
      order_id: parsedOrder.order_id,
    };
  } catch (error: any) {
    console.error(`Failed to process invoice ${invoice.id}:`, error);

    // Mark invoice as failed
    await supabase
      .from('invoices_raw')
      .update({
        parsed_status: 'failed',
        parse_error: error.message,
      })
      .eq('id', invoice.id);

    // Log failure to parsing_logs
    await supabase.from('parsing_logs').insert({
      invoice_id: invoice.id,
      attempt_number: 1,
      status: 'failed',
      extracted_text: null,
      error_message: error.message,
    });

    return {
      success: false,
      invoice_id: invoice.id,
      error: error.message,
    };
  }
}

/**
 * Extract storage path from pdf_url or file_name
 * pdf_url format: https://project.supabase.co/storage/v1/object/swiggy-invoices/food/2025/02/file.pdf
 * OR just the path: food/2025/02/file.pdf
 */
function extractPathFromUrl(pdfUrl: string, fileName: string): string {
  if (!pdfUrl) {
    // Fallback: guess from file_name (e.g., "taco/xxx.pdf")
    return fileName;
  }

  // Extract path after bucket name
  const bucketPattern = new RegExp(`${BUCKET_NAME}/(.+)$`);
  const match = pdfUrl.match(bucketPattern);
  if (match) {
    return match[1];
  }

  // If pdfUrl is already just the path
  if (!pdfUrl.startsWith('http')) {
    return pdfUrl;
  }

  // Last resort: use file_name
  return fileName;
}

async function getParseStatusResponse() {
  try {
    const [
      { count: pending, error: pendingError },
      { count: processing, error: processingError },
      { count: failed, error: failedError },
      { data: lastParsedRow, error: lastParsedError },
      { data: lastInvoiceRow, error: lastInvoiceError },
    ] =
      await Promise.all([
        supabase.from('invoices_raw').select('*', { count: 'exact', head: true }).eq('parsed_status', 'pending'),
        supabase.from('invoices_raw').select('*', { count: 'exact', head: true }).eq('parsed_status', 'processing'),
        supabase.from('invoices_raw').select('*', { count: 'exact', head: true }).eq('parsed_status', 'failed'),
        supabase
          .from('invoices_raw')
          .select('parsed_at')
          .eq('parsed_status', 'completed')
          .not('parsed_at', 'is', null)
          .order('parsed_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('invoices_raw')
          .select('created_at')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    const firstError =
      pendingError || processingError || failedError || lastParsedError || lastInvoiceError;
    if (firstError) {
      console.error('Failed to fetch parse status:', firstError);
      return NextResponse.json(
        { error: 'Failed to fetch parsing freshness status' },
        { status: 500 }
      );
    }

    const lastInvoiceUploadedAt = lastInvoiceRow?.created_at ?? null;
    const lastParsedAt = lastParsedRow?.parsed_at ?? null;
    const staleMinutes =
      lastParsedAt === null
        ? null
        : Math.max(0, Math.round((Date.now() - new Date(lastParsedAt).getTime()) / (1000 * 60)));
    const pendingCount = pending ?? 0;
    const hasPending = pendingCount > 0;
    const isStale = staleMinutes === null || staleMinutes >= STALE_ON_LOAD_MINUTES;
    const status: ParseFreshnessStatus = {
      pending: pendingCount,
      processing: processing ?? 0,
      failed: failed ?? 0,
      lastInvoiceUploadedAt,
      lastParsedAt,
      staleMinutes,
      hasPending,
      isStale,
      shouldAutoParseOnLoad: hasPending && isStale,
    };

    return NextResponse.json(status);
  } catch (error: any) {
    console.error('Failed to fetch parse status response:', error);
    return NextResponse.json(
      { error: 'Failed to fetch parsing freshness status' },
      { status: 500 }
    );
  }
}

function isParseSource(rawSource: string): rawSource is ParseSource {
  return rawSource === 'manual' || rawSource === 'auto' || rawSource === 'cron' || rawSource === 'auto_on_load';
}

function parseSourceFromRaw(rawSource: string | null): ParseSource | null {
  if (rawSource === null) return 'manual';
  return isParseSource(rawSource) ? rawSource : null;
}

function validateCronAuth(source: ParseSource, request: Request) {
  if (source === 'manual' || source === 'auto_on_load') return null;

  const authHeader = request.headers.get('authorization');
  const expectedSecret = source === 'cron' ? process.env.CRON_SECRET : process.env.PARSE_TRIGGER_SECRET;
  if (!expectedSecret) {
    console.error(`Missing secret for parse source ${source}`);
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized request' }, { status: 401 });
  }

  return null;
}

function validateInteractiveRequest(source: ParseSource, request: Request) {
  if (source !== 'manual' && source !== 'auto_on_load') return null;

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) {
    return NextResponse.json({ error: 'Missing request origin' }, { status: 403 });
  }
  if (origin && host) {
    const expectedOrigin = `https://${host}`;
    const expectedOriginHttp = `http://${host}`;
    if (origin !== expectedOrigin && origin !== expectedOriginHttp) {
      return NextResponse.json({ error: 'Cross-origin parse request blocked' }, { status: 403 });
    }
  }

  const ip = getClientIp(request);
  const now = Date.now();
  if (!globalThis.__manualParseLastRunByIp) {
    globalThis.__manualParseLastRunByIp = new Map<string, number>();
  }
  const lastAt = globalThis.__manualParseLastRunByIp.get(ip) ?? 0;
  if (now - lastAt < INTERACTIVE_PARSE_COOLDOWN_MS) {
    return NextResponse.json({ error: 'Parse request rate-limited' }, { status: 429 });
  }
  globalThis.__manualParseLastRunByIp.set(ip, now);
  return null;
}

function getClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) return 'unknown';
  return forwarded.split(',')[0]?.trim() || 'unknown';
}

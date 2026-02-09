import { NextResponse } from 'next/server';
import { supabase, BUCKET_NAME } from '@/lib/supabase';
import { parsePDF } from '@/lib/pdf-parser';
import type { InvoiceRaw, ParseResult, ParseSummary } from '@/lib/types';

const BATCH_SIZE = 20; // Process 20 invoices per request (paid tier: 1000 RPM, 10K RPD)

export async function GET() {
  return parseInvoices();
}

export async function POST() {
  return parseInvoices();
}

async function parseInvoices() {
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
      return NextResponse.json(
        { error: 'Failed to query pending invoices', details: queryError.message },
        { status: 500 }
      );
    }

    if (!pendingInvoices || pendingInvoices.length === 0) {
      return NextResponse.json({
        message: 'No pending invoices to process',
        summary,
      });
    }

    summary.remaining = pendingInvoices.length;

    // 2. Process each invoice with rate limiting (avoid API limits)
    for (const invoice of pendingInvoices as InvoiceRaw[]) {
      const result = await processOneInvoice(invoice);
      
      if (result.success) {
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
      summary,
    });
  } catch (error: any) {
    console.error('Parse invoices error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

async function processOneInvoice(invoice: InvoiceRaw): Promise<ParseResult> {
  try {
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

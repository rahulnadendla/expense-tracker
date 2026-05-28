export interface InvoiceRaw {
  id: string;
  created_at: string;
  email_subject: string | null;
  email_date: string | null;
  sender_email: string | null;
  pdf_url: string | null;
  file_name: string | null;
  file_size: number | null;
  parsed_status: 'pending' | 'processing' | 'completed' | 'failed';
  parsed_at: string | null;
  parse_error: string | null;
}

export interface ParsedOrder {
  order_id: string;
  order_date: string; // ISO date
  order_time?: string | null;
  category: 'food' | 'grocery';
  restaurant_name?: string | null;
  store_name?: string | null;
  subtotal: number;
  delivery_fee?: number;
  taxes: number;
  discounts?: number;
  total_amount: number;
  payment_method?: string | null;
  items: ParsedItem[];
}

export interface ParsedItem {
  item_name: string;
  quantity: number;
  unit_price?: number;
  total_price: number;
}

export interface ParseResult {
  success: boolean;
  invoice_id?: string;
  order_id?: string;
  error?: string;
}

export interface ParseSummary {
  parsed: number;
  failed: number;
  skipped: number;
  remaining: number;
  errors: string[];
}

export interface ParseFreshnessStatus {
  pending: number;
  processing: number;
  failed: number;
  lastInvoiceUploadedAt: string | null;
  lastParsedAt: string | null;
  staleMinutes: number | null;
  hasPending: boolean;
  isStale: boolean;
  shouldAutoParseOnLoad: boolean;
}

export interface AdminStats {
  selectedMonth: string;
  monthRange: { startIst: string; endIstExclusive: string };
  invoicesUploaded: number;
  invoicesParsed: number;
  /** Total orders in system; matches Overview "Total orders" when category is All */
  ordersCount: number;
  reconciliation: {
    invoicesUploaded: number;
    invoicesParsed: number;
    ordersCreated: number;
    deltaParsedVsOrders: number;
    isMismatch: boolean;
  };
  parsing: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    processing: number;
    successRate: number;
    topFailureReasons: { reason: string; count: number }[];
  };
  categorySplit: {
    food: number;
    grocery: number;
    total: number;
  };
  freshness: {
    lastInvoiceUploadedAt: string | null;
    lastParsedAt: string | null;
    lastOrderAt: string | null;
    staleHours: number | null;
    isStale: boolean;
  };
  lastParsedInvoice: { parsed_at: string; file_name: string | null; parsed_status: string } | null;
  failedParsingLogs: { created_at: string; error_message: string | null; file_name: string | null; order_date: string | null }[];
}

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

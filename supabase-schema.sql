-- Swiggy Expense Tracker - Database Schema
-- Run this in Supabase SQL Editor to set up your database

-- Create enums
CREATE TYPE parsing_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE order_category AS ENUM ('food', 'grocery');

-- Table 1: invoices_raw (stores PDF metadata and processing status)
CREATE TABLE invoices_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  email_subject TEXT NOT NULL,
  email_date TIMESTAMPTZ NOT NULL,
  sender_email TEXT,
  pdf_url TEXT NOT NULL,
  file_name TEXT UNIQUE NOT NULL,
  file_size INTEGER,
  parsed_status parsing_status DEFAULT 'pending',
  parsed_at TIMESTAMPTZ,
  parse_error TEXT
);

-- Table 2: orders (parsed order data)
CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  invoice_id UUID REFERENCES invoices_raw(id),
  order_id TEXT UNIQUE NOT NULL,
  order_date DATE NOT NULL,
  category order_category NOT NULL,
  restaurant_name TEXT,
  store_name TEXT,
  subtotal DECIMAL(10,2) NOT NULL,
  delivery_fee DECIMAL(10,2),
  taxes DECIMAL(10,2) NOT NULL,
  discounts DECIMAL(10,2),
  total_amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT
);

-- Table 3: order_items (line items for each order)
CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2),
  total_price DECIMAL(10,2) NOT NULL
);

-- Table 4: parsing_logs (audit trail for parsing attempts)
CREATE TABLE parsing_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  invoice_id UUID REFERENCES invoices_raw(id),
  attempt_number INTEGER DEFAULT 1,
  status TEXT NOT NULL,
  extracted_text TEXT,
  error_message TEXT
);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE invoices_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE parsing_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow authenticated users full access)
-- Note: Since this is a personal project using service_role key, these policies
-- won't restrict your access, but they're good practice for future auth implementation

CREATE POLICY "Allow authenticated access" ON invoices_raw 
  FOR ALL 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated access" ON orders 
  FOR ALL 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated access" ON order_items 
  FOR ALL 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated access" ON parsing_logs 
  FOR ALL 
  USING (auth.role() = 'authenticated');

-- Create indexes for better query performance
CREATE INDEX idx_invoices_raw_status ON invoices_raw(parsed_status);
CREATE INDEX idx_invoices_raw_file_name ON invoices_raw(file_name);
CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_orders_category ON orders(category);
CREATE INDEX idx_orders_order_id ON orders(order_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_item_name ON order_items(item_name);

-- Verify tables were created
SELECT 
  schemaname,
  tablename,
  tableowner
FROM pg_tables
WHERE tablename IN ('invoices_raw', 'orders', 'order_items', 'parsing_logs')
ORDER BY tablename;

-- Expected output: 4 rows (one for each table)

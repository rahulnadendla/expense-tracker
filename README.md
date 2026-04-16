# Swiggy Expense Tracker

Automatically track and analyze your Swiggy (food delivery) and Instamart (grocery) expenses by processing email invoices.

![Dashboard Screenshot](https://img.shields.io/badge/Status-Production_Ready-success)
![License](https://img.shields.io/badge/License-MIT-blue)

## ✨ Features

- 📧 **Automated Email Processing** - Google Apps Script extracts PDFs from Gmail
- 🤖 **AI-Powered Parsing** - Gemini 2.5 Flash extracts structured data from invoices
- 📊 **Rich Analytics Dashboard** - Interactive charts and tables with filters
- 🎯 **Smart Insights** - Track spending trends, top items, restaurant rankings
- 💰 **Cost Breakdown** - Analyze delivery fees, taxes, and discounts
- 🔄 **Automatic Sync** - New orders processed automatically

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ ([Install Node.js](https://nodejs.org/))
- Supabase account ([Sign up free](https://supabase.com))
- Google Gemini API key ([Get API key](https://aistudio.google.com/app/apikey))
- Gmail account with Swiggy/Instamart order emails

### Setup Steps

#### 1️⃣ Clone the Repository

```bash
git clone <your-repo-url>
cd cursor_project_2
```

#### 2️⃣ Set Up Supabase

**Create a new Supabase project:**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project
3. Run the database schema:
   - Go to SQL Editor
   - Copy and paste SQL from `supabase-schema.sql` (see below)
   - Run the query

**Create storage bucket:**
1. Go to Storage in Supabase Dashboard
2. Create a new bucket named `swiggy-invoices`
3. Set it to **Private** (not public)

#### 3️⃣ Configure Next.js App

```bash
cd swiggy-tracker

# Copy environment template
cp .env.example .env.local

# Edit .env.local and add your credentials
nano .env.local  # or use any text editor
```

Add these values to `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` - From Supabase Dashboard → Settings → API → Project URL
- `SUPABASE_SERVICE_ROLE_KEY` - From Supabase Dashboard → Settings → API → service_role key
- `GEMINI_API_KEY` - From [Google AI Studio](https://aistudio.google.com/app/apikey)
- `BUCKET_NAME` - Keep as `swiggy-invoices`

#### 4️⃣ Install Dependencies & Run

```bash
npm install
npm run build
npm start
```

Dashboard will be available at: **http://localhost:3000**

#### 5️⃣ Set Up Google Apps Script (Email Processing)

See detailed instructions in: `google-apps-script/APPS_SCRIPT_SETUP.md`

**Quick steps:**
1. Go to [Google Apps Script](https://script.google.com)
2. Create new project
3. Copy code from `google-apps-script/Config.gs` and `google-apps-script/SwiggyToSupabase.gs`
4. Set Script Properties (Settings → Script Properties):
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Your service role key
   - `BUCKET_NAME` - `swiggy-invoices`
5. Authorize the script
6. Create Gmail labels: `Swiggy-Invoices/To-Process`
7. Set up time-driven trigger (midnight daily)

#### 6️⃣ Label Your Emails

Apply the label `Swiggy-Invoices/To-Process` to your Swiggy order emails in Gmail.

**Pro tip:** Create a Gmail filter to auto-label future emails:
- From: `noreply@swiggy.in`
- Has attachment: `pdf`
- Apply label: `Swiggy-Invoices/To-Process`

---

## 📊 Features Overview

### Dashboard Tabs

**1. Overview Tab**
- Key metrics (total orders, spending, averages)
- Spending trends (line chart)
- Food vs Grocery split (stacked bar chart)
- Average order value trends
- Top items and restaurants (by volume and spend)

**2. Analytics Tab**
- Monthly spending bar chart
- Monthly taxes breakdown (food vs grocery)
- Food vs Grocery pie chart
- Average cost breakdown
- Restaurant rankings table

**3. Orders Tab**
- Full order history table
- Filterable and sortable
- Category badges

**4. Items Detail View** (`/items`)
- Comprehensive item-level metrics
- 7 sortable columns
- Date range filters (30 days to 1 year)
- Units per month (consumption tracking)

### Filters

**Category:** All / Food / Grocery  
**Period:** Daily (last 14 days) / Weekly (last 12 weeks) / Monthly (last 12 months)

---

## 🏗️ Architecture

```
Gmail → Google Apps Script → Supabase Storage → Next.js Parser (Gemini) → Supabase DB → Dashboard
```

**Tech Stack:**
- **Backend:** Supabase (PostgreSQL + Storage)
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Charts:** Recharts
- **PDF Parsing:** pdf-parse + Google Gemini 2.5 Flash
- **Automation:** Google Apps Script

---

## 📁 Project Structure

```
/cursor_project_2/
├── google-apps-script/        # Gmail → Supabase automation
│   ├── Config.gs              # Configuration
│   ├── SwiggyToSupabase.gs    # Main script
│   └── APPS_SCRIPT_SETUP.md   # Detailed setup guide
├── swiggy-tracker/            # Next.js dashboard
│   ├── app/                   # App Router pages
│   │   ├── page.tsx           # Main dashboard
│   │   ├── items/page.tsx     # Items detail view
│   │   └── api/               # API routes
│   ├── lib/                   # Shared utilities
│   │   ├── pdf-parser.ts      # Gemini-based parser
│   │   ├── supabase.ts        # Supabase client
│   │   └── types.ts           # TypeScript types
│   ├── .env.example           # Environment template
│   └── package.json           # Dependencies
├── PROJECT_OVERVIEW.md        # Complete documentation
├── RETRY_FAILED_INVOICES.md   # Troubleshooting guide
└── README.md                  # This file
```

---

## 🔑 Environment Variables

**Never commit these to git!** They're protected in `.gitignore`.

Create `.env.local` in `swiggy-tracker/` folder:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-key-here
BUCKET_NAME=swiggy-invoices
GEMINI_API_KEY=AI...your-key-here
```

---

## 🗄️ Database Schema (needs to be updated)
Run this in Supabase SQL Editor:

```sql
-- Create enums
CREATE TYPE parsing_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE order_category AS ENUM ('food', 'grocery');

-- Table: invoices_raw (stores PDF metadata)
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

-- Table: orders (parsed order data)
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

-- Table: order_items (line items)
CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2),
  total_price DECIMAL(10,2) NOT NULL
);

-- Table: parsing_logs (audit trail)
CREATE TABLE parsing_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  invoice_id UUID REFERENCES invoices_raw(id),
  attempt_number INTEGER DEFAULT 1,
  status TEXT NOT NULL,
  extracted_text TEXT,
  error_message TEXT
);

-- Enable Row Level Security
ALTER TABLE invoices_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE parsing_logs ENABLE ROW LEVEL SECURITY;

-- Create policies (allow authenticated users)
CREATE POLICY "Allow authenticated access" ON invoices_raw FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated access" ON orders FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated access" ON order_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated access" ON parsing_logs FOR ALL USING (auth.role() = 'authenticated');

-- Create indexes for better performance
CREATE INDEX idx_invoices_raw_status ON invoices_raw(parsed_status);
CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_orders_category ON orders(category);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
```

---

## 🔒 Security Checklist

Before pushing to GitHub:

- ✅ `.env.local` is in `.gitignore`
- ✅ `.env.example` contains only placeholders
- ✅ No hardcoded API keys in code
- ✅ Service role keys only in environment variables
- ✅ Storage bucket is private (not public)
- ✅ RLS enabled on all tables

---

## 🤝 Setup for You

**You will need:**

1. **Your own Supabase project** (free tier works)
2. **Your own Gemini API key** (free tier: 10 RPM, paid: 1000 RPM)
3. **Access to your Gmail** (for Apps Script setup)
4. **Node.js 18+** installed

**Steps they should follow:**
1. Clone the repo
2. Follow "Setup Steps" above
3. Configure their own credentials
4. Set up their own Google Apps Script
5. Label their Swiggy emails

---

## 📝 Configuration Reference

### Batch Sizes
- **Google Apps Script:** 50 emails per run
- **PDF Parser:** 20 invoices per run

### Rate Limits
- **Gemini Free Tier:** 10 RPM, 1K RPD
- **Gemini Paid Tier:** 1000 RPM, 10K RPD
- **Current delay:** 100ms between API calls

### Automation
- **Email processing:** Daily at midnight (Google Apps Script trigger)
- **PDF parsing:** On-demand (dashboard trigger)

---

## 🐛 Troubleshooting

See `PROJECT_OVERVIEW.md` and `RETRY_FAILED_INVOICES.md` for detailed troubleshooting guides.

**Common issues:**
- 404 errors → Restart server with production mode
- Parse failures → Check Gemini API key and model access
- Missing data → Verify Apps Script is running and authorized

---

## 📚 Documentation

- **PROJECT_OVERVIEW.md** - Complete system documentation
- **APPS_SCRIPT_SETUP.md** - Detailed Google Apps Script setup
- **SETUP.md** - Next.js app setup guide
- **RETRY_FAILED_INVOICES.md** - How to handle parsing failures

---

## 🎯 Cost Estimates

**Free Tier (Hobby Use):**
- Supabase: Free (up to 500 MB database, 1 GB storage)
- Gemini API: Free (10 RPM, 1K RPD) - ~30 invoices/day
- Google Apps Script: Free
- **Total:** $0/month

**Paid Tier (Heavy Use):**
- Supabase: Free (still sufficient)
- Gemini API: Pay-as-you-go (~$0.05 per 1K requests)
- **Total:** ~$1-5/month depending on usage

---

## 🤝 Contributing

Contributions welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

---

## 📄 License

MIT License - Feel free to use for personal or commercial projects.

---

## 🙏 Credits

Built with:
- [Next.js](https://nextjs.org/)
- [Supabase](https://supabase.com/)
- [Google Gemini](https://ai.google.dev/)
- [Recharts](https://recharts.org/)

---

## 📧 Support

For questions or issues:
1. Check `PROJECT_OVERVIEW.md` for detailed docs
2. Review troubleshooting guides
3. Open an issue on GitHub

---

**Happy expense tracking! 🎉**

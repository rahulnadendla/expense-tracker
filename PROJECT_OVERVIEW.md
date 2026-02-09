# Swiggy Expense Tracker - Project Documentation

**Last Updated:** February 8, 2026  
**Status:** ✅ Fully Operational

---

## 📋 Table of Contents
1. [Quick Start](#quick-start)
2. [System Architecture](#system-architecture)
3. [Data Flow](#data-flow)
4. [Configuration & Credentials](#configuration--credentials)
5. [Components & Settings](#components--settings)
6. [Automation & Scheduling](#automation--scheduling)
7. [Troubleshooting](#troubleshooting)
8. [Future Enhancements](#future-enhancements)

---

## 🚀 Quick Start

### To Access the Dashboard:
```bash
cd /Users/rahulnadendla/cursor_project_2/swiggy-tracker
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npm start
```
Then open: **http://localhost:3000**

### What Happens Automatically:
1. **Gmail → Supabase** (Midnight daily): Google Apps Script processes new emails with PDFs
2. **Parsing** (On-demand): Dashboard parses PDFs when you open the app or click "Parse New Invoices"
3. **Analytics**: Real-time dashboard with filters and charts

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Gmail Inbox                             │
│                (Emails with Swiggy/Instamart PDFs)              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Labeled: "Swiggy-Invoices/To-Process"
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Google Apps Script (Runs at Midnight)               │
│  • Batch: 50 emails per run                                     │
│  • Extracts PDF attachments                                     │
│  • Detects category (food/grocery from subject)                 │
│  • Uploads to Supabase Storage                                  │
│  • Inserts metadata to invoices_raw                             │
│  • Moves label to "Processed" or "Failed"                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ PDF stored in Supabase Storage
                         │ (bucket: swiggy-invoices)
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Supabase Storage                            │
│  Structure:                                                      │
│  • food/YYYY/MM/filename.pdf                                    │
│  • grocery/YYYY/MM/filename.pdf                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Metadata in invoices_raw
                         │ (status: pending)
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│           Next.js API Route: /api/parse-invoices                │
│  Triggered by:                                                   │
│  • Opening dashboard (auto)                                     │
│  • Clicking "Parse New Invoices" button                         │
│                                                                  │
│  Process:                                                        │
│  1. Query invoices_raw WHERE parsed_status = 'pending'          │
│  2. Fetch up to 20 PDFs per run (BATCH_SIZE)                   │
│  3. Download PDF from Supabase Storage                          │
│  4. Extract text with pdf-parse                                 │
│  5. Send text to Gemini 2.5 Flash API                          │
│  6. Parse JSON response                                         │
│  7. Insert into orders + order_items tables                     │
│  8. Update parsed_status to 'completed'                         │
│  9. Rate limit: 100ms delay between API calls                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Structured data
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase Database Tables                      │
│  • invoices_raw (raw PDFs + metadata)                           │
│  • orders (parsed order data)                                   │
│  • order_items (line items)                                     │
│  • parsing_logs (success/failure logs)                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Analytics queries
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Next.js Dashboard (localhost:3000)                 │
│  • Overview Tab: Metrics, charts, top items/restaurants         │
│  • Analytics Tab: Detailed breakdowns, trends                   │
│  • Orders Tab: Full order history table                         │
│  • Filters: Category (All/Food/Grocery), Period (Daily/Weekly/Monthly) │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow

### Step-by-Step Journey of an Invoice

1. **Email Arrives** → User receives order confirmation from Swiggy/Instamart with PDF attachment
2. **Gmail Labeling** → User (or filter) applies label `Swiggy-Invoices/To-Process`
3. **Google Apps Script (Midnight)** → Script runs, finds labeled emails
4. **PDF Extraction** → Script downloads PDF attachment from email
5. **Category Detection** → Checks subject for "instamart" keyword
   - Contains "instamart" → category = `grocery`
   - Otherwise → category = `food`
6. **Upload to Storage** → PDF uploaded to `swiggy-invoices/{category}/{YYYY}/{MM}/{filename}.pdf`
7. **Database Insert** → Row created in `invoices_raw` with:
   - `email_subject`, `email_date`, `sender_email`
   - `pdf_url` (storage path)
   - `parsed_status = 'pending'`
8. **Label Update** → Email label changed to `Swiggy-Invoices/Processed` (or `Failed` if error)
9. **User Opens Dashboard** → Next.js app loads
10. **Auto-Parse Trigger** → Dashboard calls `/api/parse-invoices`
11. **PDF Download** → API downloads PDF from Supabase Storage (using service role key)
12. **Text Extraction** → `pdf-parse` library extracts text
13. **Gemini API Call** → Text sent to Gemini 2.5 Flash with structured prompt
14. **JSON Response** → Gemini returns parsed data:
    - Order ID, date, restaurant/store name
    - Items (name, quantity, price)
    - Totals (subtotal, delivery, taxes, discounts)
15. **Database Insert** → Data written to `orders` and `order_items` tables
16. **Status Update** → `invoices_raw.parsed_status = 'completed'`
17. **Dashboard Refresh** → Stats API fetches aggregated data
18. **User Views Analytics** → Charts and tables display spending insights

---

## 🔑 Configuration & Credentials

### 1. Supabase Configuration

**Project URL:**
```
https://waoonuuwborifiraklue.supabase.co
```

**Service Role Key Location:**
- **For Next.js App:** `/Users/rahulnadendla/cursor_project_2/swiggy-tracker/.env.local`
- **For Google Apps Script:** Script Properties in Apps Script editor

**Storage Bucket:**
- Name: `swiggy-invoices`
- Access: Private (requires service role key)
- Structure: `{category}/{YYYY}/{MM}/{filename}.pdf`

**Database Tables:**
- `invoices_raw` - Raw invoice metadata
- `orders` - Parsed order data
- `order_items` - Order line items
- `parsing_logs` - Processing logs

**Row Level Security (RLS):**
- Enabled on all tables
- Authenticated users only

### 2. Gemini API Configuration

**Model:** Gemini 2.5 Flash  
**API Key Location:** `/Users/rahulnadendla/cursor_project_2/swiggy-tracker/.env.local`

**Paid Tier Limits:**
- 1000 requests per minute (RPM)
- 10,000 requests per day (RPD)

**Get API Key:** https://aistudio.google.com/app/apikey

### 3. Environment Variables (`.env.local`)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://waoonuuwborifiraklue.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
BUCKET_NAME=swiggy-invoices

# Gemini API
GEMINI_API_KEY=your-gemini-api-key-here
```

### 4. Google Apps Script Configuration

**Script Location:** Google Apps Script Editor (linked to your Gmail account)

**Script Properties (Set via Project Settings → Script Properties):**
- `SUPABASE_URL` = `https://waoonuuwborifiraklue.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = (your service role key)
- `BUCKET_NAME` = `swiggy-invoices`

**Gmail Labels Required:**
- `Swiggy-Invoices/To-Process` (created manually)
- `Swiggy-Invoices/Processed` (auto-created by script)
- `Swiggy-Invoices/Failed` (auto-created by script)

---

## ⚙️ Components & Settings

### Google Apps Script

**Files:**
- `Config.gs` - Configuration and constants
- `SwiggyToSupabase.gs` - Main processing logic

**Key Settings:**
```javascript
BATCH_SIZE = 50  // Emails processed per run
```

**What It Does:**
- Processes emails with label `Swiggy-Invoices/To-Process`
- Extracts PDF attachments (skips emails without PDFs)
- Uploads PDFs to Supabase Storage
- Creates entries in `invoices_raw` table
- Updates Gmail labels based on success/failure
- Checks for duplicates (skips if `file_name` already exists)

**Error Handling:**
- Missing PDFs → Logs "Skipped (no PDF)", doesn't change label
- Upload failures → Adds `Failed` label, keeps `To-Process` for retry
- Duplicate files → Logs "Skipped (duplicate)", moves to `Processed`
- Network errors → Logs error, adds `Failed` label

### Next.js PDF Parser

**Location:** `/swiggy-tracker/lib/pdf-parser.ts`

**Model Used:** Gemini 2.5 Flash  
**Why:** Best price-performance ratio, supports structured JSON output

**Parsing Logic:**
1. Text extraction via `pdf-parse`
2. Send full text to Gemini with structured prompt
3. Gemini returns JSON with order details
4. Validation and cleaning of JSON response
5. Return typed `ParsedOrder` object

**Output Format:**
```typescript
{
  order_id: string,
  order_date: string,
  category: 'food' | 'grocery',
  restaurant_name: string | null,
  store_name: string | null,
  items: Array<{
    item_name: string,
    quantity: number,
    unit_price: string,
    total_price: string
  }>,
  subtotal: string,
  delivery_fee: string,
  taxes: string,
  discounts: string,
  total_amount: string,
  payment_method: string | null
}
```

### API Route: `/api/parse-invoices`

**Location:** `/swiggy-tracker/app/api/parse-invoices/route.ts`

**Key Settings:**
```typescript
BATCH_SIZE = 20  // PDFs parsed per request
RATE_LIMIT_DELAY = 100  // milliseconds between Gemini API calls
```

**Process Flow:**
1. Query `invoices_raw` WHERE `parsed_status = 'pending'` LIMIT 20
2. For each invoice:
   - Download PDF from Supabase Storage
   - Parse with `parsePDF()` function
   - Check for duplicate `order_id` in `orders` table
   - If new: Insert into `orders` and `order_items`
   - Update `invoices_raw.parsed_status = 'completed'`
   - Log to `parsing_logs`
   - Wait 100ms before next
3. Return summary (parsed, failed, skipped, remaining)

**Duplicate Handling:**
- Checks if `order_id` already exists in `orders` table
- If duplicate: Marks invoice as `completed` but doesn't insert
- Prevents re-parsing if triggered multiple times

**Error Handling:**
- Parse failures → Status = `failed`, logs error message
- Network errors → Logged, status remains `pending` for retry

### Dashboard

**Location:** `/swiggy-tracker/app/page.tsx`

**Tabs:**
1. **Overview** - Main metrics, charts, top items/restaurants
2. **Analytics** - Detailed breakdowns, trends, cost analysis
3. **Orders** - Full order history table

**Filters:**
- **Category:** All / Food / Grocery
- **Period:** Daily (last 14 days) / Weekly (last 12 weeks) / Monthly (last 12 months)
- **Default:** Category = All, Period = Monthly

**Key Features:**
- Auto-triggers parsing on page load (checks for pending invoices)
- "Parse New Invoices" button for manual trigger
- Real-time stats (queries `/api/stats`)
- Responsive charts with Recharts library

**Charts:**
1. Spending Over Time (Line chart)
2. Food vs Grocery Split (Stacked bar chart, % breakdown)
3. Average Order Value Trend (Dual line chart)
4. Top Items by Volume (List)
5. Top Restaurants by Volume (List)
6. Top Items by Spend (List)
7. Top Restaurants by Spend (List)
8. Cost Breakdown (Progress bars)
9. Monthly Spending (Bar chart, Analytics tab)
10. Food vs Grocery Pie Chart (Analytics tab)

### API Route: `/api/stats`

**Location:** `/swiggy-tracker/app/api/stats/route.ts`

**Query Parameters:**
- `category` (all/food/grocery) - Filters orders by category
- `period` (daily/weekly/monthly) - Aggregation level

**Data Limits (for chart readability):**
- Daily: Last 14 days
- Weekly: Last 12 weeks
- Monthly: Last 12 months

**Returns:**
- Total orders, total spent, avg order value
- Category breakdown (food vs grocery counts and amounts)
- Spending trend (by period)
- Category split trend (food/grocery percentages over time)
- Top vendors (by volume and by spend)
- Top items (by volume and by spend)
- Cost breakdown (avg subtotal, delivery, taxes, discounts)
- Recent orders (last 10)

---

## ⏰ Automation & Scheduling

### Google Apps Script Trigger

**Type:** Time-driven trigger  
**Frequency:** Daily at midnight  
**Function:** `processSwiggyInvoices()`

**What It Does:**
- Runs automatically every night
- Processes up to 50 new emails
- Uploads PDFs to Supabase
- Updates Gmail labels

**How to Set Up:**
1. Open Google Apps Script editor
2. Click clock icon (Triggers) in left sidebar
3. Click "+ Add Trigger"
4. Settings:
   - Function: `processSwiggyInvoices`
   - Deployment: Head
   - Event source: Time-driven
   - Type: Day timer
   - Time: Midnight to 1am
5. Save

**Manual Trigger:**
- Can also run manually from Apps Script editor (Run → `processSwiggyInvoices`)

### Next.js Parsing

**Trigger:** Manual (dashboard button or page load)  
**No Cron:** Parsing happens on-demand when you access the app

**Why On-Demand?**
- Low volume (~10 new orders per week)
- Saves resources and API costs
- User controls when parsing happens
- Immediate feedback in dashboard

### Future Automation Options

If you want fully automated parsing:

**Option 1: Vercel Cron (if deployed)**
```typescript
// Add to next.config.js
module.exports = {
  async headers() {
    return [{
      source: '/api/parse-invoices',
      headers: [{ key: 'X-Cron-Secret', value: process.env.CRON_SECRET }]
    }]
  }
}
// Set up Vercel Cron to call this endpoint daily
```

**Option 2: macOS Cron Job**
```bash
# Edit crontab
crontab -e

# Add line (runs at 1 AM daily)
0 1 * * * curl http://localhost:3000/api/parse-invoices
```

**Option 3: Supabase Database Webhook**
- Trigger on new row in `invoices_raw`
- Calls Next.js API endpoint
- Requires public URL (Vercel/ngrok)

---

## 🐛 Troubleshooting

### Dashboard Issues

**404 Error / Page Not Found:**
1. Check if server is running: `lsof -ti:3000`
2. If not running, start it: `cd swiggy-tracker && npm start`
3. If dev mode has file watcher issues, use production: `npm run build && npm start`

**Parse Button Does Nothing:**
- Check browser console for errors (F12 → Console tab)
- Verify `.env.local` has correct `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
- Check `/api/parse-invoices` response in Network tab

**Charts Not Loading:**
- Verify data exists in Supabase (check `orders` table)
- Check `/api/stats` endpoint returns data
- Look for JavaScript errors in browser console

### Google Apps Script Issues

**Script Shows "Processed 0, Failed 0, Skipped X":**
- Emails without PDF attachments are skipped (expected behavior)
- Old emails (pre-July 2024) may not have PDFs

**Script Fails with "Authorization Required":**
- Re-authorize script: Run → Review Permissions → Allow

**Script Fails with "Upload failed" or "Insert failed":**
- Verify `SUPABASE_SERVICE_ROLE_KEY` in Script Properties
- Check Supabase project is active (not paused)
- Verify bucket `swiggy-invoices` exists

**Duplicates Being Processed:**
- Check logs: Script should say "Skipped (duplicate)"
- If not, verify `invoiceExists()` function is working
- Check `file_name` column in `invoices_raw` table

### Parsing Issues

**Gemini API Error: "models/gemini-2.5-flash is not found":**
- Verify your Gemini API key is valid
- Check if you have access to Gemini 2.5 Flash model
- Try using `gemini-1.5-flash` as fallback

**Gemini API Error: "429 Too Many Requests" or "Quota exceeded":**
- You hit rate limits
- Wait 60 seconds and try again
- Current settings: 20 invoices per run, 100ms delay = well within 1000 RPM
- Check daily quota (10K RPD)

**Parse Failures: "Could not extract order ID":**
- PDF format may have changed
- Check `parsing_logs` table for error details
- Gemini may need prompt adjustment in `lib/pdf-parser.ts`

**Parse Failures: "Could not extract any items from PDF":**
- PDF might be image-based (needs OCR)
- Gemini may have returned invalid JSON
- Check raw PDF text in logs

### Database Issues

**Connection Errors:**
- Verify Supabase project is active (not paused)
- Check `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`
- Verify `NEXT_PUBLIC_SUPABASE_URL` is correct

**Missing Data:**
- Check if PDFs were uploaded to Storage (visit Supabase Dashboard → Storage)
- Verify `invoices_raw` table has entries
- Check if parsing succeeded (look at `parsed_status` column)

---

## 🚀 Future Enhancements

### Possible Improvements

**1. Advanced Analytics:**
- Budget alerts (email when monthly spend > threshold)
- Comparison with previous periods (% change)
- Spending predictions (ML-based forecasting)
- Restaurant ratings integration
- Nutritional analysis (if available in invoices)

**2. Export Features:**
- CSV/Excel export of orders
- PDF report generation
- Share analytics via link

**3. Multi-User Support:**
- User authentication (Supabase Auth)
- Individual user dashboards
- Shared household tracking

**4. Mobile App:**
- React Native version
- Push notifications for new orders
- Camera-based PDF upload

**5. Integrations:**
- Connect bank statements for payment verification
- Import from other food delivery apps (Zomato, Dunzo)
- Export to accounting software (QuickBooks, Zoho)

**6. Performance Optimizations:**
- Add database indexes for faster queries
- Implement caching (Redis)
- Paginate orders table
- Lazy load charts

**7. Better Error Handling:**
- Retry failed parses automatically
- Email alerts for parsing failures
- Admin dashboard for monitoring

### Known Limitations

1. **Manual Parsing:** Currently requires opening dashboard or clicking button
2. **Single User:** No multi-user support (all data shared)
3. **No Authentication:** Dashboard accessible to anyone on localhost
4. **PDF Format Changes:** If Swiggy changes invoice format, parser needs update
5. **Old Invoices:** Pre-July 2024 emails don't have PDFs (17 emails skipped)
6. **Rate Limits:** Gemini free tier: 10 RPM (upgraded to paid: 1000 RPM)

---

## 📊 Current Status

**As of February 8, 2026:**

✅ **Completed:**
- Supabase database and storage setup
- Google Apps Script for email processing (runs at midnight daily)
- PDF parser with Gemini 2.5 Flash (batch: 20, delay: 100ms)
- Next.js dashboard with 3 tabs
- Category and period filters
- 10+ charts and visualizations
- Volume vs Spend rankings
- Duplicate prevention
- Error logging

**📈 Performance:**
- Parsing speed: ~20 PDFs in ~2 seconds
- Gemini API calls: 600 per minute (max)
- Token efficiency: Only parses new/pending invoices
- Chart limits: Last 14 days (daily), 12 weeks (weekly), 12 months (monthly)

**📁 File Structure:**
```
/cursor_project_2/
├── google-apps-script/
│   ├── Config.gs
│   ├── SwiggyToSupabase.gs
│   └── APPS_SCRIPT_SETUP.md
├── swiggy-tracker/
│   ├── app/
│   │   ├── api/
│   │   │   ├── parse-invoices/route.ts
│   │   │   └── stats/route.ts
│   │   ├── page.tsx (dashboard)
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── lib/
│   │   ├── pdf-parser.ts
│   │   ├── supabase.ts
│   │   └── types.ts
│   ├── .env.local (credentials)
│   ├── package.json
│   └── tsconfig.json
├── PROJECT_OVERVIEW.md (this file)
├── SWIGGY_EXPENSE_TRACKER_COMPLETE.md (original plan)
└── SUPABASE_CREDENTIALS_FOR_APPS_SCRIPT.md
```

---

## 📝 Quick Reference Commands

```bash
# Start dashboard
cd /Users/rahulnadendla/cursor_project_2/swiggy-tracker
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npm start

# Build for production
npm run build && npm start

# Stop server
lsof -ti:3000 | xargs kill -9

# Install dependencies (if needed)
npm install

# Check what's running on port 3000
lsof -ti:3000

# View environment variables
cat .env.local
```

---

## 🎯 Key Takeaways

1. **Gmail → Supabase:** Automated (midnight daily)
2. **Supabase → Parsed Data:** On-demand (dashboard)
3. **Credentials:** `.env.local` (Next.js), Script Properties (Apps Script)
4. **Parsing Model:** Gemini 2.5 Flash (paid tier: 1000 RPM, 10K RPD)
5. **Batch Size:** 50 emails (Apps Script), 20 PDFs (Parser)
6. **Rate Limiting:** 100ms delay between Gemini calls
7. **Dashboard URL:** http://localhost:3000
8. **Default Filter:** Monthly view, All categories
9. **Data Limits:** Last 14 days (daily), 12 weeks (weekly), 12 months (monthly)
10. **Duplicate Prevention:** Checks before insert, safe to re-trigger

---

**Built with:** Next.js 14, TypeScript, Supabase, Google Gemini 2.5 Flash, Google Apps Script, Recharts

**Project Duration:** February 8, 2026 (1 day)

**Total Cost:** $0/month (Supabase Free Tier) + Gemini API usage (paid tier)

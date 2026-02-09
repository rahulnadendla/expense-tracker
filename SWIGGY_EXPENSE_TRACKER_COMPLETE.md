# Swiggy Expense Management App - Complete Build Plan

## Project Overview
Building a web app to automatically track and analyze Swiggy (food delivery) and Instamart (grocery) expenses through automated email processing.

---

## Architecture Flow
```
Gmail (248 labeled emails) 
  → Google Apps Script (detects new order emails)
    → Extracts PDF attachment
      → Uploads to Supabase Storage
        → Triggers PDF parsing workflow
          → Stores structured data in Supabase tables
            → Powers Next.js dashboard with analytics
```

---

## PHASE 1: Supabase Setup & Configuration

### What You Need to Do:
1. **Set up Supabase tables and storage** using MCP connection
2. **Provide me with the credentials** I need for Google Apps Script:
   - Supabase Project URL
   - Supabase Service Role Key (for server-side uploads)
   - Storage bucket name
   - Any webhook URLs (if using triggers)

### Database Schema Design

#### Table 1: `invoices_raw`
Store raw PDF files and metadata
```sql
- id (uuid, primary key)
- created_at (timestamp)
- email_subject (text)
- email_date (timestamp)
- sender_email (text)
- pdf_url (text) -- Supabase storage URL
- file_name (text)
- file_size (integer)
- parsed_status (enum: 'pending', 'processing', 'completed', 'failed')
- parsed_at (timestamp, nullable)
- parse_error (text, nullable)
```

#### Table 2: `orders`
Structured order data from parsed PDFs
```sql
- id (uuid, primary key)
- invoice_id (uuid, foreign key → invoices_raw.id)
- order_id (text, unique) -- Swiggy's order ID
- order_date (timestamp)
- order_time (time, nullable)
- category (enum: 'food', 'grocery')
- restaurant_name (text, nullable)
- store_name (text, nullable)
- subtotal (decimal)
- delivery_fee (decimal, nullable)
- taxes (decimal, nullable)
- discounts (decimal, nullable)
- total_amount (decimal)
- payment_method (text, nullable)
- created_at (timestamp)
```

#### Table 3: `order_items`
Individual items in each order
```sql
- id (uuid, primary key)
- order_id (uuid, foreign key → orders.id)
- item_name (text)
- quantity (integer)
- unit_price (decimal, nullable)
- total_price (decimal)
- created_at (timestamp)
```

#### Table 4: `parsing_logs`
Track parsing attempts and errors for debugging
```sql
- id (uuid, primary key)
- invoice_id (uuid, foreign key → invoices_raw.id)
- attempt_number (integer)
- status (enum: 'success', 'partial', 'failed')
- extracted_text (text, nullable)
- error_message (text, nullable)
- created_at (timestamp)
```

### Storage Bucket Setup
- **Bucket name:** `swiggy-invoices`
- **Access:** Private (authenticated access only)
- **Folder structure:** 
  - `/food/YYYY/MM/` for food orders
  - `/grocery/YYYY/MM/` for grocery orders

### Row Level Security (RLS)
- Enable RLS on all tables
- Since this is single-user, create policies for authenticated user access
- Service role key bypasses RLS (for Apps Script uploads)

---

## PHASE 2: Google Apps Script

### Label-Based Workflow
I have already created two labels in Gmail:
- **`Swiggy-Invoices/To-Process`** - Contains all 248 historical emails + any new Swiggy emails I manually label
- **`Swiggy-Invoices/Processed`** - Emails that have been successfully uploaded to Supabase

### Script Requirements
Create a Google Apps Script that:

1. **Searches for emails with label:** `Swiggy-Invoices/To-Process`
2. **For each email:**
   - Extract PDF attachment (tax invoice)
   - Extract metadata: subject, date, sender
   - Upload PDF to Supabase Storage (appropriate folder based on food/grocery)
   - Create entry in `invoices_raw` table with metadata
   - **Remove** `Swiggy-Invoices/To-Process` label
   - **Add** `Swiggy-Invoices/Processed` label
3. **Process in batches:** Handle 50 emails per run (to avoid timeouts)
4. **Runs automatically** on a time-based trigger (every 15 minutes)
5. **Manual trigger option:** I can run it manually for immediate processing

### How This Handles Both Historical and Future Emails
- **Historical (248 emails):** Already labeled with `To-Process`, script processes them in batches
- **Future emails:** I manually add `To-Process` label when new Swiggy invoice arrives, OR set up Gmail filter to auto-label
- **Idempotent:** If script crashes mid-way, it resumes from unprocessed emails (only emails with `To-Process` label)

### Script Output
Provide me with:
- Complete Apps Script code with batch processing logic
- Installation instructions
- Which Supabase credentials to paste where
- How to set up the time-based trigger
- How to run manually for initial 248 email import
- Gmail filter rules (optional) to auto-label future Swiggy emails

### Error Handling
- Skip emails without PDF attachments (log this, don't change label)
- Handle duplicate uploads (check file name or extract Order ID from email, skip if exists)
- Retry logic for network failures (keep `To-Process` label, log error)
- If processing fails: Keep `To-Process` label, add `Swiggy-Invoices/Failed` label with error in email note
- Execution summary: Log how many processed, how many failed, how many remaining
- Send me summary email after each run (optional but helpful for 248 email import)

---

## PHASE 3: PDF Parsing System

### Parsing Strategy
Since Swiggy PDFs contain selectable text (not just images):
- **Primary method:** Text extraction using `pdf-parse` library
- **Fallback:** OCR using Tesseract.js if text extraction fails
- **Location:** Server-side Next.js API route

### Parsing Workflow
1. **Trigger:** When new row added to `invoices_raw` table (Supabase database webhook or cron job)
2. **Process:**
   - Fetch PDF from Supabase Storage
   - Extract text content
   - Use regex patterns + LLM (Claude API if needed) to extract:
     - Order ID
     - Date & time
     - Category (food vs grocery)
     - Restaurant/store name
     - Line items with quantities and prices
     - Subtotal, fees, taxes, total
   - Insert into `orders` and `order_items` tables
   - Update `invoices_raw.parsed_status` to 'completed'
3. **Error handling:**
   - Log failures to `parsing_logs` table
   - Mark invoice as 'failed' with error message
   - Allow manual retry

### Parser Requirements
- **Accuracy:** Extract amounts with correct decimal precision
- **Duplicate detection:** Don't re-parse if order_id already exists in `orders` table
- **Validation:** Verify that line items sum matches total amount
- **Flexibility:** Handle both Swiggy food and Instamart grocery invoice formats

### Example Data Points to Extract
Based on Swiggy invoices, extract:
- Order ID (e.g., "123456789")
- Order placed date/time
- Restaurant/Store name
- Each item: name, qty, price
- Subtotal
- Delivery charges
- Taxes (CGST, SGST)
- Discount (if any)
- Grand total
- Payment mode

---

## PHASE 4: Next.js Web Dashboard

### Tech Stack
- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **UI:** Tailwind CSS + shadcn/ui components
- **Charts:** Recharts or Chart.js
- **Auth:** Supabase Auth (since we're already using Supabase)
- **Data fetching:** Supabase JS client

### Dashboard Layout

#### Landing Page (Default View)
**Current Stats Section (Top of page):**
- Large cards showing:
  - **This Week:** Total spent, # orders, avg order value
  - **This Month:** Total spent, # orders, avg order value
- Comparison indicators: "↑ 15% vs last week" / "↓ 8% vs last month"
- Split toggle: View overall OR split by Food/Grocery

**Quick Actions:**
- "Refresh Data" button (triggers parsing check)
- Date range selector (This week, This month, Last 30 days, Custom)

#### Analytics Tab (Secondary View)
Detailed insights and visualizations:

1. **Spending Trends**
   - Line chart: Daily/Weekly/Monthly spending over time
   - Toggle between Food and Grocery
   - Overlay budget line if set

2. **Category Breakdown**
   - Pie chart: Food vs Grocery split
   - Donut chart with percentages and amounts

3. **Top Items Analysis**
   - Table: Most ordered items (by quantity)
   - Table: Highest spending items (by total value)
   - Filters: All time, This month, Custom range

4. **Order Frequency**
   - Average orders per week/month
   - Heatmap: Day of week vs time of day (when do I order most?)
   - Streak tracker: "7 days since last order"

5. **Monthly Comparison**
   - Bar chart: Side-by-side monthly spending
   - % change month-over-month
   - Highlight highest/lowest spending months

6. **Restaurants/Stores**
   - Ranking: Most ordered from
   - Total spent per restaurant/store
   - Average order value per vendor

7. **Cost Breakdown**
   - Stacked bar: Subtotal vs Delivery vs Taxes
   - % of spending that's delivery fees
   - Discount savings tracker

#### Invoices Tab
- Searchable, filterable table of all orders
- Columns: Date, Restaurant/Store, Items, Total, Category, Status
- Click to view PDF and parsed details
- Actions: Re-parse, Download PDF, Export to CSV

#### Settings Tab
- Budget settings (monthly limit)
- Alert preferences
- Data export options
- Re-parse failed invoices
- View parsing errors

### Key UX Features
- **Fast loading:** Use Supabase realtime subscriptions for instant updates
- **Mobile responsive:** Works on phone
- **Dark mode:** Toggle in settings
- **Export data:** CSV download for any date range
- **Notifications:** Browser notifications when budget threshold hit
- **Search:** Global search across orders and items

### Color Scheme
- Primary: Swiggy orange (#FC8019)
- Accent: Deep red (#E23744)
- Background: Clean white/dark mode toggle
- Charts: Orange-red gradient palette

---

## PHASE 5: Initial Data Import (Automated via Labels)

### Processing 248 Historical Emails
Since all 248 emails are already labeled with `Swiggy-Invoices/To-Process`:

1. **Set up Apps Script** with time-based trigger (every 15 minutes)
2. **Run script manually** first time to start processing
3. **Monitor progress:**
   - Check Supabase Storage - PDFs should start appearing
   - Check `invoices_raw` table - entries being created
   - Watch Gmail labels shift from `To-Process` to `Processed`
4. **Script will auto-process** all 248 emails in batches (50 per run = ~5 runs = ~75 minutes)
5. **Parsing auto-triggers** as PDFs land in Supabase
6. **Verify in dashboard** once complete

### Import Checklist
- [ ] Apps Script installed and credentials configured
- [ ] Time-based trigger set to run every 15 minutes
- [ ] Ran script manually once to kick off processing
- [ ] Monitoring Supabase Storage - PDFs uploading
- [ ] All 248 emails moved from `To-Process` to `Processed` label (check Gmail)
- [ ] All entries in `invoices_raw` table (check Supabase)
- [ ] Parsing completed for at least 90% of invoices
- [ ] Review parsing errors in `parsing_logs` table
- [ ] Dashboard displays all historical data correctly

### Ongoing Usage (Future Emails)
**Option A - Manual (Safest):**
- New Swiggy invoice arrives in Gmail
- I manually add `Swiggy-Invoices/To-Process` label
- Script picks it up in next run (within 15 minutes)

**Option B - Automated (Set & Forget):**
- Create Gmail filter:
  - From: `@swiggy.in` OR `@orders.swiggy.in`
  - Has attachment: PDF
  - Subject contains: "Tax Invoice" OR "Order Confirmed"
  - → Automatically apply label: `Swiggy-Invoices/To-Process`
- Script processes new emails automatically
- Zero manual work going forward

### Gmail Filter Setup (Optional - For Option B)
Cursor should provide me with:
- Exact Gmail filter rules to copy-paste
- Screenshots or step-by-step guide to create the filter
- How to test the filter with one email before applying to all

---

## Success Metrics

### Functional Requirements
✅ Apps Script auto-forwards new Swiggy emails to Supabase
✅ PDFs stored securely in Supabase Storage
✅ >95% parsing accuracy on standard invoices
✅ Dashboard loads in <2 seconds
✅ Real-time data updates (new orders appear within 1 minute)
✅ Mobile responsive on phone/tablet
✅ All 248 historical orders imported and visible

### User Experience Goals
✅ Zero manual data entry after initial setup
✅ Open app → immediately see this week/month stats
✅ One-click drill down into any time period
✅ Insights I couldn't get from Swiggy app (frequency, trends, top items)
✅ Clean, professional UI I'm proud to show friends

---

## Deliverables Checklist

### Code Deliverables
- [ ] Supabase schema SQL (tables, RLS policies, storage buckets)
- [ ] Google Apps Script (commented, with setup guide)
- [ ] Next.js app (complete, production-ready)
- [ ] PDF parsing service (API route or standalone function)
- [ ] README with setup instructions

### Documentation
- [ ] Supabase setup guide (what credentials to use where)
- [ ] Apps Script installation steps
- [ ] How to run the Next.js app locally
- [ ] How to trigger parsing manually
- [ ] How to export data
- [ ] Troubleshooting guide

### Nice-to-Have (Build if time permits)
- [ ] Budget alerts (email when threshold crossed)
- [ ] Recurring order detection
- [ ] Promo code tracking
- [ ] Compare my spending to Swiggy averages (if data available)

---

## Important Notes for Cursor

1. **I'm non-technical:** Provide clear setup instructions with screenshots or step-by-step commands
2. **I have Supabase MCP connected:** Use it to create tables, policies, etc.
3. **Single user app:** No need for multi-tenant architecture, but design tables so it *could* scale
4. **Local development:** I'll run this on `localhost` first, might deploy to Vercel later
5. **Error visibility:** Surface parsing errors in the UI so I can manually fix edge cases

---

## Questions for Cursor to Answer After Setup

1. What Supabase credentials do I paste into Google Apps Script?
2. How do I test the Apps Script with one email before running on all 248?
3. What's the command to start the Next.js app?
4. How do I trigger parsing manually if needed?
5. Where is the data stored on my computer vs Supabase?
6. How do I back up my data?

---

**Build this step-by-step, starting with Supabase setup, then Apps Script, then parsing, then dashboard. Ask me for confirmation before moving between phases.**

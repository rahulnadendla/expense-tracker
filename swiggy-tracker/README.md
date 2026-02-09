# Swiggy Expense Tracker - Phase 3: PDF Parser

Parses Swiggy invoice PDFs from Supabase Storage and extracts order data into structured tables.

## Setup

### 1. Install Dependencies

**Important:** You need Node.js 18+ to run Next.js 14. Your current system has Node v4.4.6 (very old).

**Option A: Install newer Node.js**
- Download from [nodejs.org](https://nodejs.org/) (LTS version recommended)
- Or use `nvm` (Node Version Manager): `nvm install 18 && nvm use 18`

**Option B: Use a cloud environment**
- Run this in GitHub Codespaces, Gitpod, or deploy to Vercel

Once you have Node 18+:

```bash
cd swiggy-tracker
npm install
```

### 2. Configure Environment Variables

Edit `.env.local` and add your **Service Role Key**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://waoonuuwborifiraklue.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<paste-your-service-role-key-here>
BUCKET_NAME=swiggy-invoices
```

Get the service role key from: **Supabase Dashboard → Project Settings → API → `service_role`**

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The dashboard will **automatically trigger parsing** when you load the page. It processes up to 10 pending invoices per run.

## How It Works

```
┌─────────────────────┐
│ invoices_raw table  │ (57 pending PDFs)
│  parsed_status =    │
│     'pending'       │
└──────────┬──────────┘
           │
           ▼
   ┌───────────────────┐
   │  API Route        │
   │  /api/parse-      │
   │    invoices       │
   └─────────┬─────────┘
             │
             ├─→ Download PDF from Storage
             ├─→ Extract text with pdf-parse
             ├─→ Parse order data (regex)
             ├─→ Insert into orders table
             ├─→ Insert into order_items table
             └─→ Update parsed_status = 'completed'
```

## Usage

### Dashboard (Automatic)

1. Open `http://localhost:3000`
2. Parser runs automatically on page load
3. Click "Parse Now" to process more batches
4. View stats: parsed, failed, remaining

### Manual Trigger (Command Line)

```bash
npm run parse
```

This calls the API from the terminal (useful for testing or batch processing).

### API Endpoint

```bash
# GET or POST
curl http://localhost:3000/api/parse-invoices
```

Response:
```json
{
  "message": "Processed 10 invoices",
  "summary": {
    "parsed": 9,
    "failed": 1,
    "skipped": 0,
    "remaining": 47,
    "errors": ["file.pdf: Could not extract Order ID"]
  }
}
```

## Testing with Example PDFs

The [`example invoices/`](../example%20invoices/) folder has 4 test PDFs:

1. **Restaurant invoice:** `taco_0078138020100176_...pdf` → Order ID 228908763045143
2. **Instamart invoice:** `taco_229268934546938_merged.pdf` → Order ID 229268934546938

To test locally before running on the 57 real PDFs:
1. Manually upload one test PDF to Supabase Storage
2. Insert a row in `invoices_raw` pointing to it
3. Run the parser and check if it extracts correctly

## Parsed Data Structure

### `orders` table
- order_id, order_date, category (food/grocery)
- restaurant_name or store_name
- subtotal, delivery_fee, taxes, total_amount

### `order_items` table
- item_name, quantity, total_price
- Linked to orders via `order_id` FK

## Troubleshooting

### "Missing SUPABASE_SERVICE_ROLE_KEY"
- Check `.env.local` has the correct key
- Restart dev server after changing `.env.local`

### "Failed to download PDF"
- Check `pdf_url` in `invoices_raw` table matches Storage path
- Verify bucket name is `swiggy-invoices`

### "Could not extract Order ID"
- PDF format might be different from expected
- Check PDF text with `pdf-parse` manually
- Update regex patterns in `lib/pdf-parser.ts`

### Parse errors
- Check `parsing_logs` table for detailed error messages
- Check `invoices_raw.parse_error` column

## Next Steps

Once parsing works:
- Run multiple times until all 57 PDFs are parsed
- Apps Script will keep adding new PDFs as they upload
- Phase 4: Build the analytics dashboard to visualize spending trends

## File Structure

```
swiggy-tracker/
├── app/
│   ├── api/parse-invoices/route.ts  # Main API logic
│   ├── page.tsx                      # Dashboard UI
│   └── layout.tsx, globals.css
├── lib/
│   ├── supabase.ts                   # Supabase client
│   ├── pdf-parser.ts                 # PDF parsing logic
│   └── types.ts                      # TypeScript types
├── scripts/
│   └── parse-manual.ts               # CLI trigger
├── .env.local                        # Credentials (not in git)
└── package.json
```

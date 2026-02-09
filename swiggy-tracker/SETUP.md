# Quick Setup Guide

## Prerequisites

**Node.js 18+** is required. Your system has Node v4.4.6 (too old).

### Install Node 18+

**Option 1: Download installer**
- Go to [nodejs.org](https://nodejs.org/)
- Download and install the **LTS** version (20.x recommended)

**Option 2: Use nvm (Node Version Manager)**
```bash
# Install nvm first: https://github.com/nvm-sh/nvm
nvm install 18
nvm use 18
node --version  # Should show v18.x.x or v20.x.x
```

**Option 3: Deploy to Vercel**
- Push this code to GitHub
- Connect to Vercel (free): [vercel.com](https://vercel.com)
- Add environment variables in Vercel dashboard
- Auto-deploys on push

---

## Setup Steps

### 1. Install Dependencies

```bash
cd swiggy-tracker
npm install
```

This installs Next.js, Supabase client, pdf-parse, and TypeScript.

### 2. Add Service Role Key

Edit `.env.local`:

```env
SUPABASE_SERVICE_ROLE_KEY=<paste-your-actual-key-here>
```

**Where to find it:**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Click **Settings** (gear icon) → **API**
4. Copy the **`service_role`** key (not `anon`)
5. Paste it in `.env.local`

### 3. Run the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

The parser runs automatically when the page loads.

---

## Verify It's Working

### Check 1: Page loads
- You should see "Swiggy Expense Tracker" with a "Parse Now" button

### Check 2: Parsing starts
- Watch the console/terminal for logs
- Dashboard shows: "Processing invoices..."
- After ~10 seconds: "Processed X invoices"

### Check 3: Data in Supabase
Go to Supabase Dashboard → **Table Editor**:
- **`orders`** table should have new rows
- **`order_items`** table should have items
- **`invoices_raw`**: `parsed_status` changes from `pending` to `completed`

---

## If You Get Errors

### "Missing SUPABASE_SERVICE_ROLE_KEY"
- Make sure you saved `.env.local` after editing
- Restart the dev server: `Ctrl+C` then `npm run dev`

### "Failed to download PDF"
- Check `invoices_raw.pdf_url` in Supabase
- It should match the Storage path: `food/2026/02/filename.pdf`

### "Could not extract Order ID"
- PDF format might be different than expected
- Open an issue or check the PDF manually

---

## What Happens Next?

1. **Parser processes 10 invoices per run** (to avoid timeouts)
2. You have **57 pending** → run ~6 times to process all
3. Click "Parse Now" or reload the page to process more batches
4. Apps Script continues uploading new PDFs → parser will handle them automatically when you open the dashboard

---

## Command Reference

```bash
# Start dev server
npm run dev

# Manual parse (from terminal)
npm run parse

# Build for production
npm run build
npm start
```

---

**Ready?** Run `npm install` then `npm run dev` and you're set!

# How to Retry Failed Invoice Parsing

## Current Status
- **Total Invoices:** 395
- **Completed:** 287 (72.7%)
- **Pending:** 63 (16%)
- **Failed:** 45 (11.4%)

---

## Failure Breakdown

### ✅ Safe to Retry (36 invoices)
1. **Model Not Found (31):** Used old Gemini 1.5 models before upgrade
2. **Rate Limits (5):** Hit free tier limits before paid upgrade

### ⚠️ Needs Investigation (9 invoices)
**Invalid JSON / Truncated responses** - May succeed on retry, but could fail again

---

## Option 1: Reset ALL Failed Invoices (Recommended)

Run this SQL in Supabase SQL Editor:

```sql
-- Reset all failed invoices to pending for retry
UPDATE invoices_raw
SET 
  parsed_status = 'pending',
  parse_error = NULL,
  parsed_at = NULL
WHERE parsed_status = 'failed';

-- Check the result
SELECT parsed_status, COUNT(*) as count
FROM invoices_raw
GROUP BY parsed_status
ORDER BY count DESC;
```

**Result:** All 45 failed invoices will be marked as 'pending' and will be processed when you next trigger parsing.

---

## Option 2: Reset ONLY Model/Rate Limit Failures (Safer)

If you want to skip the truncated JSON failures for now:

```sql
-- Reset only model and rate limit errors
UPDATE invoices_raw
SET 
  parsed_status = 'pending',
  parse_error = NULL,
  parsed_at = NULL
WHERE parsed_status = 'failed'
AND (
  parse_error LIKE '%models/gemini-1.5-flash%'
  OR parse_error LIKE '%429 Too Many Requests%'
  OR parse_error LIKE '%Quota exceeded%'
);

-- Check how many were reset
SELECT COUNT(*) as reset_count
FROM invoices_raw
WHERE parsed_status = 'pending'
AND created_at < NOW() - INTERVAL '1 hour'; -- Recently changed ones
```

**Result:** Only 36 invoices will be retried (safe ones), 9 truncated JSON errors remain failed.

---

## Option 3: Reset Specific Invoices by File Name

If you want to be very selective:

```sql
-- Reset a specific invoice
UPDATE invoices_raw
SET 
  parsed_status = 'pending',
  parse_error = NULL,
  parsed_at = NULL
WHERE file_name = 'taco/0311234122600022_b8efb7a2-9b97-420a-9389-a2ce555b65d4.pdf';
```

---

## After Resetting

### Step 1: Open Dashboard
```bash
cd /Users/rahulnadendla/cursor_project_2/swiggy-tracker
npm start
```
Open http://localhost:3000

### Step 2: Trigger Parsing
- The dashboard will auto-trigger parsing
- Or click "Parse New Invoices" button
- Batch size: 20 invoices per run

### Step 3: Monitor Progress
- Check the parsing summary (shows parsed/failed/remaining)
- If errors occur, check the logs again

---

## Fixing Truncated JSON Errors

If the 9 truncated JSON invoices fail again after retry, we can:

### Fix 1: Increase Gemini Token Limit
Edit `swiggy-tracker/lib/pdf-parser.ts`:

```typescript
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    temperature: 0.1,
    maxOutputTokens: 8192, // ADD THIS (default is 2048)
  }
});
```

### Fix 2: Simplify Response Format
Modify the prompt to request more concise item names (truncate long descriptions).

### Fix 3: Chunk Large PDFs
For invoices with many items (>20), process in chunks.

---

## Quick Command Reference

### Check Status
```sql
SELECT parsed_status, COUNT(*) FROM invoices_raw GROUP BY parsed_status;
```

### View Failed Invoices
```sql
SELECT file_name, email_subject, parse_error 
FROM invoices_raw 
WHERE parsed_status = 'failed'
ORDER BY created_at DESC;
```

### Count by Error Type
```sql
SELECT 
  CASE 
    WHEN parse_error LIKE '%gemini-1.5-flash%' THEN 'Model Not Found'
    WHEN parse_error LIKE '%429%' THEN 'Rate Limit'
    WHEN parse_error LIKE '%invalid JSON%' THEN 'Truncated JSON'
    ELSE 'Other'
  END as error_type,
  COUNT(*) as count
FROM invoices_raw
WHERE parsed_status = 'failed'
GROUP BY error_type;
```

---

## Recommended Action Plan

1. **Reset ALL failed invoices** (Option 1)
2. **Trigger parsing from dashboard**
3. **Monitor results:**
   - Model errors → Should succeed ✅
   - Rate limit errors → Should succeed ✅
   - Truncated JSON → 50/50 chance (Gemini responses vary)
4. **If truncated JSON errors persist:**
   - Implement Fix 1 (increase token limit)
   - Retry those specific invoices again

---

## Expected Outcome

**After retrying:**
- **Success:** ~36 invoices (model + rate limit errors)
- **Maybe:** ~5-7 of the truncated JSON (Gemini can be inconsistent)
- **Still failed:** ~2-4 (truly problematic PDFs)

**Final stats (optimistic):**
- Completed: ~330/395 (83%)
- Pending: 63
- Failed: ~2-4 (truly broken PDFs)

---

## Need Help?

If issues persist after retry:
1. Share specific file names that fail
2. Check if those PDFs are readable (download and open them)
3. We can debug individual invoices with detailed logging

# Google Apps Script – Where to Paste and How to Run

Follow these steps exactly. You’ll create one script project, add two script files, paste your Supabase credentials, then run the script manually or on a schedule.

---

## Step 1: Open Apps Script

1. In your browser, go to **https://script.google.com** and sign in with the same Google account you use for Gmail (the one that has the Swiggy labels).
2. Click **New project** (or **+**).
3. You’ll see a default file named `Code.gs` with a bit of sample code.

---

## Step 2: Add the Two Script Files

You need **two** script files in the project. The editor shows one file at a time.

### File 1: `Config.gs`

1. In the left sidebar, click the **+** next to **Files** (or use the menu **File → New → Script file**).
2. When asked for the name, type: **Config**
3. The file will open as `Config.gs`. **Delete any code** already in it.
4. Open the file **Config.gs** from your project folder (`google-apps-script/Config.gs`), copy **all** of its contents, and paste into the Apps Script editor for `Config.gs`.
5. Save (Ctrl+S / Cmd+S).

### File 2: `SwiggyToSupabase.gs`

1. Click the **+** again to add another script file.
2. Name it: **SwiggyToSupabase**
3. It will open as `SwiggyToSupabase.gs`. **Delete any code** in it.
4. Open **SwiggyToSupabase.gs** from your project folder, copy **all** of its contents, and paste into the Apps Script editor.
5. Save.

### Remove the default `Code.gs` (optional)

- In the left file list, click the three dots next to **Code.gs** → **Delete** (or leave it empty). The project only needs `Config.gs` and `SwiggyToSupabase.gs`.

You should now have at least:

- **Config.gs** – credentials and labels
- **SwiggyToSupabase.gs** – main logic

---

## Step 3: Paste Your Supabase Credentials (Script Properties)

The script reads the Supabase URL and key from **Script properties**, not from the code.

1. In the Apps Script editor, go to **Project settings** (gear icon on the left, or **File → Project properties**).
2. In the left tabs, click **Script properties** (not “Project properties”).
3. Click **Add script property** and add these **three** properties one by one:

| Property name (key)              | Value (paste your real values) |
|---------------------------------|---------------------------------|
| `SUPABASE_URL`                  | `https://waoonuuwborifiraklue.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY`     | Your **service_role** key from Supabase Dashboard → Project Settings → API |
| `BUCKET_NAME`                   | `swiggy-invoices` |

- **SUPABASE_URL:** Copy from [SUPABASE_CREDENTIALS_FOR_APPS_SCRIPT.md](../SUPABASE_CREDENTIALS_FOR_APPS_SCRIPT.md) or from Supabase Dashboard.
- **SUPABASE_SERVICE_ROLE_KEY:** The long JWT you got from Supabase (Dashboard → Project Settings → API → `service_role`). Paste the whole key with no spaces.
- **BUCKET_NAME:** Exactly `swiggy-invoices`.

4. Click **Save script properties**.

Do not put the service role key inside any `.gs` file; keep it only in Script properties.

---

## Step 4: Authorize the Script (First Run)

1. In the Apps Script editor, in the file list, select **SwiggyToSupabase.gs**.
2. At the top, in the dropdown that says “Select function”, choose **processSwiggyInvoices**.
3. Click **Run** (play button).
4. The first time, Google will ask for permissions:
   - Click **Review permissions** → choose your Google account.
   - You may see “Google hasn’t verified this app” → click **Advanced** → **Go to [your project name] (unsafe)**.
   - Click **Allow** so the script can read Gmail and run.
5. After that, the script runs. Check **Execution log** (View → Logs or Ctrl+Enter) to see “Processed: X, Failed: Y, Skipped: Z” or any errors.

---

## Step 5: Run Manually (e.g. for Your 248 Emails)

- Select **SwiggyToSupabase.gs**.
- Function: **processSwiggyInvoices**.
- Click **Run**.

Each run processes up to **50 threads** (batch size). For 248 emails, run it several times (or set the trigger in Step 6 and wait for runs every 15 minutes). Check Gmail: threads should move from **Swiggy-Invoices/To-Process** to **Swiggy-Invoices/Processed** (or **Swiggy-Invoices/Failed** if something went wrong).

---

## Step 6: Run Automatically Every 15 Minutes

1. In the Apps Script editor, click the **clock** icon on the left (**Triggers**).
2. Click **+ Add Trigger** (bottom right).
3. Set:
   - **Choose function:** `processSwiggyInvoices`
   - **Choose deployment:** Head
   - **Select event source:** Time-driven
   - **Type:** Minutes timer
   - **Select interval:** Every 15 minutes
4. Click **Save**.
5. If asked for permissions again, complete the authorization (same as Step 4).

The script will run every 15 minutes and process up to 50 labeled threads per run.

---

## Gmail Labels (Must Exist)

- **Swiggy-Invoices/To-Process** – You said you already have this; put all Swiggy invoice emails (or the 248) here. The script only looks at this label.
- **Swiggy-Invoices/Processed** – Created by the script if it doesn’t exist. Threads that succeed get moved here.
- **Swiggy-Invoices/Failed** – Created by the script if it doesn’t exist. Threads that fail get this label and stay in To-Process so the next run can retry.

---

## Quick Reference: Where Things Are

| What | Where |
|------|--------|
| Paste **Config.gs** code | New file named **Config** → paste all, save |
| Paste **SwiggyToSupabase.gs** code | New file named **SwiggyToSupabase** → paste all, save |
| Paste **Project URL** | Project settings (gear) → Script properties → `SUPABASE_URL` |
| Paste **Service role key** | Script properties → `SUPABASE_SERVICE_ROLE_KEY` |
| Paste **Bucket name** | Script properties → `BUCKET_NAME` = `swiggy-invoices` |
| Run manually | Select `processSwiggyInvoices` → Run |
| Run on schedule | Triggers (clock) → Add Trigger → Time-driven, every 15 minutes |

---

## If Upload Fails (Storage)

If you see storage/upload errors in the log, Supabase may expect a different upload format. The script currently sends the PDF as raw body with `Content-Type: application/pdf`. If you get a 400 or 415, say so and we can switch the script to multipart/form-data upload.

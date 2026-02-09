/**
 * Swiggy Expense Tracker - Main script
 * Processes Gmail emails with label "Swiggy-Invoices/To-Process":
 * - Extracts PDF attachment, uploads to Supabase Storage, inserts row in invoices_raw
 * - Moves label to "Processed" on success, or "Failed" on error
 */

function processSwiggyInvoices() {
  var config = getConfig();
  if (!config.supabaseUrl || !config.serviceRoleKey) {
    Logger.log('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Script properties.');
    return;
  }

  var toProcessLabel = GmailApp.getUserLabelByName(LABELS.TO_PROCESS);
  if (!toProcessLabel) {
    Logger.log('ERROR: Create Gmail label "' + LABELS.TO_PROCESS + '" and add emails to it.');
    return;
  }

  var processedLabel = GmailApp.getUserLabelByName(LABELS.PROCESSED);
  var failedLabel = GmailApp.getUserLabelByName(LABELS.FAILED);
  if (!processedLabel) processedLabel = GmailApp.createLabel(LABELS.PROCESSED);
  if (!failedLabel) failedLabel = GmailApp.createLabel(LABELS.FAILED);

  var threads = toProcessLabel.getThreads(0, BATCH_SIZE);
  var stats = { processed: 0, failed: 0, skipped: 0, errors: [] };

  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var messages = thread.getMessages();
    var threadStats = { processed: 0, failed: 0, skipped: 0 };

    for (var j = 0; j < messages.length; j++) {
      var result = processOneMessage(messages[j], config, stats);
      if (result === 'processed') threadStats.processed++;
      if (result === 'failed') threadStats.failed++;
      if (result === 'skipped') threadStats.skipped++;
    }

    stats.processed += threadStats.processed;
    stats.failed += threadStats.failed;
    stats.skipped += threadStats.skipped;

    // Apply labels at thread level (Gmail labels are per-thread)
    if (threadStats.processed > 0) {
      thread.removeLabel(toProcessLabel);
      thread.addLabel(processedLabel);
    } else if (threadStats.failed > 0) {
      thread.addLabel(failedLabel);
      // Keep To-Process so next run can retry
    }
    // If only skipped (no PDFs), leave labels as is
  }

  var summary = 'Processed: ' + stats.processed + ', Failed: ' + stats.failed + ', Skipped: ' + stats.skipped;
  Logger.log(summary);
  if (stats.errors.length) {
    stats.errors.forEach(function(e) { Logger.log('Error: ' + e); });
  }
  return stats;
}

/**
 * Process a single message. Returns 'processed' | 'failed' | 'skipped'.
 * Labels are applied at thread level by the caller.
 */
function processOneMessage(message, config, stats) {
  var attachments = message.getAttachments({ includeInlineImages: false });
  var pdfAttachment = null;
  for (var k = 0; k < attachments.length; k++) {
    if (attachments[k].getContentType() === 'application/pdf' || attachments[k].getName().toLowerCase().indexOf('.pdf') !== -1) {
      pdfAttachment = attachments[k];
      break;
    }
  }

  if (!pdfAttachment) {
    Logger.log('Skipped (no PDF): ' + message.getSubject());
    return 'skipped';
  }

  var fileName = pdfAttachment.getName();
  var fileSize = pdfAttachment.getBytes().length;
  var subject = message.getSubject();
  var date = message.getDate();
  var sender = (message.getFrom() || '').toString();

  // Default to food; parsing can correct later. Instamart = grocery.
  var category = 'food';
  if (subject.toLowerCase().indexOf('instamart') !== -1) category = 'grocery';
  var y = date.getFullYear();
  var m = ('0' + (date.getMonth() + 1)).slice(-2);
  var storagePath = category + '/' + y + '/' + m + '/' + fileName;

  // Duplicate check: same file_name already in invoices_raw
  if (invoiceExists(config, fileName)) {
    Logger.log('Skipped (duplicate): ' + fileName);
    return 'processed'; // Count as processed so thread gets moved to Processed
  }

  var uploadResult = uploadPdfToSupabase(config, storagePath, pdfAttachment);
  if (!uploadResult.success) {
    var errMsg = uploadResult.error || 'Upload failed';
    stats.errors.push(subject + ': ' + errMsg);
    return 'failed';
  }

  // Private bucket: store path; dashboard/parser will use service role to read
  var pdfUrl = config.supabaseUrl + '/storage/v1/object/' + config.bucketName + '/' + storagePath;

  var insertResult = insertInvoiceRaw(config, {
    email_subject: subject,
    email_date: date.toISOString(),
    sender_email: sender,
    pdf_url: pdfUrl,
    file_name: fileName,
    file_size: fileSize,
    parsed_status: 'pending'
  });

  if (!insertResult.success) {
    stats.errors.push(subject + ': ' + (insertResult.error || 'Insert failed'));
    return 'failed';
  }

  return 'processed';
}

function invoiceExists(config, fileName) {
  var url = config.supabaseUrl + '/rest/v1/invoices_raw?file_name=eq.' + encodeURIComponent(fileName) + '&select=id';
  var options = {
    method: 'get',
    headers: {
      'Authorization': 'Bearer ' + config.serviceRoleKey,
      'apikey': config.serviceRoleKey
    },
    muteHttpExceptions: true
  };
  var resp = UrlFetchApp.fetch(url, options);
  if (resp.getResponseCode() !== 200) return false;
  var data = JSON.parse(resp.getContentText());
  return data && data.length > 0;
}

function uploadPdfToSupabase(config, objectPath, blob) {
  var url = config.supabaseUrl + '/storage/v1/object/' + config.bucketName + '/' + objectPath;
  var payload = blob.getBytes();
  var options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + config.serviceRoleKey,
      'apikey': config.serviceRoleKey,
      'Content-Type': 'application/pdf'
    },
    payload: payload,
    muteHttpExceptions: true
  };

  var resp = UrlFetchApp.fetch(url, options);
  var code = resp.getResponseCode();
  if (code >= 200 && code < 300) return { success: true };

  var body = resp.getContentText();
  try {
    var err = JSON.parse(body);
    body = err.message || err.error_description || body;
  } catch (e) {}
  return { success: false, error: body };
}

function insertInvoiceRaw(config, row) {
  var url = config.supabaseUrl + '/rest/v1/invoices_raw';
  var options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + config.serviceRoleKey,
      'apikey': config.serviceRoleKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    payload: JSON.stringify(row),
    muteHttpExceptions: true
  };

  var resp = UrlFetchApp.fetch(url, options);
  var code = resp.getResponseCode();
  if (code >= 200 && code < 300) return { success: true };

  var body = resp.getContentText();
  try {
    var err = JSON.parse(body);
    body = err.message || err.error_description || body;
  } catch (e) {}
  return { success: false, error: body };
}


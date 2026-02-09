/**
 * Swiggy Expense Tracker - Config
 * Reads Supabase credentials from Script Properties.
 * Set these in: File → Project properties → Script properties
 * Keys: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BUCKET_NAME
 */

var CONFIG_KEYS = {
  SUPABASE_URL: 'SUPABASE_URL',
  SUPABASE_SERVICE_ROLE_KEY: 'SUPABASE_SERVICE_ROLE_KEY',
  BUCKET_NAME: 'BUCKET_NAME'
};

function getConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    supabaseUrl: props.getProperty(CONFIG_KEYS.SUPABASE_URL) || '',
    serviceRoleKey: props.getProperty(CONFIG_KEYS.SUPABASE_SERVICE_ROLE_KEY) || '',
    bucketName: props.getProperty(CONFIG_KEYS.BUCKET_NAME) || 'swiggy-invoices'
  };
}

/** Gmail label names (must already exist in your Gmail) */
var LABELS = {
  TO_PROCESS: 'Swiggy-Invoices/To-Process',
  PROCESSED: 'Swiggy-Invoices/Processed',
  FAILED: 'Swiggy-Invoices/Failed'
};

/** Max emails to process per run (avoid timeout) */
var BATCH_SIZE = 50;

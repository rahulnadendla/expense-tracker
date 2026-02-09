/**
 * Manual script to trigger parsing
 * Run with: npm run parse
 */

async function main() {
  console.log('Triggering PDF parsing...\n');

  const response = await fetch('http://localhost:3000/api/parse-invoices', {
    method: 'POST',
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Error:', data.error || 'Unknown error');
    console.error('Details:', data.details);
    process.exit(1);
  }

  console.log('✓', data.message);
  console.log('\nSummary:');
  console.log('  Parsed:', data.summary.parsed);
  console.log('  Failed:', data.summary.failed);
  console.log('  Skipped:', data.summary.skipped);
  console.log('  Remaining:', data.summary.remaining);

  if (data.summary.errors && data.summary.errors.length > 0) {
    console.log('\nErrors:');
    data.summary.errors.forEach((err: string) => {
      console.log('  -', err);
    });
  }
}

main().catch(console.error);

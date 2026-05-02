// scripts/ksearch-smoke-test.js — Confirm catalog API is live before demo
// Run: npm run test:ksearch

require('dotenv').config();
const { catalogClient } = require('../backend/src/kite-mcp-bridge');

async function main() {
  console.log('[Smoke Test] Testing Kite service catalog...\n');

  try {
    const services = await catalogClient.listServices({ limit: 10 });
    console.log(`[✓] Found ${services.length} services:\n`);

    services.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.name || 'Unnamed'}`);
      console.log(`     payTo:    ${s.payTo}`);
      console.log(`     resource: ${s.resource}`);
      console.log(`     amount:   ${s.maxAmountRequired} wei`);
      console.log(`     category: ${s.category || 'N/A'}`);
      console.log('');
    });

    // Test query filter
    const defiServices = await catalogClient.listServices({ limit: 10, query: 'defi' });
    console.log(`[✓] DeFi query returned ${defiServices.length} service(s)`);

    console.log('\n[Smoke Test] PASSED');
  } catch (err) {
    console.error(`[✗] Smoke test FAILED: ${err.message}`);
    process.exit(1);
  }
}

main();

// scripts/seed-demo-data.js — Pre-seed SQLite with baseline actions for demo
// Run: npm run seed
//
// Seeds 10 synthetic actions at 0.5–1.5 tokens each for behavioral drift baseline,
// plus a session intent for drift detection demo.

require('dotenv').config();
const { storeAction, storeSessionIntent } = require('../backend/src/store');

const DEMO_AGENT = process.env.AGENT_ADDRESS || '0x1234567890123456789012345678901234567890';
const DEMO_SESSION = process.env.SESSION_ID || 'sess_demo_001';
const KNOWN_PAY_TO = '0x4A50DCA63d541372ad36E5A36F1D542d51164F19'; // Kite Weather API

console.log('[Seed] Seeding demo data for agent:', DEMO_AGENT);

// Seed 10 historical actions at 0.5–1.5 tokens (for behavioral drift baseline)
const BASE_TIME = Date.now() - 3 * 24 * 3600 * 1000; // 3 days ago
for (let i = 0; i < 10; i++) {
  const amountTokens = 0.5 + Math.random(); // 0.5–1.5 tokens
  const amountWei = BigInt(Math.floor(amountTokens * 1e18)).toString();

  storeAction({
    agentAddress: DEMO_AGENT,
    sessionId: DEMO_SESSION,
    payTo: KNOWN_PAY_TO,
    amountWei,
    resource: 'https://x402.dev.gokite.ai/api/yield',
    riskLevel: 'LOW',
    success: true,
    vaultAddress: null
  });

  console.log(`  [${i + 1}/10] Seeded: ${amountTokens.toFixed(4)} tokens`);
}

// Seed session intent for drift detection
const hash = storeSessionIntent(
  DEMO_SESSION,
  DEMO_AGENT,
  'Research DeFi yield opportunities on Kite'
);
console.log(`[Seed] Session intent stored: ${DEMO_SESSION} → hash: ${hash.slice(0, 16)}...`);

console.log('[Seed] Done. Behavioral baseline: ~1.0 tokens avg, ~0.3 stdDev');
console.log('[Seed] Attack at 500 tokens will show >100σ deviation');

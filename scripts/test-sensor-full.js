// scripts/test-sensor-full.js — Comprehensive sensor test suite for ALL 10 rules
// Run: node scripts/test-sensor-full.js

require('dotenv').config();
const sensor = require('../backend/src/sensor');
const { storeSessionIntent } = require('../backend/src/store');
const { ethers } = require('ethers');

// Test agent with NO history (avoids rate limit from seeded data)
const FRESH_AGENT = '0x0000000000000000000000000000000000000099';
// Test agent WITH history (the seeded demo agent)
const SEEDED_AGENT = '0x1234567890123456789012345678901234567890';

// Seed a test session intent for drift detection
const TEST_SESSION = 'sess_test_drift_001';
storeSessionIntent(TEST_SESSION, FRESH_AGENT, 'Research DeFi yield opportunities on Kite');

const TESTS = [
  {
    name: 'Safe Payment — 1 token to known service',
    intent: {
      payTo: '0x4A50DCA63d541372ad36E5A36F1D542d51164F19',
      amountWei: ethers.parseUnits('1', 18).toString(),
      resource: 'https://x402.dev.gokite.ai/api/yield',
      agentAddress: FRESH_AGENT,
      sessionId: TEST_SESSION,
    },
    expect: { level: 'LOW', minFlags: 0, maxFlags: 0 }
  },
  {
    name: 'Attack — 1500 tokens, unknown, cross-chain keywords',
    intent: {
      payTo: '0xdead000000000000000000000000000000000001',
      amountWei: ethers.parseUnits('1500', 18).toString(),
      resource: 'https://lz-arb.io/layerzero-relay/drain?chain=polygon',
      agentAddress: FRESH_AGENT,
      sessionId: TEST_SESSION,
    },
    expect: { level: 'CRITICAL', minFlags: 3 }
  },
  {
    name: 'LZ Core Contract — EndpointV2',
    intent: {
      payTo: '0x6F475642a6e85809B1c36Fa62763669b1b48DD5B',
      amountWei: ethers.parseUnits('50', 18).toString(),
      resource: 'https://evil.io/drain',
      agentAddress: FRESH_AGENT,
    },
    expect: { level: 'CRITICAL', requireFlag: 'LayerZero' }
  },
  {
    name: 'Session Drift — DeFi yield session + layerzero resource',
    intent: {
      payTo: '0xdead000000000000000000000000000000000001',
      amountWei: ethers.parseUnits('5', 18).toString(),
      resource: 'https://malicious-relay.io/layerzero-bridge-drain',
      agentAddress: FRESH_AGENT,
      sessionId: TEST_SESSION,
    },
    expect: { level: 'HIGH', requireFlag: ['drift', 'catalog'] }
  },
  {
    name: 'Behavioral Drift — 500 tokens vs seeded ~1.0 avg baseline',
    intent: {
      payTo: '0x4A50DCA63d541372ad36E5A36F1D542d51164F19',
      amountWei: ethers.parseUnits('500', 18).toString(),
      resource: 'https://x402.dev.gokite.ai/api/yield',
      agentAddress: SEEDED_AGENT,  // Has 10 seeded actions at 0.5-1.5 tokens
      sessionId: 'sess_demo_001',
    },
    expect: { level: 'HIGH', requireFlag: ['spending', 'Unusual'] }
  },
  {
    name: 'Urgency Keywords — social engineering',
    intent: {
      payTo: '0x4A50DCA63d541372ad36E5A36F1D542d51164F19',
      amountWei: ethers.parseUnits('2', 18).toString(),
      resource: 'https://x402.dev.gokite.ai/api/urgent-deal?expiring=true',
      agentAddress: FRESH_AGENT,
    },
    expect: { requireFlag: 'Urgency' }
  },
  {
    name: 'No Session — should skip drift check',
    intent: {
      payTo: '0x4A50DCA63d541372ad36E5A36F1D542d51164F19',
      amountWei: ethers.parseUnits('1', 18).toString(),
      resource: 'https://x402.dev.gokite.ai/api/yield',
      agentAddress: FRESH_AGENT,
      // No sessionId
    },
    expect: { level: 'LOW', maxFlags: 0 }
  },
];

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FULL SENSOR ENGINE TEST — Rules 1-10');
  console.log('═══════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  for (const test of TESTS) {
    console.log(`─── ${test.name} ───`);
    try {
      const result = await sensor.check(test.intent);
      console.log(`  Level: ${result.level}`);
      console.log(`  Flags: ${result.flags.length}`);
      console.log(`  TrustTier: ${result.trustTier}`);
      result.flags.forEach(f => console.log(`    [${f.level}] ${f.reason}`));

      let pass = true;
      const errors = [];

      // Check expected level
      if (test.expect.level && result.level !== test.expect.level) {
        pass = false;
        errors.push(`expected level ${test.expect.level}, got ${result.level}`);
      }

      // Check minimum flags
      if (test.expect.minFlags !== undefined && result.flags.length < test.expect.minFlags) {
        pass = false;
        errors.push(`expected ≥${test.expect.minFlags} flags, got ${result.flags.length}`);
      }

      // Check maximum flags
      if (test.expect.maxFlags !== undefined && result.flags.length > test.expect.maxFlags) {
        pass = false;
        errors.push(`expected ≤${test.expect.maxFlags} flags, got ${result.flags.length}`);
      }

      // Check required flag keywords
      if (test.expect.requireFlag) {
        const keywords = Array.isArray(test.expect.requireFlag)
          ? test.expect.requireFlag
          : [test.expect.requireFlag];
        for (const keyword of keywords) {
          const found = result.flags.some(f =>
            f.reason.toLowerCase().includes(keyword.toLowerCase())
          );
          if (!found) {
            pass = false;
            errors.push(`expected flag containing "${keyword}"`);
          }
        }
      }

      if (pass) {
        console.log(`  ✅ PASS\n`);
        passed++;
      } else {
        console.log(`  ❌ FAIL: ${errors.join(', ')}\n`);
        failed++;
      }
    } catch (err) {
      console.log(`  ❌ ERROR: ${err.message}\n`);
      failed++;
    }
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed}/${passed + failed} tests passed`);
  if (failed > 0) console.log(`  ${failed} FAILED`);
  console.log('═══════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();

// scripts/test-sensor.js — Verify sensor rules 1-5 with safe + attack intents
// Run: node scripts/test-sensor.js

require('dotenv').config();
const sensor = require('../backend/src/sensor');
const { ethers } = require('ethers');

// Use a DIFFERENT agent address to avoid rate limit from seeded data
const TEST_AGENT = '0xABCDEF0123456789ABCDEF0123456789ABCDef01';

const SAFE_INTENT = {
  payTo: '0x4A50DCA63d541372ad36E5A36F1D542d51164F19',  // Known: Kite Weather API
  amountWei: ethers.parseUnits('1', 18).toString(),        // 1 token → LOW
  resource: 'https://x402.dev.gokite.ai/api/yield',       // Known hostname
  agentAddress: TEST_AGENT,
  sessionId: 'sess_test_001',
};

// Use a proper checksummed address for the attack intent
const ATTACK_INTENT = {
  payTo: '0xdEAD000000000000000000000000000000000001',    // Unknown address (valid checksum)
  amountWei: ethers.parseUnits('1500', 18).toString(),     // 1500 tokens → CRITICAL
  resource: 'https://lz-arb.io/layerzero-relay/drain?chain=polygon', // Cross-chain keywords
  agentAddress: TEST_AGENT,
  sessionId: 'sess_test_001',
};

const LZ_ATTACK_INTENT = {
  payTo: '0x6F475642a6e85809B1c36Fa62763669b1b48DD5B',   // LZ EndpointV2 — CRITICAL
  amountWei: ethers.parseUnits('50', 18).toString(),       // 50 tokens → MEDIUM
  resource: 'https://bridge.evil.io/relay',                // Unknown
  agentAddress: TEST_AGENT,
};

const URGENCY_INTENT = {
  payTo: '0x4A50DCA63d541372ad36E5A36F1D542d51164F19',  // Known
  amountWei: ethers.parseUnits('2', 18).toString(),       // 2 tokens → LOW
  resource: 'https://x402.dev.gokite.ai/api/urgent-deal?expiring=true',
  agentAddress: TEST_AGENT,
};

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  SENSOR ENGINE TEST — Rules 1-5 + Rule 8');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Test 1: Safe payment
  console.log('─── TEST 1: Safe Payment (1 token to known service) ───');
  const safe = await sensor.check(SAFE_INTENT);
  console.log(`  Level: ${safe.level}`);
  console.log(`  Flags: ${safe.flags.length}`);
  safe.flags.forEach(f => console.log(`    [${f.level}] ${f.reason}`));
  const safePass = safe.level === 'LOW' && safe.flags.length === 0;
  console.log(`  ${safePass ? '✅ PASS' : '❌ FAIL'} — expected LOW, no flags\n`);

  // Test 2: Attack (1500 tokens, unknown recipient, cross-chain keywords)
  console.log('─── TEST 2: Attack (1500 tokens, unknown, cross-chain) ───');
  const attack = await sensor.check(ATTACK_INTENT);
  console.log(`  Level: ${attack.level}`);
  console.log(`  Flags: ${attack.flags.length}`);
  attack.flags.forEach(f => console.log(`    [${f.level}] ${f.reason}`));
  const attackPass = attack.level === 'CRITICAL' && attack.flags.length >= 3;
  console.log(`  ${attackPass ? '✅ PASS' : '❌ FAIL'} — expected CRITICAL, 3+ flags\n`);

  // Test 3: LZ core contract payment
  console.log('─── TEST 3: LZ Core Contract (EndpointV2) ───');
  const lz = await sensor.check(LZ_ATTACK_INTENT);
  console.log(`  Level: ${lz.level}`);
  console.log(`  Flags: ${lz.flags.length}`);
  lz.flags.forEach(f => console.log(`    [${f.level}] ${f.reason}`));
  const lzCritical = lz.flags.some(f =>
    f.level === 'CRITICAL' && f.reason.includes('LayerZero')
  );
  console.log(`  ${lzCritical ? '✅ PASS' : '❌ FAIL'} — expected CRITICAL LayerZero flag\n`);

  // Test 4: Urgency keywords
  console.log('─── TEST 4: Urgency Keywords in URL ───');
  const urgency = await sensor.check(URGENCY_INTENT);
  console.log(`  Level: ${urgency.level}`);
  console.log(`  Flags: ${urgency.flags.length}`);
  urgency.flags.forEach(f => console.log(`    [${f.level}] ${f.reason}`));
  const urgencyFlag = urgency.flags.some(f => f.reason.includes('Urgency') || f.reason.includes('urgency'));
  console.log(`  ${urgencyFlag ? '✅ PASS' : '❌ FAIL'} — expected urgency flag\n`);

  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  const passed = [safePass, attackPass, lzCritical, urgencyFlag].filter(Boolean).length;
  console.log(`  RESULTS: ${passed}/4 tests passed`);
  console.log('═══════════════════════════════════════════════════════════\n');

  process.exit(passed === 4 ? 0 : 1);
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});

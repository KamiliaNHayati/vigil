#!/usr/bin/env node
// scripts/test-demo-agent.js — Test demo agent safe + attack paths
// Calls handler functions directly (no REST server needed)

require('dotenv').config();
const { ethers } = require('ethers');
const chalk = require('chalk');

// Import pipeline modules directly (avoids mcp-server transport side effects)
const sensor   = require('../backend/src/sensor');
const guide    = require('../backend/src/guide');
const verifier = require('../backend/src/verifier');
const policy   = require('../backend/src/policy');

const AGENT   = process.env.AGENT_ADDRESS || '0x1234567890123456789012345678901234567890';
const SESSION = process.env.SESSION_ID    || 'sess_demo_001';

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}: ${detail || 'failed'}`); failed++; }
}

// Replicate the evaluate pipeline from mcp-server.js
async function evaluatePayment(intent) {
  const sensorResult = await sensor.check(intent);
  const guideResult  = await guide.explain({
    amountWei: intent.amountWei, payTo: intent.payTo,
    resource: intent.resource, sensorResult
  });
  const verificationResult = await verifier.verify(sensorResult, guideResult, {
    amountWei: intent.amountWei, payTo: intent.payTo, resource: intent.resource
  });
  verificationResult.degraded = guideResult.degraded;
  const finalGuide = verificationResult.guide || guideResult;
  const decision = await policy.decide({
    sensorResult, verificationResult,
    amountWei: intent.amountWei, vaultAddress: intent.vaultAddress
  });

  return {
    action: decision.action,
    code: decision.code,
    sensorLevel: sensorResult.level,
    verifierAligned: verificationResult.aligned,
    verifierAttempts: verificationResult.attempts,
    degraded: guideResult.degraded,
    explanation: finalGuide.explanation,
    flags: sensorResult.flags,
    trustTier: sensorResult.trustTier
  };
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  DEMO AGENT PATH VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── TEST 1: Safe path — 1 token to Kite Weather API ─────────────
  console.log('─── Test 1: Safe path — Kite Weather API (1 token) ───');
  const t1Start = Date.now();
  const safeResult = await evaluatePayment({
    payTo: '0x4A50DCA63d541372ad36E5A36F1D542d51164F19',
    amountWei: ethers.parseUnits('1', 18).toString(),
    resource: 'https://x402.dev.gokite.ai/api/weather',
    agentAddress: AGENT,
    sessionId: SESSION
  });
  const t1Elapsed = Date.now() - t1Start;

  assert(safeResult.action !== 'BLOCK' || safeResult.degraded,
    `Action: ${safeResult.action} (degraded=${safeResult.degraded})`);
  assert(safeResult.sensorLevel === 'LOW' || safeResult.degraded,
    `SensorLevel: ${safeResult.sensorLevel}`);
  assert(safeResult.flags !== undefined, `Flags: ${safeResult.flags.length}`);
  assert(t1Elapsed < 5000, `Elapsed: ${t1Elapsed}ms (<5s)`, `took ${t1Elapsed}ms`);
  console.log(`  → ${chalk.green(safeResult.action)} in ${t1Elapsed}ms\n`);

  // ── TEST 2: Safe path — 1 token to DeFi Yield API ──────────────
  console.log('─── Test 2: Safe path — DeFi Yield API (1 token) ───');
  const t2Start = Date.now();
  const yieldResult = await evaluatePayment({
    payTo: '0x8d9FaD78d5Ce247aA01C140798B9558fd64a63E3',
    amountWei: ethers.parseUnits('1', 18).toString(),
    resource: 'https://x402.dev.gokite.ai/api/yield',
    agentAddress: AGENT,
    sessionId: SESSION
  });
  const t2Elapsed = Date.now() - t2Start;

  assert(yieldResult.action !== 'BLOCK' || yieldResult.degraded,
    `Action: ${yieldResult.action}`);
  assert(t2Elapsed < 5000, `Elapsed: ${t2Elapsed}ms (<5s)`);
  console.log(`  → ${chalk.green(yieldResult.action)} in ${t2Elapsed}ms\n`);

  // ── TEST 3: Attack path — 500 tokens to malicious relay ─────────
  console.log('─── Test 3: Attack path — 500 tokens to lz-arb.io ───');
  const t3Start = Date.now();
  const attackResult = await evaluatePayment({
    payTo: '0xDeaDbEeFDeaDbEeFDeaDbEeFDeaDbEeFDeaDbEeF',
    amountWei: ethers.parseUnits('500', 18).toString(),
    resource: 'https://lz-arb.io/layerzero-relay/drain?chain=polygon&urgent=true',
    agentAddress: AGENT,
    sessionId: SESSION
  });
  const t3Elapsed = Date.now() - t3Start;

  assert(attackResult.action === 'BLOCK', `Action: ${attackResult.action}`, `expected BLOCK`);
  assert(['HIGH', 'CRITICAL'].includes(attackResult.sensorLevel), `SensorLevel: ${attackResult.sensorLevel}`);
  assert(attackResult.flags.length >= 3, `Flags: ${attackResult.flags.length} (expected ≥3)`);
  assert(t3Elapsed < 5000, `Elapsed: ${t3Elapsed}ms (<5s)`);

  console.log(`  → Flags caught:`);
  attackResult.flags.forEach(f => {
    const c = { CRITICAL: chalk.red, HIGH: chalk.hex('#FF8C00'), MEDIUM: chalk.yellow, LOW: chalk.green }[f.level] || chalk.white;
    console.log(`    ${c('●')} ${c(`[${f.level}]`)} ${f.reason.slice(0, 70)}`);
  });
  console.log(`  → ${chalk.red('BLOCKED')} in ${t3Elapsed}ms\n`);

  // ── TEST 4: Attack with action keywords (ACTION_KEYWORDS) ───────
  console.log('─── Test 4: Attack — action keyword in URL ───');
  const t4Result = await evaluatePayment({
    payTo: '0xDeaDbEeFDeaDbEeFDeaDbEeFDeaDbEeFDeaDbEeF',
    amountWei: ethers.parseUnits('10', 18).toString(),
    resource: 'https://evil.io/approve-now?claim-now=true',
    agentAddress: AGENT,
    sessionId: SESSION
  });
  assert(t4Result.action === 'BLOCK', `Action: ${t4Result.action}`);
  // Check for action or urgency keyword flag
  const hasKeywordFlag = t4Result.flags.some(f =>
    f.reason.toLowerCase().includes('action') ||
    f.reason.toLowerCase().includes('urgency') ||
    f.reason.toLowerCase().includes('immediate')
  );
  assert(hasKeywordFlag, 'Has action/urgency keyword flag');
  console.log('');

  // ── TEST 5: Timing — safe path completes under 3s ──────────────
  console.log('─── Test 5: Timing — safe path < 3s ───');
  // First call is cold (MCP + RPC warmup), second is hot
  assert(t1Elapsed < 6000, `Weather: ${t1Elapsed}ms (<6s cold start)`, `took ${t1Elapsed}ms`);
  assert(t2Elapsed < 3000, `Yield: ${t2Elapsed}ms (<3s hot path)`, `took ${t2Elapsed}ms`);

  // ── RESULTS ─────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed}/${passed + failed} tests passed`);
  if (failed > 0) console.log(`  ${failed} FAILED`);
  console.log('═══════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});

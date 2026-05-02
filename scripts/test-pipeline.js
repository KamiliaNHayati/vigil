#!/usr/bin/env node
// test-pipeline.js — Integration test for the full Sensor → Guide → Verifier → Policy pipeline
// Tests all decision paths: APPROVE, WARN, BLOCK, DEGRADED, CIRCUIT_BREAKER,
// HALLUCINATION_RISK, VERIFICATION_FAILED

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// ── Test Utilities ────────────────────────────────────────────────────────────

const sensor   = require('../backend/src/sensor');
const guide    = require('../backend/src/guide');
const verifier = require('../backend/src/verifier');
const policy   = require('../backend/src/policy');
const { db }   = require('../backend/src/store');

let passed = 0;
let failed = 0;

function assert(condition, testName, details) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}: ${details || 'assertion failed'}`);
    failed++;
  }
}

// ── Seed test data ────────────────────────────────────────────────────────────
const TEST_AGENT = '0x1234567890abcdef1234567890abcdef12345678';
const TEST_PAYTO = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const SESSION_ID = 'test-session-pipeline';

// Ensure session intent is seeded for drift tests
db.prepare(`INSERT OR REPLACE INTO session_intents VALUES (?, ?, ?, ?, ?)`)
  .run(SESSION_ID, TEST_AGENT, 'Research DeFi yield opportunities on Kite', 'hash123', Date.now());

console.log('═══════════════════════════════════════════════════════════');
console.log('  PIPELINE TEST — Sensor → Guide → Verifier → Policy');
console.log('═══════════════════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Verifier — checkAlignment on aligned result
// ═══════════════════════════════════════════════════════════════════════════════

async function testVerifierAligned() {
  console.log('─── Test 1: Verifier — aligned result ───');
  const sensorResult = {
    level: 'LOW',
    flags: []
  };
  const guideResult = {
    riskLevel: 'LOW',
    explanation: 'This 1.0 token payment to wallet 0x1234...5678 has no risk flags.',
    primaryConcern: null
  };

  const result = verifier.checkAlignment(sensorResult, guideResult);
  assert(result.aligned === true, 'Aligned result returns aligned=true');
  assert(result.hallucinationRisk === false, 'No hallucination risk');
  assert(result.issues.length === 0, 'No issues');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Verifier — risk level mismatch
// ═══════════════════════════════════════════════════════════════════════════════

async function testVerifierMismatch() {
  console.log('\n─── Test 2: Verifier — risk level mismatch ───');
  const sensorResult = {
    level: 'HIGH',
    flags: [{ level: 'HIGH', reason: 'Recipient not in Kite service catalog' }]
  };
  const guideResult = {
    riskLevel: 'LOW',  // Wrong!
    explanation: 'Payment to unknown recipient flagged as high risk.',
    primaryConcern: 'Recipient not in catalog'
  };

  const result = verifier.checkAlignment(sensorResult, guideResult);
  assert(result.aligned === false, 'Mismatch detected');
  assert(result.issues.some(i => i.includes('mismatch')), 'Reports mismatch issue',
    JSON.stringify(result.issues));
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Verifier — false-safety hallucination detection
// ═══════════════════════════════════════════════════════════════════════════════

async function testVerifierHallucination() {
  console.log('\n─── Test 3: Verifier — hallucination detection ───');
  const sensorResult = {
    level: 'CRITICAL',
    flags: [{ level: 'CRITICAL', reason: 'Amount exceeds 1000 tokens' }]
  };
  const guideResult = {
    riskLevel: 'CRITICAL',
    explanation: 'WARNING: This payment looks safe and routine.',  // False safety!
    primaryConcern: 'Amount exceeds 1000 tokens'
  };

  const result = verifier.checkAlignment(sensorResult, guideResult);
  assert(result.aligned === false, 'Hallucination detected');
  assert(result.hallucinationRisk === true, 'hallucinationRisk=true',
    `got ${result.hallucinationRisk}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Verifier — CRITICAL missing WARNING prefix
// ═══════════════════════════════════════════════════════════════════════════════

async function testVerifierMissingWarning() {
  console.log('\n─── Test 4: Verifier — missing WARNING prefix ───');
  const sensorResult = {
    level: 'CRITICAL',
    flags: [{ level: 'CRITICAL', reason: 'Amount exceeds 1000 tokens' }]
  };
  const guideResult = {
    riskLevel: 'CRITICAL',
    explanation: 'This payment of 1500 tokens exceeds the amount threshold.',
    primaryConcern: 'Amount exceeds 1000 tokens'
  };

  const result = verifier.checkAlignment(sensorResult, guideResult);
  assert(result.aligned === false, 'Missing WARNING detected');
  assert(result.issues.some(i => i.includes('WARNING')), 'Reports WARNING issue');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Policy — APPROVE on LOW risk
// ═══════════════════════════════════════════════════════════════════════════════

async function testPolicyApprove() {
  console.log('\n─── Test 5: Policy — APPROVE on LOW risk ───');
  const decision = await policy.decide({
    sensorResult: { level: 'LOW', flags: [] },
    verificationResult: { aligned: true, hallucinationRisk: false, degraded: false },
    amountWei: ethers.parseUnits('1', 18).toString()
  });

  assert(decision.action === 'APPROVE', 'Action is APPROVE', decision.action);
  assert(decision.code === 'OK', 'Code is OK', decision.code);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Policy — WARN on HIGH risk
// ═══════════════════════════════════════════════════════════════════════════════

async function testPolicyWarn() {
  console.log('\n─── Test 6: Policy — WARN on HIGH risk ───');
  const decision = await policy.decide({
    sensorResult: { level: 'HIGH', flags: [{ level: 'HIGH', reason: 'test' }] },
    verificationResult: { aligned: true, hallucinationRisk: false, degraded: false },
    amountWei: ethers.parseUnits('150', 18).toString()
  });

  assert(decision.action === 'WARN', 'Action is WARN', decision.action);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Policy — BLOCK on CRITICAL risk
// ═══════════════════════════════════════════════════════════════════════════════

async function testPolicyBlock() {
  console.log('\n─── Test 7: Policy — BLOCK on CRITICAL risk ───');
  const decision = await policy.decide({
    sensorResult: { level: 'CRITICAL', flags: [{ level: 'CRITICAL', reason: 'Amount exceeds 1000 tokens' }] },
    verificationResult: { aligned: true, hallucinationRisk: false, degraded: false },
    amountWei: ethers.parseUnits('1500', 18).toString()
  });

  assert(decision.action === 'BLOCK', 'Action is BLOCK', decision.action);
  assert(decision.code === 'CRITICAL_RISK', 'Code is CRITICAL_RISK', decision.code);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Policy — BLOCK on hallucination risk
// ═══════════════════════════════════════════════════════════════════════════════

async function testPolicyHallucination() {
  console.log('\n─── Test 8: Policy — BLOCK on HALLUCINATION_RISK ───');
  const decision = await policy.decide({
    sensorResult: { level: 'HIGH', flags: [{ level: 'HIGH', reason: 'test' }] },
    verificationResult: {
      aligned: false,
      hallucinationRisk: true,
      degraded: false,
      issues: ['Guide falsely characterises HIGH/CRITICAL risk as safe']
    },
    amountWei: ethers.parseUnits('50', 18).toString()
  });

  assert(decision.action === 'BLOCK', 'Action is BLOCK', decision.action);
  assert(decision.code === 'HALLUCINATION_RISK', 'Code is HALLUCINATION_RISK', decision.code);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9: Policy — BLOCK on verification failure
// ═══════════════════════════════════════════════════════════════════════════════

async function testPolicyVerificationFailed() {
  console.log('\n─── Test 9: Policy — BLOCK on VERIFICATION_FAILED ───');
  const decision = await policy.decide({
    sensorResult: { level: 'HIGH', flags: [{ level: 'HIGH', reason: 'test' }] },
    verificationResult: {
      aligned: false,
      hallucinationRisk: false,
      degraded: false,
      issues: ['Risk level mismatch: sensor=HIGH, guide=LOW']
    },
    amountWei: ethers.parseUnits('50', 18).toString()
  });

  assert(decision.action === 'BLOCK', 'Action is BLOCK', decision.action);
  assert(decision.code === 'VERIFICATION_FAILED', 'Code is VERIFICATION_FAILED', decision.code);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 10: Policy — degraded mode blocks MEDIUM+
// ═══════════════════════════════════════════════════════════════════════════════

async function testPolicyDegraded() {
  console.log('\n─── Test 10: Policy — DEGRADED_MODE_STRICT ───');
  const decision = await policy.decide({
    sensorResult: { level: 'MEDIUM', flags: [{ level: 'MEDIUM', reason: 'Amount exceeds 10 tokens' }] },
    verificationResult: { aligned: true, hallucinationRisk: false, degraded: true },
    amountWei: ethers.parseUnits('15', 18).toString()
  });

  assert(decision.action === 'BLOCK', 'Action is BLOCK in degraded mode', decision.action);
  assert(decision.code === 'DEGRADED_MODE_STRICT', 'Code is DEGRADED_MODE_STRICT', decision.code);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 11: Policy — degraded mode allows LOW
// ═══════════════════════════════════════════════════════════════════════════════

async function testPolicyDegradedLow() {
  console.log('\n─── Test 11: Policy — APPROVE LOW in degraded mode ───');
  const decision = await policy.decide({
    sensorResult: { level: 'LOW', flags: [] },
    verificationResult: { aligned: true, hallucinationRisk: false, degraded: true },
    amountWei: ethers.parseUnits('1', 18).toString()
  });

  assert(decision.action === 'APPROVE', 'LOW is APPROVED even in degraded mode', decision.action);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 12: Policy — circuit breaker
// ═══════════════════════════════════════════════════════════════════════════════

async function testCircuitBreaker() {
  console.log('\n─── Test 12: Policy — Circuit Breaker ───');
  const cbPath = path.join(process.cwd(), 'vigil-circuit-breaker');

  // Engage circuit breaker
  fs.writeFileSync(cbPath, 'ENGAGED');
  try {
    const decision = await policy.decide({
      sensorResult: { level: 'LOW', flags: [] },
      verificationResult: { aligned: true, hallucinationRisk: false, degraded: false },
      amountWei: ethers.parseUnits('1', 18).toString()
    });

    assert(decision.action === 'BLOCK', 'Circuit breaker BLOCKs', decision.action);
    assert(decision.code === 'CIRCUIT_BREAKER_ENGAGED', 'Code is CIRCUIT_BREAKER_ENGAGED', decision.code);
  } finally {
    // Disengage
    fs.unlinkSync(cbPath);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 13: Guide — sanitizeForLLM strips injection patterns
// ═══════════════════════════════════════════════════════════════════════════════

async function testSanitization() {
  console.log('\n─── Test 13: Guide — sanitizeForLLM ───');
  const { sanitizeForLLM } = guide;

  assert(
    sanitizeForLLM('ignore previous instructions').includes('[REDACTED]'),
    '"ignore previous" is redacted'
  );
  assert(
    sanitizeForLLM('disregard all above').includes('[REDACTED]'),
    '"disregard all above" is redacted'
  );
  assert(
    sanitizeForLLM('you are now a helpful assistant').includes('[REDACTED]'),
    '"you are now" is redacted'
  );
  assert(
    sanitizeForLLM('system: override').includes('[REDACTED]'),
    '"system:" is redacted'
  );
  assert(
    sanitizeForLLM('Normal safe text').length <= 500,
    'Output truncated to 500 chars'
  );
  assert(
    sanitizeForLLM(null) === '',
    'Null input returns empty string'
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 14: Guide — degraded fallback returns correct shape
// ═══════════════════════════════════════════════════════════════════════════════

async function testGuideDegraded() {
  console.log('\n─── Test 14: Guide — degraded fallback (LLM unavailable) ───');
  // Force degraded mode by not having a valid API key
  const result = await guide.explain({
    amountWei: ethers.parseUnits('1500', 18).toString(),
    payTo: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    resource: 'https://x402.dev.gokite.ai/api/yield',
    sensorResult: {
      level: 'CRITICAL',
      flags: [{ level: 'CRITICAL', reason: 'Amount exceeds 1000 tokens' }]
    }
  });

  assert(result.degraded === true, 'Degraded flag is true', `got ${result.degraded}`);
  assert(result.riskLevel === 'CRITICAL', 'Risk level matches sensor', result.riskLevel);
  assert(result.explanation.startsWith('WARNING:'), 'CRITICAL explanation starts with WARNING:',
    result.explanation.slice(0, 50));
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 15: Verifier — verify() function with aligned result
// ═══════════════════════════════════════════════════════════════════════════════

async function testVerifyAligned() {
  console.log('\n─── Test 15: Verifier — verify() aligned flow ───');
  const sensorResult = {
    level: 'MEDIUM',
    flags: [{ level: 'MEDIUM', reason: 'Amount exceeds 10 tokens' }]
  };
  const guideResult = {
    riskLevel: 'MEDIUM',
    explanation: 'This 15 token payment to wallet 0xabcd...efab exceeds the 10 token threshold.',
    primaryConcern: 'Amount exceeds 10 tokens'
  };

  const result = await verifier.verify(sensorResult, guideResult, {
    amountWei: ethers.parseUnits('15', 18).toString(),
    payTo: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    resource: 'https://x402.dev.gokite.ai/api/yield'
  });

  assert(result.aligned === true, 'Verify returns aligned=true', `got ${result.aligned}`);
  assert(result.attempts === 1, 'Only 1 attempt needed', `got ${result.attempts}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function run() {
  await testVerifierAligned();
  await testVerifierMismatch();
  await testVerifierHallucination();
  await testVerifierMissingWarning();
  await testPolicyApprove();
  await testPolicyWarn();
  await testPolicyBlock();
  await testPolicyHallucination();
  await testPolicyVerificationFailed();
  await testPolicyDegraded();
  await testPolicyDegradedLow();
  await testCircuitBreaker();
  await testSanitization();
  await testGuideDegraded();
  await testVerifyAligned();

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

#!/usr/bin/env node
// test-rest-api.js — Test REST API with safe + attack payloads
// Requires the REST server to be running on localhost:3001

const BASE = process.env.VIGIL_REST_URL || 'http://localhost:3001';

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, data: await res.json() };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, data: await res.json() };
}

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}: ${detail || 'failed'}`); failed++; }
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  REST API TEST — curl-equivalent payloads');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── Test 1: Health check ────────────────────────────────────────
  console.log('─── Test 1: Health check ───');
  const health = await get('/api/health');
  assert(health.status === 200, 'Status 200');
  assert(health.data.status === 'ok', 'Returns ok');
  assert(health.data.transport === 'rest', 'Transport is rest');

  // ── Test 2: Safe payment — 1 token to known service ────────────
  console.log('\n─── Test 2: Safe payment — 1 token ───');
  const safe = await post('/api/evaluate', {
    payTo: '0x12343e649e6b2b2b77649DFAb88f103c02F3C78b',
    amountWei: '1000000000000000000',
    resource: 'https://x402.dev.gokite.ai/api/yield',
    agentAddress: '0x1234567890abcdef1234567890abcdef12345678',
    sessionId: 'test-session-pipeline'
  });
  assert(safe.status === 200, 'Status 200');
  assert(safe.data.action !== undefined, `Action: ${safe.data.action}`);
  assert(safe.data.sensorLevel !== undefined, `SensorLevel: ${safe.data.sensorLevel}`);
  assert(safe.data.flags !== undefined, `Flags count: ${safe.data.flags.length}`);
  assert(safe.data.explanation !== undefined, 'Has explanation');
  assert(safe.data.verifierAligned !== undefined, `VerifierAligned: ${safe.data.verifierAligned}`);
  assert(safe.data.degraded !== undefined, `Degraded: ${safe.data.degraded}`);
  console.log(`  → Full response shape: action=${safe.data.action} code=${safe.data.code} sensor=${safe.data.sensorLevel}`);

  // ── Test 3: Attack — 1500 tokens to unknown, cross-chain ──────
  console.log('\n─── Test 3: Attack — 1500 tokens to unknown ───');
  const attack = await post('/api/evaluate', {
    payTo: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    amountWei: '1500000000000000000000',
    resource: 'https://lz-arb.io/drain?urgent=true',
    agentAddress: '0x1234567890abcdef1234567890abcdef12345678',
    sessionId: 'test-session-pipeline'
  });
  assert(attack.status === 200, 'Status 200');
  assert(attack.data.action === 'BLOCK', `Action: ${attack.data.action}`);
  assert(attack.data.sensorLevel === 'CRITICAL', `SensorLevel: ${attack.data.sensorLevel}`);
  assert(attack.data.flags.length >= 3, `Flags: ${attack.data.flags.length} (expected ≥3)`);
  console.log(`  → Flags: ${attack.data.flags.map(f => `[${f.level}] ${f.reason.slice(0,50)}`).join('\n           ')}`);

  // ── Test 4: Record outcome ─────────────────────────────────────
  console.log('\n─── Test 4: Record outcome ───');
  const record = await post('/api/record', {
    agentAddress: '0x1234567890abcdef1234567890abcdef12345678',
    success: true,
    riskLevel: 'LOW',
    traceData: JSON.stringify({ apy: 12, responseBytes: 1024 }),
    payTo: '0x12343e649e6b2b2b77649DFAb88f103c02F3C78b',
    amountWei: '1000000000000000000',
    resource: 'https://x402.dev.gokite.ai/api/yield'
  });
  assert(record.status === 200, 'Status 200');
  assert(record.data.recorded === true, 'Recorded: true');
  assert(record.data.traceHash !== undefined, `TraceHash: ${record.data.traceHash.slice(0, 16)}...`);
  assert(record.data.oracleWarning === null, 'No oracle warning (APY=12)');

  // ── Test 5: Record outcome with oracle warning ─────────────────
  console.log('\n─── Test 5: Record outcome — oracle warning ───');
  const warn = await post('/api/record', {
    agentAddress: '0x1234567890abcdef1234567890abcdef12345678',
    success: true,
    riskLevel: 'LOW',
    traceData: JSON.stringify({ apy: 120 })
  });
  assert(warn.data.oracleWarning !== null, `Oracle warning: ${warn.data.oracleWarning}`);

  // ── Test 6: Get reputation ─────────────────────────────────────
  console.log('\n─── Test 6: Get agent reputation ───');
  const rep = await get('/api/reputation/0x1234567890abcdef1234567890abcdef12345678');
  assert(rep.status === 200, 'Status 200');
  assert(rep.data.agentAddress !== undefined, `Agent: ${rep.data.agentAddress}`);
  assert(rep.data.totalActions >= 0, `Total actions: ${rep.data.totalActions}`);
  assert(rep.data.trustTier >= 0, `Trust tier: ${rep.data.trustTier}`);
  assert(rep.data.source !== undefined, `Source: ${rep.data.source}`);
  console.log(`  → Reputation: tier=${rep.data.trustTier} score=${rep.data.reputationScore} total=${rep.data.totalActions}`);

  // ── Test 7: Dashboard feed ─────────────────────────────────────
  console.log('\n─── Test 7: Dashboard feed ───');
  const feed = await get('/api/evaluations?limit=5');
  assert(feed.status === 200, 'Status 200');
  assert(Array.isArray(feed.data.evaluations), `Evaluations array: ${feed.data.evaluations.length} items`);

  // ── Test 8: Input validation — bad address ─────────────────────
  console.log('\n─── Test 8: Input validation — bad address ───');
  const bad = await post('/api/evaluate', {
    payTo: 'not-an-address',
    amountWei: '1000000000000000000',
    resource: 'https://example.com',
    agentAddress: '0x1234567890abcdef1234567890abcdef12345678'
  });
  assert(bad.status === 400, `Status 400 on bad input: ${bad.status}`);
  assert(bad.data.error !== undefined, `Error message: ${bad.data.error}`);

  // ── Test 9: CORS headers ───────────────────────────────────────
  console.log('\n─── Test 9: CORS headers ───');
  const cors = await fetch(`${BASE}/api/health`);
  assert(cors.headers.get('access-control-allow-origin') === '*', 'CORS origin: *');

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed}/${passed + failed} tests passed`);
  if (failed > 0) console.log(`  ${failed} FAILED`);
  console.log('═══════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test error:', err.message);
  process.exit(1);
});

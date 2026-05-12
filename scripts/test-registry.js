#!/usr/bin/env node
// scripts/test-registry.js — Verify AgentRegistry on-chain reads
// Tests: getTrustTier(), getProfile(), and sensor Rule 9 integration
//
// Run: node scripts/test-registry.js

require('dotenv').config();
const { ethers } = require('ethers');

const REGISTRY_ADDR = process.env.AGENT_REGISTRY_ADDRESS;
const RPC_URL       = process.env.KITE_RPC_URL;
const TEST_AGENT    = '0x1234567890abcdef1234567890abcdef12345678';

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}: ${detail || 'failed'}`); failed++; }
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  AGENT REGISTRY VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!REGISTRY_ADDR || !RPC_URL) {
    console.log('  ⚠ Skipping: AGENT_REGISTRY_ADDRESS or KITE_RPC_URL not set');
    process.exit(0);
  }

  console.log(`  Registry:  ${REGISTRY_ADDR}`);
  console.log(`  RPC:       ${RPC_URL}`);
  console.log('');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const ABI = [
    'function getTrustTier(address) view returns (uint8)',
    'function getProfile(address) view returns (uint256 score, uint256 total, uint256 successful, uint256 failed)',
    'function reporter() view returns (address)',
    'function paused() view returns (bool)',
    'function getRecentTraces(address) view returns (bytes32[10])'
  ];
  const registry = new ethers.Contract(REGISTRY_ADDR, ABI, provider);

  // ── Test 1: Contract exists and is accessible ───────────────────
  console.log('─── Test 1: Contract connection ───');
  try {
    const reporter = await registry.reporter();
    assert(ethers.isAddress(reporter), 'Reporter is valid address', reporter);
    console.log(`  → Reporter: ${reporter}`);

    const paused = await registry.paused();
    assert(paused === false, 'Contract is not paused');
  } catch (err) {
    assert(false, 'Contract connection', err.message);
  }

  // ── Test 2: getTrustTier for fresh agent ─────────────────────────
  console.log('\n─── Test 2: getTrustTier (fresh agent) ───');
  try {
    const tier = await registry.getTrustTier(TEST_AGENT);
    const tierNum = Number(tier);
    assert(tierNum >= 0 && tierNum <= 3, `Trust tier: ${tierNum} (0=New, 1=Est, 2=Trusted, 3=Verified)`);
  } catch (err) {
    assert(false, 'getTrustTier call', err.message);
  }

  // ── Test 3: getProfile for fresh agent ───────────────────────────
  console.log('\n─── Test 3: getProfile (fresh agent) ───');
  try {
    const profile = await registry.getProfile(TEST_AGENT);
    assert(profile.score !== undefined, `Score: ${Number(profile.score)}`);
    assert(profile.total !== undefined, `Total actions: ${Number(profile.total)}`);
    assert(profile.successful !== undefined, `Successful: ${Number(profile.successful)}`);
    assert(profile.failed !== undefined, `Failed: ${Number(profile.failed)}`);
    console.log(`  → Profile: score=${Number(profile.score)} total=${Number(profile.total)} success=${Number(profile.successful)} fail=${Number(profile.failed)}`);
  } catch (err) {
    assert(false, 'getProfile call', err.message);
  }

  // ── Test 4: getRecentTraces ──────────────────────────────────────
  console.log('\n─── Test 4: getRecentTraces ───');
  try {
    const traces = await registry.getRecentTraces(TEST_AGENT);
    assert(traces.length === 10, `Circular buffer: ${traces.length} slots`);
  } catch (err) {
    assert(false, 'getRecentTraces call', err.message);
  }

  // ── Test 5: Sensor Rule 9 integration ───────────────────────────
  console.log('\n─── Test 5: Sensor Rule 9 reads on-chain tier ───');
  try {
    const sensor = require('../backend/src/sensor');
    const result = await sensor.check({
      payTo: '0x4A50DCA63d541372ad36E5A36F1D542d51164F19',
      amountWei: ethers.parseUnits('1', 18).toString(),
      resource: 'https://x402.dev.gokite.ai/api/yield',
      agentAddress: TEST_AGENT
    });
    assert(result.trustTier !== undefined, `Sensor returned trustTier: ${result.trustTier}`);
    assert(typeof result.trustTier === 'number', 'trustTier is a number');
  } catch (err) {
    assert(false, 'Sensor Rule 9', err.message);
  }

  // ── Test 6: handleGetReputation reads on-chain ──────────────────
  console.log('\n─── Test 6: handleGetReputation (on-chain read) ───');
  try {
    const { handleGetReputation } = require('../backend/src/mcp-server');
    const rep = await handleGetReputation({ agentAddress: TEST_AGENT });
    assert(rep.agentAddress === TEST_AGENT, `Agent match: ${rep.agentAddress}`);
    assert(rep.source === 'on-chain', `Source: ${rep.source}`, `expected 'on-chain', got '${rep.source}'`);
    assert(rep.trustTier >= 0 && rep.trustTier <= 3, `Trust tier: ${rep.trustTier}`);
    assert(rep.reputationScore >= 0, `Score: ${rep.reputationScore}`);
    console.log(`  → Reputation: tier=${rep.trustTier} score=${rep.reputationScore} total=${rep.totalActions} source=${rep.source}`);
  } catch (err) {
    assert(false, 'handleGetReputation', err.message);
  }

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

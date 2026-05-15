#!/usr/bin/env node
require('dotenv').config(); // Load .env from project root
const { kpassExecute } = require('./mock-kpass');

// ── Config ────────────────────────────────────────────────────────────────
const AGENT_ADDRESS = process.env.AGENT_ADDRESS;
const SESSION_ID = process.env.SESSION_ID;
const VAULT_ADDRESS = process.env.VAULT_ADDRESS;

if (!AGENT_ADDRESS || !SESSION_ID) {
  console.error('[Agent] Missing AGENT_ADDRESS or SESSION_ID in .env');
  process.exit(1);
}

// ── Vigil Connection (REST API — simpler than MCP for demo) ─────────────────
const VIGIL_API = 'http://localhost:3001';

async function evaluatePayment(intent) {
  const res = await fetch(`${VIGIL_API}/api/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(intent)
  });
  return res.json();
}

async function recordOutcome(data) {
  const res = await fetch(`${VIGIL_API}/api/record`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

// ── SAFE PATH: DeFi Yield Research ─────────────────────────────────────────
async function safePath() {
  console.log('\n' + '='.repeat(60));
  console.log('SAFE PATH: DeFi Yield Research Agent');
  console.log('='.repeat(60) + '\n');

  // Use known services fallback (ksearch not live on testnet)
  const services = require('../data/known-services-fallback.json')
    .filter(s => s.category === 'defi' || s.category === 'yield' || s.category === 'weather')
    .slice(0, 2);

  for (const service of services) {
    console.log(`[Agent] Evaluating: ${service.name}`);

    // 1. Call Vigil evaluate
    const evalResult = await evaluatePayment({
      payTo: service.payTo,
      amountWei: service.maxAmountRequired,
      resource: service.resource,
      agentAddress: AGENT_ADDRESS,
      sessionId: SESSION_ID,
      vaultAddress: VAULT_ADDRESS
    });

    console.log(`[Vigil] ${evalResult.action}: ${evalResult.explanation}`);

    if (evalResult.action === 'BLOCK') {
      console.log(`[Agent] Skipped — blocked by Vigil\n`);
      continue;
    }

    // 2. Use capsule key if Vigil provided one (on-chain spend enforcement)
    let capsuleKey = null;
    if (evalResult.capsule) {
      capsuleKey = evalResult.capsule.privateKey;
      console.log(`[Capsule] Using one-shot session key: ${evalResult.capsule.address}`);
      console.log(`[Capsule] Expires at: ${new Date(evalResult.capsule.expiresAt * 1000).toISOString()}`);
    }

    // 3. Execute payment (capsule key used if available, otherwise default session)
    const response = await kpassExecute(service.resource, { capsuleKey });
    console.log(response.source === 'real' ? '🟢 Real x402 payment' : '🟡 Mock fallback');

    // 4. Record outcome
    await recordOutcome({
      agentAddress: AGENT_ADDRESS,
      success: true,
      riskLevel: evalResult.sensorLevel,
      traceData: JSON.stringify({
        service: service.resource,
        data: response.data,
        source: response.source
      }),
      vaultAddress: VAULT_ADDRESS
    });

    console.log(`[Agent] Data received:`, response.data, '\n');
  }
}

// ── ATTACK PATH: Hijacked Agent ────────────────────────────────────────────
async function attackPath() {
  console.log('\n' + '='.repeat(60));
  console.log('ATTACK PATH: Prompt Injection → Cross-Chain Relay Drain');
  console.log('='.repeat(60) + '\n');

  const attackIntent = {
    payTo: '0xDeaDbEeFDeaDbEeFDeaDbEeFDeaDbEeFDeaDbEeF',
    amountWei: '500000000000000000000', // 500 tokens
    resource: 'https://lz-arb.io/layerzero-relay/drain?chain=polygon',
    agentAddress: AGENT_ADDRESS,
    sessionId: SESSION_ID,
    vaultAddress: VAULT_ADDRESS
  };

  const result = await evaluatePayment(attackIntent);

  console.log(`[Vigil] ${result.action}: ${result.explanation}`);
  console.log(`\nQuadruple flag analysis:`);
  result.flags?.forEach((f, i) => {
    console.log(`  ${i + 1}. [${f.level}] ${f.reason}`);
  });

  if (result.action === 'BLOCK') {
    console.log(`\n✅ Agent wallet protected — no kpass execute called`);
  }
}

// ── Entry Point ────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--attack')) {
    await attackPath();
  } else {
    await safePath();
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[Agent] Fatal error:', err);
  process.exit(1);
});
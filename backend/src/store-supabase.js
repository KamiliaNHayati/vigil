// backend/src/store-supabase.js — Supabase dual-write for hybrid dashboard
// Only active when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
// Uses service_role key (never exposed to frontend).
//
// Hybrid architecture:
//   trace_hash links each Supabase row to the on-chain AgentRegistry proof.
//   The dashboard reads rich data (flags, breakdown) from Supabase and
//   verifies trust/reputation directly from the Kite chain.

const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function getClient() {
  if (!supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

/**
 * Store an evaluation to Supabase (fire-and-forget from mcp-server).
 * Includes all fields from the full response shape + trace_hash for on-chain link.
 */
async function storeEvaluationToSupabase(record) {
  const client = getClient();
  if (!client) return false;

  const { error } = await client
    .from('evaluations')
    .insert({
      agent_address:       record.agentAddress,
      pay_to:              record.payTo,
      amount_wei:          record.amountWei,
      resource:            record.resource,
      sensor_level:        record.sensorLevel,
      action:              record.action,
      code:                record.code,
      flags:               record.flags,
      explanation:         record.explanation,
      verifier_aligned:    record.verifierAligned,
      verifier_attempts:   record.verifierAttempts,
      degraded:            record.degraded,
      oracle_warning:      record.oracleWarning,
      // ── New hybrid fields ──
      trace_hash:          record.traceHash ?? null,
      pipeline_elapsed_ms: record.pipelineElapsedMs ?? null,
      sensor_breakdown:    record.sensorBreakdown ?? null,
      threat_intel:        record.threatIntel ?? null,
      trust_tier:          record.trustTier ?? 0,
      capsule_address:     record.capsuleAddress ?? null,
      timestamp:           Date.now()
    });

  if (error) {
    if (error.code === '23505') return true; // Ignore duplicates for demo agent loop
    console.error('[Supabase] Insert failed:', error.message);
  }
  return !error || error.code === '23505';
}

// ── Nonces for Wallet Auth (In-Memory for Hackathon) ──

const MEMORY_NONCES = new Map();

async function createNonce(agentAddress) {
  const { ethers } = require('ethers');
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  
  MEMORY_NONCES.set(nonce, { agentAddress: agentAddress.toLowerCase(), expiresAt });
  return nonce;
}

async function verifyAndConsumeNonce(nonce, agentAddress) {
  const record = MEMORY_NONCES.get(nonce);
  if (!record) return false;
  
  MEMORY_NONCES.delete(nonce); // Consume immediately
  
  if (record.expiresAt <= Date.now()) return false;
  if (record.agentAddress !== agentAddress.toLowerCase()) return false;
  
  return true;
}

module.exports = { storeEvaluationToSupabase, createNonce, verifyAndConsumeNonce, getClient };

// contract-risk.js — Recipient Contract Risk Score
// Threat-informed rule addressing arbitrary-call vulnerabilities and unaudited contracts
// (the two most relevant DeFi hack vectors for agent payments).
//
// Decision tree:
//   Is payTo an EOA (no bytecode)? → Skip
//   In EXPLOITED_CONTRACTS?        → CRITICAL (short-circuit)
//   In TRUSTED_CONTRACTS?          → Pass
//   Source verified?               → No: HIGH  |  Yes but unknown: MEDIUM

require('dotenv').config();
const { ethers } = require('ethers');
const path = require('path');

// ── Exploit Database ─────────────────────────────────────────────────────────
// Sourced from DeFiHackLabs 2025–2026 analysis
let EXPLOIT_DB;
try {
  EXPLOIT_DB = require(path.join(__dirname, '../../data/exploit-db.json'));
} catch {
  EXPLOIT_DB = { exploitedContracts: [] };
}

const EXPLOITED_CONTRACTS = new Set(
  EXPLOIT_DB.exploitedContracts.map(e => e.address.toLowerCase())
);

// ── Trusted Contracts ────────────────────────────────────────────────────────
// Verified DeFi primitives on Kite testnet — loaded from env
const TRUSTED_CONTRACTS = new Set(
  [
    process.env.SETTLEMENT_CONTRACT,
    process.env.VAULT_IMPL,
    process.env.SETTLEMENT_TOKEN,
    process.env.KITE_TESTNET_FACILITATOR_ADDRESS,
    process.env.ALGEBRA_SWAP_ROUTER,
    process.env.ALGEBRA_FACTORY,
    process.env.AGENT_REGISTRY_ADDRESS,
  ]
    .filter(Boolean)
    .map(a => a.toLowerCase())
);

// ── Demo verified set (mock — no live explorer API on testnet) ────────────────
const DEMO_VERIFIED = new Set([
  ...TRUSTED_CONTRACTS,
]);

/**
 * Check recipient contract risk.
 *
 * @param {string} payTo - Recipient address
 * @returns {{ flags: Array<{level: string, reason: string}>, isContract: boolean }}
 */
async function checkContractRisk(payTo) {
  const flags = [];

  // Normalize address (handle non-checksummed input)
  let normalizedPayTo;
  try {
    normalizedPayTo = ethers.getAddress(payTo);
  } catch {
    // Invalid address format — skip contract checks
    console.warn('[ContractRisk] Invalid address format, skipping:', payTo);
    return { flags, isContract: false };
  }

  // Try to get bytecode — determines if EOA or contract
  let isContract = false;
  try {
    const provider = new ethers.JsonRpcProvider(process.env.KITE_RPC_URL);
    const code = await provider.getCode(normalizedPayTo);
    isContract = code !== '0x';
  } catch (err) {
    // RPC unavailable — assume EOA (conservative: no false flags)
    console.warn('[ContractRisk] RPC unavailable, assuming EOA:', err.message);
    return { flags, isContract: false };
  }

  // EOA — standard recipient, no contract-specific checks
  if (!isContract) {
    return { flags, isContract: false };
  }

  const payToLower = payTo.toLowerCase();

  // Check 1: Known exploit database — CRITICAL, short-circuit
  if (EXPLOITED_CONTRACTS.has(payToLower)) {
    flags.push({
      level: 'CRITICAL',
      reason: 'Recipient contract involved in a known exploit'
    });
    return { flags, isContract: true };
  }

  // Check 2: Trusted protocol list — pass
  if (TRUSTED_CONTRACTS.has(payToLower)) {
    return { flags, isContract: true };
  }

  // Check 3: Source verification check
  // DEMO MOCK: Kite testnet does not have a block explorer verification API.
  // This returns false for all unknown addresses — intentionally conservative.
  // In production: replace with real explorer API endpoint.
  const isVerified = await checkSourceVerified(payToLower);

  if (!isVerified) {
    flags.push({
      level: 'HIGH',
      reason: 'Recipient contract source code is unverified'
    });
  } else {
    // Verified but not in trusted list — MEDIUM
    flags.push({
      level: 'MEDIUM',
      reason: 'Unrecognized contract — review before paying'
    });
  }

  return { flags, isContract: true };
}

/**
 * DEMO MOCK — checkSourceVerified is not a real API call.
 * Returns false for all unknown addresses (intentionally conservative).
 * In production: replace with real explorer API endpoint.
 */
async function checkSourceVerified(addressLower) {
  return DEMO_VERIFIED.has(addressLower);
}

module.exports = { checkContractRisk, EXPLOITED_CONTRACTS, TRUSTED_CONTRACTS };

// policy.js — Policy Enforcer
// Final decision gate: APPROVE / WARN / BLOCK
//
// Order of checks:
//   1. Circuit breaker (file-based kill switch — immediate BLOCK)
//   2. Vault budget check (on-chain spending rules)
//   3. Hallucination risk (fast-path BLOCK, no retry)
//   4. Verification failure (BLOCK after 2 attempts)
//   5. Degraded mode (LLM unavailable → stricter threshold)
//   6. Risk-based escalation table

require('dotenv').config();
const fs = require('fs');
const { ethers } = require('ethers');

// gokite-aa-sdk does NOT expose contract ABIs (confirmed: only exports GokiteAASDK class
// and utility functions). Use a minimal inline ABI for the one method we need.
const CLIENT_AGENT_VAULT_ABI = [
  "function getSpendingRules() view returns (tuple(uint256 budget, uint256 period, uint256 maxAmountPerTx, uint256 maxTotalAmount)[])"
];

/**
 * Make the final APPROVE / WARN / BLOCK decision.
 *
 * @param {Object} params
 * @param {Object} params.sensorResult       - { level: string, flags: Array }
 * @param {Object} params.verificationResult - { aligned: boolean, hallucinationRisk: boolean, degraded: boolean, issues: string[]|null }
 * @param {string} params.amountWei          - Payment amount in wei
 * @param {string} [params.vaultAddress]     - Agent vault address
 * @returns {{ action: string, code: string, reason?: string, degraded?: boolean, addWarning?: boolean, requiresConfirmation?: boolean }}
 */
async function decide({ sensorResult, verificationResult, amountWei, vaultAddress }) {
  // ── 1. Circuit Breaker ──────────────────────────────────────────────────────
  // File-based kill switch: if the file exists, ALL payments are blocked instantly.
  // Usage: touch ./vigil-circuit-breaker   → blocks everything
  //        rm    ./vigil-circuit-breaker   → resumes normal operation
  const cbPath = process.env.CIRCUIT_BREAKER_PATH || './vigil-circuit-breaker';
  if (fs.existsSync(cbPath)) {
    return {
      action: 'BLOCK',
      code: 'CIRCUIT_BREAKER_ENGAGED',
      reason: 'All payments blocked by circuit breaker'
    };
  }

  // ── 2. Vault Budget Check ───────────────────────────────────────────────────
  // Read spending rules via ABI directly (AA SDK doesn't expose a wrapper).
  if (vaultAddress && vaultAddress !== '0x0000000000000000000000000000000000000000') {
    try {
      const provider = new ethers.JsonRpcProvider(process.env.KITE_RPC_URL);
      const vault    = new ethers.Contract(vaultAddress, CLIENT_AGENT_VAULT_ABI, provider);
      const rules    = await vault.getSpendingRules();

      if (rules.length > 0 && BigInt(amountWei) > rules[0].budget) {
        return {
          action: 'BLOCK',
          code: 'BUDGET_EXCEEDED',
          reason: 'Exceeds vault spending budget'
        };
      }
    } catch (err) {
      console.warn('[Policy] Vault budget check failed, continuing:', err.message);
    }
  }

  // ── 3. Hallucination Risk ───────────────────────────────────────────────────
  // LLM actively lying about safety — higher severity, no retry was attempted.
  if (verificationResult.hallucinationRisk) {
    return {
      action: 'BLOCK',
      code: 'HALLUCINATION_RISK',
      reason: `LLM explanation failed verification: ${verificationResult.issues?.join('; ')}`
    };
  }

  // ── 4. Verification Failure ─────────────────────────────────────────────────
  // LLM failed to align after 2 attempts (but not hallucination)
  if (!verificationResult.aligned) {
    return {
      action: 'BLOCK',
      code: 'VERIFICATION_FAILED',
      reason: `LLM explanation failed verification: ${verificationResult.issues?.join('; ')}`
    };
  }

  // ── 5. Degraded Mode ───────────────────────────────────────────────────────
  // LLM was unavailable → stricter threshold: block anything MEDIUM+
  if (verificationResult.degraded) {
    if (['MEDIUM', 'HIGH', 'CRITICAL'].includes(sensorResult.level)) {
      return {
        action: 'BLOCK',
        code: 'DEGRADED_MODE_STRICT',
        reason: 'LLM unavailable — blocking MEDIUM+ for safety',
        degraded: true
      };
    }
  }

  // ── 6. Risk-Based Escalation ────────────────────────────────────────────────
  const escalation = {
    LOW:      { action: 'APPROVE', code: 'OK' },
    MEDIUM:   { action: 'APPROVE', code: 'OK', addWarning: true },
    HIGH:     { action: 'WARN',    code: 'OK', requiresConfirmation: true },
    CRITICAL: { action: 'BLOCK',   code: 'CRITICAL_RISK',
                reason: `CRITICAL risk: ${sensorResult.flags[0]?.reason ?? 'multiple critical flags'}` }
  };

  return escalation[sensorResult.level] || escalation.LOW;
}

module.exports = { decide };

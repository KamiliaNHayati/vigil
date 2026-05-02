// context-anomaly.js — Session-Aware Context Anomaly Detection
// Rules.md §12: Payment proximity to limits, session TTL, urgency signals
// Requires reading kpass session status or using stored session data
//
// Checks:
//   - Payment > 80% of session max-amount-per-tx → MEDIUM
//   - Session total spent > 80% of max-total-amount → MEDIUM
//   - Session TTL < 5 minutes → MEDIUM
//   - Urgency keywords in URL → MEDIUM (also handled in sensor.js Rule 8)

require('dotenv').config();
const { ethers } = require('ethers');
const { getSessionSpending, db } = require('./store');

// Urgency keywords that signal social engineering / prompt injection
const URGENCY_KEYWORDS = (process.env.URGENCY_KEYWORDS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const ACTION_KEYWORDS = (process.env.ACTION_KEYWORDS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const TRUST_KEYWORDS = (process.env.TRUST_KEYWORDS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

function checkUrgency(resource) {
  const urlLower = resource.toLowerCase();
  const flags = [];
  
  const urgencyMatches = URGENCY_KEYWORDS.filter(k => urlLower.includes(k));
  const actionMatches = ACTION_KEYWORDS.filter(k => urlLower.includes(k));
  const trustMatches = TRUST_KEYWORDS.filter(k => urlLower.includes(k));
  
  if (actionMatches.length > 0) {
    flags.push({ level: 'CRITICAL', reason: `Immediate action commands: ${actionMatches.join(', ')}` });
  }
  if (urgencyMatches.length > 0) {
    flags.push({ level: 'HIGH', reason: `Urgency keywords: ${urgencyMatches.join(', ')}` });
  }
  if (trustMatches.length > 0) {
    flags.push({ level: 'MEDIUM', reason: `Trust-claim keywords: ${trustMatches.join(', ')}` });
  }
  
  return flags;
}

/**
 * Check session context anomalies.
 *
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {string} params.vaultAddress
 * @param {string} params.amountWei
 * @param {string} params.resource
 * @returns {Array<{ level: string, reason: string }>}
 */
async function checkContextAnomaly({ sessionId, vaultAddress, amountWei, resource }) {
  const flags = [];

  // 1. Check urgency/action/trust keywords in URL (independent of kpass status)
  flags.push(...checkUrgency(resource));

  // 2. Try to read session status from kpass CLI
  // NOTE: kpass must be installed and authenticated.
  // For demo: if kpass is unavailable, skip session-specific checks silently.
  try {
    const sessionStatus = await getKpassSessionStatus(sessionId);
    if (!sessionStatus) return flags; // kpass unavailable — skip

    const { maxAmountPerTx, maxTotalAmount, ttlSeconds } = sessionStatus;

    // Check: Payment > 80% of per-tx limit
    if (maxAmountPerTx) {
      const limit80 = (BigInt(maxAmountPerTx) * 80n) / 100n;
      if (BigInt(amountWei) > limit80) {
        flags.push({
          level: 'MEDIUM',
          reason: `Payment exceeds 80% of session per-transaction limit (${ethers.formatUnits(maxAmountPerTx, 18)} tokens)`
        });
      }
    }

    // Check: Session total > 80% of total budget
    if (maxTotalAmount) {
      const sessionSpending = getSessionSpending(sessionId);
      const totalSpentWei = BigInt(sessionSpending.totalWei) + BigInt(amountWei);
      const budget80 = (BigInt(maxTotalAmount) * 80n) / 100n;
      if (totalSpentWei > budget80) {
        flags.push({
          level: 'MEDIUM',
          reason: `Session spending near budget limit (${ethers.formatUnits(maxTotalAmount, 18)} tokens)`
        });
      }
    }

    // Check: Session expiring soon (< 5 minutes)
    if (ttlSeconds !== undefined && ttlSeconds < 300) {
      flags.push({
        level: 'MEDIUM',
        reason: `Session expires in ${ttlSeconds}s — urgency signal`
      });
    }
  } catch (err) {
    console.warn('[ContextAnomaly] kpass session check failed, skipping:', err.message);
  }

  // First-action session anomaly (GLM #7)
  const actionCount = db.prepare(`SELECT COUNT(*) as c FROM actions WHERE session_id = ?`).get(sessionId)?.c ?? 0;
  if (actionCount === 0 && BigInt(amountWei) > ethers.parseUnits('5', 18)) {
    flags.push({
      level: 'MEDIUM',
      reason: 'First action in session exceeds 5 tokens — unusual for initial agent activity'
    });
  }

  return flags;
}

/**
 * Read session status from kpass CLI.
 * Returns null if kpass is unavailable.
 */
async function getKpassSessionStatus(sessionId) {
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync('kpass', [
      'agent:session', 'status',
      '--session-id', sessionId,
      '--output', 'json'
    ], { timeout: 5000 });

    const result = JSON.parse(stdout);
    return {
      maxAmountPerTx: result.maxAmountPerTx,
      maxTotalAmount: result.maxTotalAmount,
      ttlSeconds: result.ttlSeconds,
      spentSoFar: result.spentSoFar
    };
  } catch {
    // kpass not installed, not authenticated, or session not found
    return null;
  }
}

module.exports = { checkContextAnomaly };

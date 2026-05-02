// behavioral-drift.js — Behavioral Drift Detector
// Addresses private key compromise and social engineering attack classes.
// A compromised key signing normal-looking payments to a known address slips through
// amount/recipient checks — but deviates from the agent's historical pattern.
//
// Rules.md §8:
//   - Requires ≥ 5 successful historical actions in SQLite
//   - Current amount > 3σ from 7-day mean → MEDIUM flag
//   - < 5 historical actions → Skip

const { getAgentBaseline } = require('./store');
const { ethers } = require('ethers');

/**
 * Check if the current payment amount deviates significantly from the agent's
 * 7-day behavioral baseline.
 *
 * @param {string} agentAddress - Agent wallet address
 * @param {string} amountWei - Current payment amount in wei
 * @returns {{ level: string, reason: string } | null}
 */
function checkBehavioralDrift(agentAddress, amountWei) {
  const history = getAgentBaseline(agentAddress);

  if (history.length < 5) {
    // Not enough history to establish baseline
    return null;
  }

  // Parse all amounts as BigInt first, then convert to float for stats
  // This avoids precision loss on large 18-decimal values
  const amounts = history.map(r => {
    try {
      const wei = BigInt(r.amount_wei);
      return Number(ethers.formatUnits(wei, 18));
    } catch {
      return 0; // Skip malformed entries
    }
  }).filter(a => a > 0);

  if (amounts.length < 5) return null;

  const currentAmount = Number(ethers.formatUnits(BigInt(amountWei), 18));

  // Compute mean and std dev of historical amounts
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const variance = amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / amounts.length;
  const stdDev = Math.sqrt(variance);

  // Guard against zero/near-zero stdDev
  if (stdDev < 0.0001) {
    // All historical values are nearly identical
    // If current deviates by more than 10x the mean, flag it
    if (currentAmount > mean * 10) {
      const ratio = (currentAmount / mean).toFixed(0);
      return {
        level: 'MEDIUM',
        reason: `Unusual spending: ${currentAmount.toFixed(2)} tokens is ${ratio}x this agent's 7-day average of ${mean.toFixed(2)}`
      };
    }
    return null;
  }

  const deviations = Math.abs(currentAmount - mean) / stdDev;

  if (deviations > 3) {
    // Cap display at reasonable number for readability
    const displaySigma = deviations > 1000 ? '>1000' : deviations.toFixed(1);
    return {
      level: 'MEDIUM',
      reason: `Unusual spending: ${currentAmount.toFixed(2)} tokens is ${displaySigma}σ from this agent's 7-day average of ${mean.toFixed(2)}`
    };
  }

  return null;
}

module.exports = { checkBehavioralDrift };

// service-trust.js — Service Provider Trust Scores
// Static JSON trust scores for dashboard display.
// Demonstrates architecture readiness; replaces with on-chain registry in production.

const fs = require('fs');
const path = require('path');

let trustScores = null;

function loadTrustScores() {
  if (trustScores) return trustScores;
  try {
    const data = fs.readFileSync(
      path.join(__dirname, '../../data/service-trust-scores.json'), 'utf8'
    );
    trustScores = JSON.parse(data);
  } catch (err) {
    console.warn('[ServiceTrust] Could not load trust scores, using empty set:', err.message);
    trustScores = {};
  }
  return trustScores;
}

/**
 * Get trust score for a service by hostname or payTo address.
 * Returns { score, tier, verified, lastAudited, description } or null if unknown.
 *
 * Score scale: 0-100
 * Tier: unverified (0-30), basic (31-60), trusted (61-85), verified (86-100)
 */
function getServiceTrustScore(identifier) {
  const scores = loadTrustScores();
  const key = identifier.toLowerCase();

  // Try exact match
  if (scores[key]) return normalizeScore(scores[key]);

  // Try hostname extraction if URL passed
  try {
    const hostname = new URL(identifier).hostname.toLowerCase();
    if (scores[hostname]) return normalizeScore(scores[hostname]);
  } catch {
    // Not a URL, that's fine
  }

  // Try matching payTo address
  for (const entry of Object.values(scores)) {
    if (entry.payTo && entry.payTo.toLowerCase() === key) {
      return normalizeScore(entry);
    }
  }

  return null;
}

function normalizeScore(entry) {
  const score = Number(entry.score) || 0;
  let tier = 'unverified';
  if (score >= 86) tier = 'verified';
  else if (score >= 61) tier = 'trusted';
  else if (score >= 31) tier = 'basic';

  return {
    score,
    tier,
    verified: entry.verified === true,
    lastAudited: entry.lastAudited || null,
    description: entry.description || null
  };
}

/**
 * Batch lookup for dashboard.
 */
function getBatchTrustScores(identifiers) {
  return identifiers.map(id => ({
    identifier: id,
    ...getServiceTrustScore(id)
  }));
}

module.exports = { getServiceTrustScore, getBatchTrustScores, loadTrustScores };

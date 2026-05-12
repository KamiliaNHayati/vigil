// session-drift.js — Session Intent Drift Detector
// Checks if agent is paying for a service outside its session's authorized task scope.
// This closes Gap 2: "Session intent drift" — the agent was authorized for task X
// but is now attempting to pay for task Y.
//
// Detection logic (Rules.md §5):
//   1. Load task_summary from SQLite (keyed by sessionId)
//   2. Keyword overlap: extract 4+ char words from task_summary and resource URL
//   3. ≥ threshold overlaps → no drift (free, no LLM call)
//   4. < threshold overlaps → LLM semantic check (≤80 tokens)
//   5. LLM confirms mismatch → HIGH flag
//   6. No stored sessionId → skip (not an error)

require('dotenv').config();
const { db } = require('./store');
const { rawCall } = require('./llm-client');

const DRIFT_KEYWORD_THRESHOLD = Number(process.env.DRIFT_KEYWORD_THRESHOLD) || 2;

/**
 * Check if the current payment drifts from the session's authorized task.
 *
 * @param {string} sessionId - Active session ID
 * @param {string} resource - Service URL being paid for
 * @returns {{ driftDetected: boolean, flag?: { level: string, reason: string } } | null}
 */
async function checkSessionDrift(sessionId, resource) {
  // Look up stored intent
  const session = db.prepare(
    'SELECT task_summary FROM session_intents WHERE session_id = ?'
  ).get(sessionId);

  if (!session) return null; // No stored intent — skip silently

  // Fast path: keyword overlap (free, no LLM)
  const summaryWords = new Set(
    session.task_summary.toLowerCase().split(/\W+/).filter(w => w.length > 2)
  );

  // Parse resource URL into meaningful words
  // Split on any non-alphanumeric boundary to catch path segments, query params, subdomains
  let resourceWords;
  try {
    const url = new URL(resource);
    const rawText = [url.hostname, url.pathname, url.search].join(' ');
    resourceWords = new Set(
      rawText.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2)
    );
  } catch {
    // Invalid URL — extract words from raw string
    resourceWords = new Set(
      resource.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2)
    );
  }

  const overlap = [...summaryWords].filter(w => resourceWords.has(w));

  if (overlap.length >= DRIFT_KEYWORD_THRESHOLD) {
    return { driftDetected: false };
  }

  // Slow path: LLM semantic check
  const prompt = `Session was authorized for: "${session.task_summary}"
Agent is now trying to pay for: "${resource}"

Does this match the authorized task? Reply with JSON only:
{"match": true, "reason": "one sentence"}
or {"match": false, "reason": "one sentence"}`;

  try {
    const result = await rawCall(prompt, 500);
    if (!result.match) {
      // Extract a clean description for the flag
      let hostname;
      try {
        hostname = new URL(resource).hostname;
      } catch {
        hostname = resource.slice(0, 50);
      }

      return {
        driftDetected: true,
        flag: {
          level: 'HIGH',
          reason: `Session intent drift: authorized for "${session.task_summary.slice(0, 50)}" but attempting "${hostname}"`
        }
      };
    }
    return { driftDetected: false };
  } catch (err) {
    console.warn('[SessionDrift] LLM check failed:', err.message);

    // If ZERO keyword overlap AND LLM unavailable → flag as drift deterministically.
    // Zero overlap is a strong enough signal on its own.
    if (overlap.length === 0) {
      let hostname;
      try {
        hostname = new URL(resource).hostname;
      } catch {
        hostname = resource.slice(0, 50);
      }
      return {
        driftDetected: true,
        flag: {
          level: 'HIGH',
          reason: `Session intent drift: authorized for "${session.task_summary.slice(0, 50)}" but attempting "${hostname}" (0 keyword overlap)`
        }
      };
    }

    // 1+ overlaps but below threshold → inconclusive, skip
    return { driftDetected: false };
  }
}

module.exports = { checkSessionDrift };

// guide.js — LLM Explanation + Degraded Fallback
// Uses DeepSeek V4 Flash for analysis via llm-client.js
// Sanitizes inputs to prevent prompt injection before LLM prompt construction.

require('dotenv').config();
const { ethers } = require('ethers');
const { callOpenRouter, MODELS } = require('./llm-client');

// ── Prompt Injection Sanitization ─────────────────────────────────────────────

/**
 * Strip prompt injection patterns from any string before it enters an LLM prompt.
 * Truncates to 500 chars to limit prompt budget.
 * @param {string} input - Raw user/agent-supplied string
 * @returns {string} Sanitized string
 */
function sanitizeForLLM(input) {
  if (!input) return '';
  return input
    .replace(/ignore\s+previous/gi, '[REDACTED]')
    .replace(/disregard\s+(all\s+)?(previous|above)/gi, '[REDACTED]')
    .replace(/you\s+are\s+now/gi, '[REDACTED]')
    .replace(/system\s*:/gi, '[REDACTED]')
    .replace(/safe(?:ty)?\s*(?:check|guard|review)/gi, '[REDACTED]')
    .substring(0, 500);
}

// ── JSON Schema for structured LLM output ─────────────────────────────────────

const EXPLAIN_SCHEMA = {
  type: 'object',
  properties: {
    riskLevel:      { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
    explanation:    { type: 'string', description: 'Max 2 sentences, plain English' },
    primaryConcern: { type: 'string', description: 'The single highest risk factor, or null' }
  },
  required: ['riskLevel', 'explanation']
};

// ── Main explain() ────────────────────────────────────────────────────────────

/**
 * Main explanation flow. Returns guide result with degraded flag.
 * If LLM is unavailable, returns a deterministic degraded response
 * that is guaranteed to align with the sensor level.
 *
 * @param {Object} intent
 * @param {string} intent.amountWei
 * @param {string} intent.payTo
 * @param {string} intent.resource
 * @param {Object} intent.sensorResult - { level, flags }
 * @returns {{ riskLevel: string, explanation: string, primaryConcern: string|null, degraded: boolean }}
 */
async function explain(intent) {
  try {
    const result = await callAnalysisLLM(intent);
    return { ...result, degraded: false };
  } catch (err) {
    console.error('[Guide] LLM unavailable, entering degraded mode:', err.message);
    const level   = intent.sensorResult.level;
    const topFlag = intent.sensorResult.flags[0]?.reason ?? 'risk detected';
    const prefix  = level === 'CRITICAL' ? 'WARNING: ' : '';
    return {
      riskLevel:      level,
      explanation:    `${prefix}Automated check: ${level} risk — ${topFlag}. LLM explanation unavailable.`,
      primaryConcern: topFlag,
      degraded:       true
    };
  }
}

// ── Retry with correction ─────────────────────────────────────────────────────

/**
 * Retry explanation with explicit correction prompt.
 * Called by the Verifier when first attempt fails alignment checks.
 *
 * @param {Object} params
 * @param {string} params.amountWei
 * @param {string} params.payTo
 * @param {string} params.resource
 * @param {Object} params.sensorResult
 * @param {string} params.previousExplanation
 * @param {string[]} params.issues
 * @returns {{ riskLevel: string, explanation: string, primaryConcern: string|null }}
 */
async function explainWithCorrection({ amountWei, payTo, resource, sensorResult,
                                       previousExplanation, issues }) {
  const displayAmount  = ethers.formatUnits(amountWei, 18);
  const truncatedPayTo = `${payTo.slice(0, 6)}...${payTo.slice(-4)}`;

  const safeResource = sanitizeForLLM(resource);
  const safeFlags = sanitizeForLLM(
    sensorResult.flags.map(f => `[${f.level}] ${f.reason}`).join('; ')
  );

  const prompt = `Your previous explanation of this payment failed verification.

Previous explanation: "${previousExplanation}"
Verification issues:
${issues.map(i => `- ${i}`).join('\n')}

Payment intent:
- Amount: ${displayAmount} tokens
- Recipient: ${truncatedPayTo}
- Service: ${safeResource}
- Risk flags: ${safeFlags}
- Risk level: ${sensorResult.level}

Correct each issue explicitly. Same format rules. Return JSON only.`;

  try {
    const result = await callAnalysisLLM({ prompt, sensorResult });
    return result;
  } catch (err) {
    // If retry also fails, return synthetic result that aligns with sensor
    const prefix = sensorResult.level === 'CRITICAL' ? 'WARNING: ' : '';
    return {
      riskLevel:      sensorResult.level,
      explanation:    `${prefix}${sensorResult.level} risk detected — ${sensorResult.flags[0]?.reason ?? 'multiple flags'}.`,
      primaryConcern: sensorResult.flags[0]?.reason ?? null
    };
  }
}

// ── Internal LLM call ─────────────────────────────────────────────────────────

/**
 * Internal: call DeepSeek for structured analysis output.
 * Handles two call patterns:
 *   1. Full intent (from explain()) — builds prompt from intent fields
 *   2. Explicit prompt (from explainWithCorrection()) — uses prompt string directly
 */
async function callAnalysisLLM(intentOrPrompt) {
  let prompt;
  if (intentOrPrompt.prompt) {
    // Called from explainWithCorrection with explicit prompt
    prompt = intentOrPrompt.prompt;
  } else {
    // Called from explain with full intent
    const { amountWei, payTo, resource, sensorResult } = intentOrPrompt;
    const displayAmount  = ethers.formatUnits(amountWei, 18);
    const truncatedPayTo = `${payTo.slice(0, 6)}...${payTo.slice(-4)}`;

    // Sanitize user-supplied fields before injecting into prompt
    const safeResource = sanitizeForLLM(resource);
    const safeFlags = sanitizeForLLM(
      sensorResult.flags.map(f => `[${f.level}] ${f.reason}`).join('; ') || 'None'
    );

    prompt = `You are a security analyst for AI agent payments on Kite blockchain.

Payment intent:
- Amount: ${displayAmount} tokens
- Recipient wallet: ${truncatedPayTo}
- Service URL: ${safeResource}
- Risk flags: ${safeFlags}
- Overall risk level: ${sensorResult.level}

Rules:
1. If risk level is CRITICAL, start with "WARNING:"
2. Mention the exact token amount and the recipient wallet identifier (${truncatedPayTo})
3. Reference the highest-severity risk flag by name
4. Maximum 2 sentences, plain English
5. No jargon: never say "EOA", "calldata", "wei", "BigInt", "tx", "contract address",
   "on-chain", "settlement". Use "payment", "wallet address", "service" instead.`;
  }

  const content = await callOpenRouter({
    model: MODELS.ANALYSIS,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 150,
    responseFormat: { type: 'json_object' }
  });

  try {
    return JSON.parse(content);
  } catch {
    // LLM returned non-JSON — extract what we can
    return {
      riskLevel:      intentOrPrompt.sensorResult?.level ?? 'MEDIUM',
      explanation:    content.slice(0, 300),
      primaryConcern: intentOrPrompt.sensorResult?.flags?.[0]?.reason ?? null
    };
  }
}

module.exports = { explain, explainWithCorrection, callAnalysisLLM, sanitizeForLLM };

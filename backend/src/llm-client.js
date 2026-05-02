// llm-client.js — Shared LLM utilities, zero business logic
// All OpenRouter API calls go through this module.
// Dependency graph: this is a leaf node — no business-logic imports.
//
// Models:
//   ANALYSIS:     DeepSeek V4 Flash — cheap, strong reasoning ($0.14/M in, $0.28/M out)
//   THREAT_INTEL: Grok 4.1 Fast — live X/Twitter data access ($0.20/M in, $0.50/M out)

require('dotenv').config();

const MODELS = {
  ANALYSIS:     'deepseek/deepseek-v4-flash',
  THREAT_INTEL: 'x-ai/grok-4.1-fast',
};

// Timeout for OpenRouter calls (ms)
const LLM_TIMEOUT = Number(process.env.LLM_TIMEOUT) || 10000;

/**
 * Core OpenRouter API call. All LLM traffic goes through here.
 * @param {Object} params
 * @param {string} params.model - OpenRouter model identifier
 * @param {Array} params.messages - Chat messages array
 * @param {number} params.maxTokens - Max tokens to generate
 * @param {Object} [params.responseFormat] - Response format specification
 * @returns {string} Raw content string from LLM
 * @throws {Error} On HTTP error, timeout, or empty response
 */
async function callOpenRouter({ model, messages, maxTokens, responseFormat }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://vigil.gokite.ai',
        'X-Title': 'Vigil AI Agent Security'
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        response_format: responseFormat
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      throw new Error(`OpenRouter HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`Empty OpenRouter response: ${JSON.stringify(data)}`);
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Lightweight JSON LLM call used by session-drift.js and other non-guide modules.
 * Uses DeepSeek (cheaper) — Grok not needed here.
 * @param {string} prompt - User prompt
 * @param {number} [maxTokens=80] - Max tokens
 * @returns {Object} Parsed JSON response
 */
async function rawCall(prompt, maxTokens = 80) {
  const content = await callOpenRouter({
    model: MODELS.ANALYSIS,
    messages: [{ role: 'user', content: prompt }],
    maxTokens,
    responseFormat: { type: 'json_object' }
  });
  return JSON.parse(content);
}

/**
 * Real-time X/Twitter threat intel — Grok 4.1 Fast only (has live X access).
 * Called from sensor.js Rule 10 BEFORE explain() — result feeds into sensorResult.flags.
 * Non-blocking: any failure returns threatsFound:false and sensor continues.
 * @param {Object} params
 * @param {string} params.payTo - Recipient address
 * @param {string} params.resource - Service URL
 * @returns {Object} { threatsFound: boolean, summary: string|null }
 */
async function checkThreatIntel({ payTo, resource }) {
  const truncatedPayTo = `${payTo.slice(0, 6)}...${payTo.slice(-4)}`;

  let hostname;
  try {
    hostname = new URL(resource).hostname;
  } catch {
    hostname = resource;
  }

  const prompt = `Search X/Twitter for posts in the last 48 hours about security incidents, exploits, scams, or warnings related to:
- Wallet address: ${truncatedPayTo}
- Domain: ${hostname}

Return JSON only: {"threatsFound": true, "summary": "one sentence"} or {"threatsFound": false, "summary": null}`;

  try {
    const content = await callOpenRouter({
      model: MODELS.THREAT_INTEL,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 100,
      responseFormat: { type: 'json_object' }
    });
    return JSON.parse(content);
  } catch (err) {
    console.warn('[ThreatIntel] Grok unavailable, skipping:', err.message);
    return { threatsFound: false, summary: null };
  }
}

module.exports = { callOpenRouter, rawCall, checkThreatIntel, MODELS };

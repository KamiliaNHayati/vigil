// llm-client.js — Shared LLM utilities, zero business logic
// All OpenRouter API calls go through this module.
// Dependency graph: this is a leaf node — no business-logic imports.
//
// Models:
//   ANALYSIS:     DeepSeek V4 Flash — cheap, strong reasoning ($0.14/M in, $0.28/M out)
//   THREAT_INTEL: Grok 4.1 Fast — live X/Twitter data access ($0.20/M in, $0.50/M out)

// llm-client.js — Shared LLM utilities (revised: single-model architecture)
require('dotenv').config();

const MODELS = {
  ANALYSIS:     'deepseek/deepseek-v4-flash',
  COMPOSER:     'deepseek/deepseek-v4-flash',  // Same model, separate logical slot
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
async function callOpenRouter({ model, messages, maxTokens, responseFormat, tools }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT);
  const apiKey = process.env.OPENROUTER_KEY;
  if (!apiKey) throw new Error('OPENROUTER_KEY not set');

  try {
    const body = { model, messages, max_tokens: maxTokens, response_format: responseFormat };
    if (tools) body.tools = tools;

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://vigil.gokite.ai',
        'X-Title': 'Vigil AI Agent Security'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      throw new Error(`OpenRouter HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error(`Empty OpenRouter response: ${JSON.stringify(data)}`);
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
async function rawCall(prompt, maxTokens = 500) {
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
  try { hostname = new URL(resource).hostname; } catch { hostname = resource; }

  const prompt = `Search the web for security incidents, exploits, scams, or warnings related to:
- Wallet address: ${truncatedPayTo}
- Domain: ${hostname}
Look for posts and reports from the last 48 hours.

Return JSON only: {"threatsFound": true, "summary": "one sentence"} or {"threatsFound": false, "summary": null}`;

  try {
    const content = await callOpenRouter({
      model: MODELS.ANALYSIS,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 100,
      responseFormat: { type: 'json_object' },
      tools: [
        { type: 'openrouter:web_search', parameters: { max_results: 5 } },
        { type: 'openrouter:web_fetch',  parameters: { max_content_tokens: 50000 } }
      ]
    });
    return JSON.parse(content);
  } catch (err) {
    console.warn('[ThreatIntel] Web search failed, skipping:', err.message);
    return { threatsFound: false, summary: null };
  }
}

/**
 * Rule Composer — triggered via cron or REST endpoint.
 * Analyzes recent blocks and external threat feeds to propose new sensor rules.
 * Proposed rules enter shadow mode in Supabase — never affect live payments
 * until validated and promoted.
 */
async function composeRule() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 1. Gather recent block patterns
  const { data: recentBlocks } = await supabase
    .from('evaluations')
    .select('flags, agent_address, resource')
    .eq('action', 'BLOCK')
    .gte('timestamp', Date.now() - 86_400_000);

  // 2. Gather threat intel summaries
  const { data: threatIntel } = await supabase
    .from('evaluations')
    .select('threat_intel')
    .not('threat_intel', 'is', null)
    .gte('timestamp', Date.now() - 86_400_000);

  // 3. Build the analysis prompt
  const prompt = `You are a security rule engineer for Vigil, an AI agent payment security harness.

Recent blocked payments: ${JSON.stringify(recentBlocks?.slice(0, 10) || [])}
Recent threat intel summaries: ${JSON.stringify(threatIntel?.slice(0, 20) || [])}

Use web search to find recent DeFi exploits, x402 vulnerabilities, or new attack patterns from the last 7 days.

Identify ONE new sensor rule that would catch an attack pattern NOT covered by these existing rules:
- Amount thresholds (10/100/1000 tokens)
- ksearch catalog verification
- Rate limiting (hourly)
- Contract risk (exploit DB, unverified source)
- LayerZero cross-chain risk
- Session intent drift
- Behavioral drift (3σ)
- Urgency keywords (150+)
- Threat intel (web search)
- Self-payment detection
- IP geolocation
- Domain reputation
- TLS certificate validation
- Oracle integrity

Return JSON only:
{
  "proposed": true/false,
  "ruleName": "short name",
  "category": "Amount & Budget | Recipient Trust | Contract Safety | Cross-Chain | Agent Behaviour | Phishing & Social Eng. | Data & Oracle Integrity | Threat Intel",
  "description": "what the rule checks",
  "severity": "LOW | MEDIUM | HIGH | CRITICAL",
  "flagReason": "exact reason string for the flag",
  "testCases": [
    { "input": { ... }, "expectedFlag": true/false }
  ],
  "rationale": "why this rule is needed, citing specific attack patterns"
}`;

  try {
    const content = await callOpenRouter({
      model: MODELS.COMPOSER,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 300,
      responseFormat: { type: 'json_object' },
      tools: [
        { type: 'openrouter:web_search', parameters: { max_results: 5 } },
        { type: 'openrouter:web_fetch',  parameters: { max_content_tokens: 50000 } }
      ]
    });

    const proposal = JSON.parse(content);

    if (proposal.proposed) {
      await supabase.from('proposed_rules').insert({
        rule_name: proposal.ruleName,
        category: proposal.category,
        description: proposal.description,
        severity: proposal.severity,
        flag_reason: proposal.flagReason,
        test_cases: proposal.testCases,
        rationale: proposal.rationale,
        status: 'shadow',
        proposed_at: Date.now()
      });
      console.log('[RuleComposer] New rule proposed:', proposal.ruleName);
    }

    return proposal;
  } catch (err) {
    console.warn('[RuleComposer] Failed:', err.message);
    return { proposed: false, error: err.message };
  }
}

module.exports = { callOpenRouter, rawCall, checkThreatIntel, composeRule, MODELS };
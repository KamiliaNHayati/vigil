// mcp-server.js — MCP Tool Server + Transport Router
// MCP SDK v1.29: uses server.tool() with zod schema (also supports registerTool())
// Transport selected by MCP_TRANSPORT env var: stdio | rest
//
// stdio: Claude Code, Cursor, terminal, CI scripts (full MCP protocol)
// rest:  CLI tool, dashboard, web apps (plain JSON over HTTP)

require('dotenv').config();
const { z } = require('zod');

const express = require('express');
const { storeEvaluation, getRecentEvaluations, storeAction, db } = require('./store');
const { getServiceTrustScore, getBatchTrustScores } = require('./service-trust');
const sensor   = require('./sensor');
const guide    = require('./guide');
const verifier = require('./verifier');
const policy   = require('./policy');

// ── Handler Functions ────────────────────────────────────────────────────────
// Full pipeline: Sensor → Guide → Verifier → Policy (Day 4)

async function handleEvaluatePayment(intent) {
  // ── Step 1: Sensor (deterministic risk checks) ─────────────────────────────
  const sensorResult = await sensor.check(intent);

  // ── Step 2: Guide (LLM explanation + degraded fallback) ────────────────────
  const guideResult = await guide.explain({
    amountWei: intent.amountWei,
    payTo: intent.payTo,
    resource: intent.resource,
    sensorResult
  });

  // ── Step 3: Verifier (alignment check + retry) ─────────────────────────────
  const verificationResult = await verifier.verify(sensorResult, guideResult, {
    amountWei: intent.amountWei,
    payTo: intent.payTo,
    resource: intent.resource
  });

  // Carry degraded flag from guide through to verification result
  verificationResult.degraded = guideResult.degraded;

  // Use the corrected guide if verifier retried
  const finalGuide = verificationResult.guide || guideResult;

  // ── Step 4: Policy (final decision) ────────────────────────────────────────
  const decision = await policy.decide({
    sensorResult,
    verificationResult,
    amountWei: intent.amountWei,
    vaultAddress: intent.vaultAddress
  });

  const result = {
    action: decision.action,
    code: decision.code,
    sensorLevel: sensorResult.level,
    verifierAligned: verificationResult.aligned,
    verifierAttempts: verificationResult.attempts,
    degraded: guideResult.degraded,
    explanation: finalGuide.explanation,
    primaryConcern: finalGuide.primaryConcern ?? sensorResult.flags[0]?.reason ?? null,
    flags: sensorResult.flags,
    trustTier: sensorResult.trustTier,
    oracleWarning: null
  };

  // Store for dashboard
  storeEvaluation({
    agentAddress: intent.agentAddress,
    payTo: intent.payTo,
    amountWei: intent.amountWei,
    resource: intent.resource,
    sensorLevel: result.sensorLevel,
    action: result.action,
    code: result.code,
    flags: result.flags,
    explanation: result.explanation,
    verifierAligned: result.verifierAligned,
    verifierAttempts: result.verifierAttempts,
    degraded: result.degraded,
    oracleWarning: result.oracleWarning
  });

  return result;
}

async function handleRecordOutcome({ agentAddress, success, riskLevel, traceData,
                                     vaultAddress, sessionId, payTo, amountWei, resource }) {
  // Store full action record in SQLite (includes fields for behavioral baseline)
  storeAction({
    agentAddress,
    sessionId,
    payTo,
    amountWei,
    resource,
    riskLevel,
    success,
    vaultAddress
  });

  // Compute trace hash (on-chain commitment — proves Vigil evaluated this payment)
  const { ethers } = require('ethers');
  const traceHash = ethers.keccak256(ethers.toUtf8Bytes(traceData ?? '{}'));

  // Oracle sanity check — post-execution data quality validation
  const oracleWarning = checkOracleSanity(traceData);

  return {
    recorded: true,
    traceHash,
    oracleWarning
  };
}

async function handleGetReputation({ agentAddress }) {
  // Read from SQLite actions table (on-chain AgentRegistry wired on Day 7)
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
    FROM actions WHERE agent_address = ?
  `).get(agentAddress);

  const total = stats?.total ?? 0;
  const successful = stats?.successful ?? 0;
  const failed = stats?.failed ?? 0;

  // Compute trust tier from local data (mirrors AgentRegistry logic)
  // Tier 0: <5 actions, Tier 1: 5+ actions, Tier 2: 5+ & >80% success, Tier 3: 20+ & >90% success
  let trustTier = 0;
  const successRate = total > 0 ? successful / total : 0;
  if (total >= 20 && successRate > 0.9) trustTier = 3;
  else if (total >= 5 && successRate > 0.8) trustTier = 2;
  else if (total >= 5) trustTier = 1;

  const reputationScore = Math.min(10000, Math.floor(successRate * 10000));

  return {
    agentAddress,
    trustTier,
    reputationScore,
    totalActions: total,
    successfulActions: successful,
    failedActions: failed,
    source: total > 0 ? 'sqlite' : 'no-history'
  };
}

// ── Oracle Sanity Hook ───────────────────────────────────────────────────────

function checkOracleSanity(traceDataStr) {
  try {
    const data = JSON.parse(traceDataStr ?? '{}');

    if (data.apy !== undefined && Number(data.apy) > 50) {
      return `APY of ${data.apy}% exceeds 50% sanity threshold — verify data source integrity`;
    }
    if (data.price !== undefined && data.priceBaseline !== undefined) {
      const deviation = Math.abs(data.price - data.priceBaseline) / data.priceBaseline;
      if (deviation > 0.2) {
        return `Price deviates ${(deviation * 100).toFixed(1)}% from baseline — possible oracle manipulation`;
      }
    }
    if (data.responseBytes !== undefined && data.responseBytes < 50) {
      return `Paid service returned only ${data.responseBytes} bytes — possible empty response`;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Input Validation ─────────────────────────────────────────────────────────

function validateInput({ payTo, amountWei, resource, agentAddress }) {
  const { ethers } = require('ethers');
  if (!ethers.isAddress(payTo)) throw new Error('Invalid payTo address');
  if (!/^\d+$/.test(amountWei)) throw new Error('Invalid amountWei format');
  if (BigInt(amountWei) === 0n) throw new Error('Zero-value payment');
  try {
    const url = new URL(resource);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
      throw new Error('Resource must be HTTPS (localhost exempted for development)');
    }
  } catch (e) {
    if (e.message.includes('Resource must be')) throw e;
    throw new Error(`Invalid resource URL: ${resource}`);
  }
  if (!ethers.isAddress(agentAddress)) throw new Error('Invalid agentAddress');
}

// ── Transport Router ─────────────────────────────────────────────────────────

const transport = process.env.MCP_TRANSPORT ?? 'stdio';

if (transport === 'rest') {
  const app = express();
  app.use(express.json());

  // CORS for dashboard
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Evaluate payment
  app.post('/api/evaluate', async (req, res) => {
    try {
      validateInput(req.body);
      const result = await handleEvaluatePayment(req.body);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Record outcome
  app.post('/api/record', async (req, res) => {
    try {
      const result = await handleRecordOutcome(req.body);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Get reputation
  app.get('/api/reputation/:address', async (req, res) => {
    try {
      const result = await handleGetReputation({ agentAddress: req.params.address });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Dashboard feed
  app.get('/api/evaluations', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const evaluations = getRecentEvaluations(limit);
      res.json({ evaluations });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Service trust scores
  app.get('/api/trust/:identifier', (req, res) => {
    const score = getServiceTrustScore(decodeURIComponent(req.params.identifier));
    res.json(score ?? { score: null, tier: 'unknown', verified: false });
  });

  app.post('/api/trust/batch', (req, res) => {
    const { identifiers } = req.body;
    if (!Array.isArray(identifiers)) {
      return res.status(400).json({ error: 'identifiers must be an array' });
    }
    res.json(getBatchTrustScores(identifiers));
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      transport: 'rest',
      timestamp: Date.now(),
      version: '1.0.0'
    });
  });

  const PORT = process.env.PORT ?? 3003;
  app.listen(PORT, () => {
    console.log(`[Vigil] REST server listening on http://localhost:${PORT}`);
    console.log(`[Vigil] Endpoints:`);
    console.log(`  POST /api/evaluate     — Evaluate payment intent`);
    console.log(`  POST /api/record       — Record payment outcome`);
    console.log(`  GET  /api/reputation/:addr — Agent reputation`);
    console.log(`  GET  /api/evaluations  — Dashboard feed`);
    console.log(`  GET  /api/health       — Health check`);
  });

} else if (transport === 'stdio') {
  // MCP stdio transport — for Claude Code, Cursor, terminal, CI scripts
  const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
  const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

  const mcpServer = new McpServer({
    name: 'vigil',
    version: '1.0.0'
  });

  // ── Tool: evaluate_payment ──────────────────────────────────────────────
  mcpServer.tool(
    'evaluate_payment',
    'Evaluate an x402 payment intent for risk before executing. Call this before kpass agent:session execute.',
    {
      payTo:        z.string().describe('Recipient wallet address from the 402 response accepts[].payTo'),
      amountWei:    z.string().describe('Payment amount in wei (18 decimals). 1 token = 1000000000000000000'),
      resource:     z.string().describe('Service URL being paid for'),
      agentAddress: z.string().describe('Agent wallet address for reputation lookup'),
      sessionId:    z.string().optional().describe('Active kpass session ID for context'),
      vaultAddress: z.string().optional().describe('Agent vault address for budget check')
    },
    async (params) => {
      try {
        validateInput(params);
        const result = await handleEvaluatePayment(params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true
        };
      }
    }
  );

  // ── Tool: record_outcome ────────────────────────────────────────────────
  mcpServer.tool(
    'record_outcome',
    'Record the outcome of a paid request for reputation tracking. Call after kpass agent:session execute.',
    {
      agentAddress: z.string().describe('Agent wallet address'),
      success:      z.boolean().describe('Whether the paid request succeeded'),
      riskLevel:    z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).describe('Risk level from evaluate_payment'),
      traceData:    z.string().optional().describe('JSON string of the full risk report'),
      vaultAddress: z.string().optional().describe('Agent vault address for audit trail'),
      sessionId:    z.string().optional().describe('Session ID'),
      payTo:        z.string().optional().describe('Recipient address'),
      amountWei:    z.string().optional().describe('Payment amount in wei'),
      resource:     z.string().optional().describe('Service URL')
    },
    async (params) => {
      try {
        const result = await handleRecordOutcome(params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true
        };
      }
    }
  );

  // ── Tool: get_agent_reputation ───────────────────────────────────────────
  mcpServer.tool(
    'get_agent_reputation',
    'Get trust tier and reputation score for an agent.',
    {
      agentAddress: z.string().describe('Agent wallet address')
    },
    async (params) => {
      try {
        const result = await handleGetReputation(params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true
        };
      }
    }
  );

  // Connect to stdio transport
  const stdioTransport = new StdioServerTransport();
  mcpServer.connect(stdioTransport).then(() => {
    console.error('[Vigil] MCP stdio server connected — 3 tools registered');
    console.error('[Vigil] Tools: evaluate_payment, record_outcome, get_agent_reputation');
  }).catch(err => {
    console.error('[Vigil] MCP stdio connection failed:', err.message);
    process.exit(1);
  });

} else {
  console.error(`[Vigil] Unknown transport: ${transport}. Use: stdio | rest`);
  process.exit(1);
}

module.exports = {
  handleEvaluatePayment,
  handleRecordOutcome,
  handleGetReputation,
  checkOracleSanity,
  validateInput
};

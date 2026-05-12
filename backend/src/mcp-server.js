// mcp-server.js — MCP Tool Server + Transport Router
// MCP SDK v1.29: uses server.tool() with zod schema (also supports registerTool())
// Transport selected by MCP_TRANSPORT env var: stdio | rest
//
// stdio: Claude Code, Cursor, terminal, CI scripts (full MCP protocol)
// rest:  CLI tool, dashboard, web apps (plain JSON over HTTP)

require('dotenv').config();
const { z } = require('zod');
const { execSync } = require('child_process');

const express = require('express');
const { ethers } = require('ethers');
const { storeEvaluation, getRecentEvaluations, storeAction, db } = require('./store');
const { getServiceTrustScore, getBatchTrustScores } = require('./service-trust');
const sensor   = require('./sensor');
const guide    = require('./guide');
const verifier = require('./verifier');
const policy   = require('./policy');
const { deployCapsule } = require('./capsule');

// ── Handler Functions ────────────────────────────────────────────────────────
// Full pipeline: Sensor → Guide → Verifier → Policy (Day 4)

function enforceHTTPS(resource) {
  const url = new URL(resource);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('Only HTTPS URLs allowed');
  }
}

async function handleEvaluatePayment(intent) {
  const startTime = Date.now();

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

  // ── Build dynamic sensorBreakdown from moduleResults ───────────────────────
  const breakdownMap = {};
  for (const mr of (sensorResult.moduleResults || [])) {
    if (!breakdownMap[mr.category]) breakdownMap[mr.category] = [];
    breakdownMap[mr.category].push({ name: mr.module, status: mr.status, level: mr.level });
  }
  const sensorBreakdown = {
    checks: Object.entries(breakdownMap).map(([category, modules]) => ({ category, modules })),
    totalChecks: (sensorResult.moduleResults || []).length,
    flaggedChecks: (sensorResult.moduleResults || []).filter(m => m.status === 'flagged').length
  };

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
    threatIntel: sensorResult.threatIntel ?? null,
    oracleWarning: null,
    pipelineElapsedMs: Date.now() - startTime,
    sensorBreakdown
  };

  // After policy approves, deploy capsule
  if (result.action === 'APPROVE') {
    if (process.env.VAULT_OWNER_PRIVATE_KEY && intent.vaultAddress) {
      const provider = new ethers.JsonRpcProvider(process.env.KITE_RPC_URL);
      const signer = new ethers.Wallet(process.env.VAULT_OWNER_PRIVATE_KEY, provider);
      const capsule = await deployCapsule({
        signer,
        vaultAddress: intent.vaultAddress,
        agentId: intent.agentAddress,
        payTo: intent.payTo,
        amountWei: intent.amountWei
      });
      result.capsule = {
        privateKey: capsule.capsulePrivateKey,
        address: capsule.capsuleAddress,
        expiresAt: capsule.expiresAt
      };
    }
  }

  // Store for dashboard (SQLite)
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

  // Dual-write to Supabase (fire-and-forget, only if configured)
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { storeEvaluationToSupabase } = require('./store-supabase');
      // Compute traceHash for on-chain link (same hash that gets written to AgentRegistry)
      const traceHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({
        action: result.action, sensorLevel: result.sensorLevel, flags: result.flags
      })));
      storeEvaluationToSupabase({
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
        oracleWarning: result.oracleWarning,
        // Hybrid fields
        traceHash,
        pipelineElapsedMs: result.pipelineElapsedMs,
        sensorBreakdown: result.sensorBreakdown,
        threatIntel: result.threatIntel,
        trustTier: result.trustTier,
        capsuleAddress: result.capsule?.address ?? null
      }).catch(err => console.warn('[Supabase] Write failed:', err.message));
    } catch { /* supabase module not available */ }
  }

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

  // ── On-chain write to AgentRegistry ───────────────────────────────────────
  // Fire-and-forget: don't block the response on tx confirmation.
  // If REPORTER_PRIVATE_KEY is missing or RPC fails, log and continue.
  let txHash = null;
  const registryAddr = process.env.AGENT_REGISTRY_ADDRESS;
  const reporterKey  = process.env.REPORTER_PRIVATE_KEY;
  const rpcUrl       = process.env.KITE_RPC_URL;

  if (registryAddr && reporterKey && reporterKey.trim().length > 10 && rpcUrl) {
    const RISK_MAP = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
    const riskUint8 = RISK_MAP[riskLevel] ?? 0;

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet   = new ethers.Wallet(reporterKey.trim(), provider);
      const ABI = ['function recordAction(address agent, bool success, bytes32 traceHash, uint8 riskLevel) external'];
      const registry = new ethers.Contract(registryAddr, ABI, wallet);

      // Fire tx, log confirmation in background (don't await in hot path)
      registry.recordAction(agentAddress, success, traceHash, riskUint8)
        .then(tx => {
          txHash = tx.hash;
          console.log(`[Registry] recordAction tx sent: ${tx.hash}`);
          return tx.wait();
        })
        .then(receipt => {
          console.log(`[Registry] recordAction confirmed: block ${receipt.blockNumber}`);
        })
        .catch(err => {
          console.warn('[Registry] recordAction tx failed:', err.message);
        });
    } catch (err) {
      console.warn('[Registry] On-chain write setup failed:', err.message);
    }
  }

  return {
    recorded: true,
    traceHash,
    txHash,
    oracleWarning
  };
}

async function handleGetReputation({ agentAddress }) {
  const { ethers } = require('ethers');
  const registryAddr = process.env.AGENT_REGISTRY_ADDRESS;
  const rpcUrl       = process.env.KITE_RPC_URL;

  // ── Try on-chain AgentRegistry first ──────────────────────────────────────
  if (registryAddr && rpcUrl) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const ABI = [
        'function getTrustTier(address) view returns (uint8)',
        'function getProfile(address) view returns (uint256 score, uint256 total, uint256 successful, uint256 failed)'
      ];
      const registry = new ethers.Contract(registryAddr, ABI, provider);

      const [trustTier, profile] = await Promise.all([
        registry.getTrustTier(agentAddress),
        registry.getProfile(agentAddress)
      ]);

      return {
        agentAddress,
        trustTier: Number(trustTier),
        reputationScore: Number(profile.score),
        totalActions: Number(profile.total),
        successfulActions: Number(profile.successful),
        failedActions: Number(profile.failed),
        source: 'on-chain'
      };
    } catch (err) {
      console.warn('[Reputation] On-chain read failed, falling back to SQLite:', err.message);
    }
  }

  // ── Fallback: SQLite ──────────────────────────────────────────────────────
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
  // Tier 0: <5 actions, Tier 1: 5+ actions, Tier 2: >6000 score, Tier 3: >9000 score
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
  enforceHTTPS(resource);

  const { ethers } = require('ethers');
  // Use getAddress() — normalizes EIP-55 checksum, accepts all-lower or all-upper hex addresses
  try { ethers.getAddress(payTo); } catch { throw new Error('Invalid payTo address'); }
  if (!/^\d+$/.test(amountWei)) throw new Error('Invalid amountWei format');
  if (BigInt(amountWei) === 0n) throw new Error('Zero-value payment');
  try { ethers.getAddress(agentAddress); } catch { throw new Error('Invalid agentAddress'); }
}

// ── Transport Router ─────────────────────────────────────────────────────────

const transport = process.env.MCP_TRANSPORT ?? 'stdio';

if (transport === 'rest') {
  const app = express();
  const cors = require('cors');
  app.use(cors());
  app.use(express.json({ limit: '10kb' }));

  const rateLimit = require('express-rate-limit');
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'Too many requests, slow down' }
  });
  app.use('/api/', apiLimiter);

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

  // Dashboard feed (fallback for when no wallet connected, maybe limit fields or just keep as is)
  app.get('/api/evaluations', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const evaluations = getRecentEvaluations(limit);
      res.json({ evaluations });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Wallet Auth Nonce Flow ───────────────────────────────────────────
  app.get('/api/auth/nonce/:address', async (req, res) => {
    try {
      const { createNonce } = require('./store-supabase');
      const agentAddress = req.params.address;
      const nonce = await createNonce(agentAddress);
      res.json({ nonce, expiresAt: Date.now() + 5 * 60 * 1000 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/evaluations/:agentAddress', async (req, res) => {
    const agentAddress = req.params.agentAddress;
    const sig = req.headers['x-wallet-signature'];
    const nonce = req.headers['x-wallet-nonce'];

    if (!sig || !nonce) {
      return res.status(401).json({ error: 'Missing signature or nonce' });
    }

    try {
      const { verifyAndConsumeNonce, getClient } = require('./store-supabase');
      // Verify nonce
      const validNonce = await verifyAndConsumeNonce(nonce, agentAddress);
      if (!validNonce) {
        return res.status(401).json({ error: 'Invalid or expired nonce' });
      }

      // Verify signature
      const message = `Vigil authentication for agent ${agentAddress}. Nonce: ${nonce}`;
      let signerAddr;
      try {
        signerAddr = ethers.verifyMessage(message, sig);
      } catch {
        return res.status(401).json({ error: 'Invalid signature format' });
      }

      if (signerAddr.toLowerCase() !== agentAddress.toLowerCase()) {
        return res.status(401).json({ error: 'Address mismatch' });
      }

      // Fetch evaluations from Supabase using service_role
      const client = getClient();
      if (!client) {
        return res.status(500).json({ error: 'Supabase client not configured on server' });
      }
      
      const { data: evals, error } = await client
        .from('evaluations')
        .select('*')
        .eq('agent_address', agentAddress)
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) return res.status(500).json({ error: error.message });

      res.json({ evaluations: evals });
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

  // Rule Composer — manual trigger
  app.post('/api/compose-rule', async (req, res) => {
    try {
      const proposal = await composeRule();
      res.json(proposal);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get('/api/rules/proposed', async (req, res) => {
    try {
      const { createClient } = require('@supabase/supabase-js');
      if (!process.env.SUPABASE_URL) return res.json({ rules: [] });
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await supabase.from('proposed_rules').select('*').order('proposed_at', { ascending: false }).limit(20);
      if (error) {
        if (error.code === '42P01' || error.code === '42501') return res.json({ rules: [] }); // table not found or perm denied
        throw error;
      }
      res.json({ rules: data || [] });
    } catch (err) {
      res.json({ rules: [] }); // Graceful degradation for UI
    }
  });


  const PORT = process.env.PORT ?? 3003;
  app.listen(PORT, () => {
    console.log(`[Vigil] REST server listening on http://localhost:${PORT}`);
    console.log(`[Vigil] Endpoints:`);
    console.log(`  POST /api/evaluate           — Evaluate payment intent`);
    console.log(`  POST /api/record             — Record payment outcome`);
    console.log(`  GET  /api/reputation/:addr   — Agent reputation`);
    console.log(`  GET  /api/evaluations        — Dashboard feed (public)`);
    console.log(`  GET  /api/evaluations/:addr  — Agent feed (wallet auth)`);
    console.log(`  GET  /api/auth/nonce/:addr   — Get wallet auth nonce`);
    console.log(`  POST /api/compose-rule       — Trigger Rule Composer`);
    console.log(`  GET  /api/rules/proposed     — List shadow rules`);
    console.log(`  GET  /api/health             — Health check`);
  });

  // ── Rule Composer Cron (runs every 30 minutes) ──────────────────────────
  const { composeRule } = require('./llm-client');
  const COMPOSER_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

  const runComposer = () => {
    console.log('[RuleComposer] Running composition cycle...');
    composeRule()
      .then(proposal => {
        if (proposal?.proposed) console.log('[RuleComposer] New rule proposed:', proposal.ruleName);
        else console.log('[RuleComposer] No new rule needed');
      })
      .catch(err => console.warn('[RuleComposer] Cycle failed:', err.message));
  };

  // Run once on startup, then every 30 minutes
  setTimeout(runComposer, 10_000); // Wait 10s for everything to init
  setInterval(runComposer, COMPOSER_INTERVAL);

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

// ── Load reporter signer ───────────────────────────────────────────
function loadReporterSigner() {
  const { ethers } = require('ethers');
  try {
    const pk = execSync('cast wallet private-key acc1', {
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['inherit', 'pipe', 'pipe']
    }).trim();
    const provider = new ethers.JsonRpcProvider(process.env.KITE_RPC_URL);
    return new ethers.Wallet(pk, provider);
  } catch (err) {
    console.warn('[Registry] Keystore unlock failed, on-chain writes disabled');
    return null;
  }
}

module.exports = {
  loadReporterSigner,
  handleEvaluatePayment,
  handleRecordOutcome,
  handleGetReputation,
  checkOracleSanity,
  validateInput
};

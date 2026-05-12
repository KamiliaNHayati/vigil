// sensor.js — FULL INTEGRATED SENSOR ENGINE
// All 16 rule modules wired and live:
//   Rule 1: Amount thresholds (18-decimal BigInt)
//   Rule 2: Catalog recipient trust (ksearch / Kite MCP bridge)
//   Rule 3: Rate limiting (SQLite 1-hour window)
//   Rule 4: Contract risk (exploit DB + source verification)
//   Rule 5: Cross-chain risk (LZ blocklist + OFT + URL keywords)
//   Rule 6: Session intent drift (keyword + LLM semantic)
//   Rule 6b: Context anomaly (spending proximity, TTL, urgency)
//   Rule 7: Behavioral drift (3σ statistical)
//   Rule 8: Urgency keywords in URL
//   Rule 9: On-chain trust tier (AgentRegistry)
//   Rule 10: Threat intel (Grok via OpenRouter)
//   Rule 11: Self-payment detection
//   Rule 12: IP / Geolocation anomaly
//   Rule 13: Malicious host lookup (domain reputation)
//   Rule 14: TLS certificate validity
//   Rule 15: Unlimited ERC20 approval check
//   Rule 16: Pre-payment oracle integrity

require('dotenv').config();
const { ethers } = require('ethers');
const { checkContractRisk }   = require('./contract-risk');
const { checkCrossChainRisk } = require('./crosschain-risk');
const { catalogClient }       = require('./kite-mcp-bridge');
const { getRecentActions, db } = require('./store');
const { checkSessionDrift }   = require('./session-drift');
const { checkBehavioralDrift } = require('./behavioral-drift');
const { checkContextAnomaly } = require('./context-anomaly');
const { checkThreatIntel }    = require('./llm-client');
const { checkIPGeo } = require('./ip-geo');
const { checkDomainReputation } = require('./domain-reputation');
const { checkTLS } = require('./tls-check');
const { checkUnlimitedApprovals } = require('./approval-check');
const { checkOracleIntegrity } = require('./oracle-integrity');

// Severity ordering for final level calculation
const SEVERITY_VALUE = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
const SEVERITY_NAMES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// Urgency keywords that signal prompt-injection / social-engineering attacks
const URGENCY_KEYWORDS = (process.env.URGENCY_KEYWORDS || 'urgent,immediate,expiring,final-chance,limited-time')
  .split(',').map(s => s.trim().toLowerCase());

/**
 * Run all sensor rules against a payment intent.
 *
 * @param {Object} intent
 * @param {string} intent.amountWei    - Payment amount in wei (18 decimals)
 * @param {string} intent.payTo        - Recipient wallet address
 * @param {string} intent.agentAddress - Agent wallet address
 * @param {string} intent.resource     - Service URL being paid for
 * @param {string} [intent.sessionId]  - Active session ID
 * @param {string} [intent.vaultAddress] - Agent vault address
 * @returns {{ level: string, flags: Array, trustTier: number, threatIntel: Object|null }}
 */
async function check({ amountWei, payTo, agentAddress, resource, sessionId, vaultAddress }) {
  const flags = [];
  const moduleResults = []; // Dynamic tracking: { module, category, status, level }
  const amount = BigInt(amountWei);

  // ── Rule 1: Amount thresholds (18-decimal) ─────────────────────────────────
  if (amount > ethers.parseUnits('1000', 18)) {
    flags.push({ level: 'CRITICAL', reason: 'Amount exceeds 1000 tokens' });
    moduleResults.push({ module: 'amount_thresholds', category: 'Amount & Budget', status: 'flagged', level: 'CRITICAL' });
  } else if (amount > ethers.parseUnits('100', 18)) {
    flags.push({ level: 'HIGH', reason: 'Amount exceeds 100 tokens' });
    moduleResults.push({ module: 'amount_thresholds', category: 'Amount & Budget', status: 'flagged', level: 'HIGH' });
  } else if (amount > ethers.parseUnits('10', 18)) {
    flags.push({ level: 'MEDIUM', reason: 'Amount exceeds 10 tokens' });
    moduleResults.push({ module: 'amount_thresholds', category: 'Amount & Budget', status: 'flagged', level: 'MEDIUM' });
  } else {
    moduleResults.push({ module: 'amount_thresholds', category: 'Amount & Budget', status: 'clean', level: null });
  }

  // Rule 1b: Rolling 24h spend cap (GLM #4)
  const spendRow = db.prepare(`
    SELECT COALESCE(SUM(CAST(amount_wei AS REAL)), 0) as totalWei 
    FROM actions 
    WHERE agent_address = ? AND success = 1 AND timestamp > ?
  `).get(agentAddress, Date.now() - 86_400_000);
  const spendTokens = Number(ethers.formatUnits(
    BigInt(Math.floor(spendRow?.totalWei || 0)), 18
  ));
  if (spendTokens > 500) { flags.push({ level: 'CRITICAL', reason: `24h spending exceeds 500 tokens` }); moduleResults.push({ module: 'daily_spend_cap', category: 'Amount & Budget', status: 'flagged', level: 'CRITICAL' }); }
  else if (spendTokens > 100) { flags.push({ level: 'HIGH', reason: `24h spending exceeds 100 tokens` }); moduleResults.push({ module: 'daily_spend_cap', category: 'Amount & Budget', status: 'flagged', level: 'HIGH' }); }
  else if (spendTokens > 50) { flags.push({ level: 'MEDIUM', reason: `24h spending exceeds 50 tokens` }); moduleResults.push({ module: 'daily_spend_cap', category: 'Amount & Budget', status: 'flagged', level: 'MEDIUM' }); }
  else { moduleResults.push({ module: 'daily_spend_cap', category: 'Amount & Budget', status: 'clean', level: null }); }

  // ── Rule 2: ksearch / Kite MCP catalog recipient trust ─────────────────────
  let catalogServices = [];
  try {
    catalogServices = await catalogClient.listServices({ limit: 200 });
    const isKnownService = catalogServices.some(s => {
      if (s.payTo?.toLowerCase() === payTo.toLowerCase()) return true;
      try { return new URL(s.resource).hostname === new URL(resource).hostname; } catch { return false; }
    });
    if (!isKnownService) {
      flags.push({ level: 'HIGH', reason: 'Recipient not in Kite service catalog' });
      moduleResults.push({ module: 'ksearch_catalog', category: 'Recipient Trust', status: 'flagged', level: 'HIGH' });
    } else {
      moduleResults.push({ module: 'ksearch_catalog', category: 'Recipient Trust', status: 'clean', level: null });
    }
  } catch (err) {
    console.warn('[Sensor] Catalog check failed, continuing:', err.message);
    flags.push({ level: 'MEDIUM', reason: 'Catalog unavailable — cannot verify recipient' });
    moduleResults.push({ module: 'ksearch_catalog', category: 'Recipient Trust', status: 'error', level: 'MEDIUM' });
  }

    // Rule 2b: Catalog payTo mismatch (GLM #1)
  try {
    const catalogEntry = catalogServices.find(s =>
      new URL(s.resource).hostname === new URL(resource).hostname
    );
    if (catalogEntry && catalogEntry.payTo?.toLowerCase() !== payTo.toLowerCase()) {
      flags.push({ level: 'CRITICAL', reason: `payTo mismatch: catalog lists ${catalogEntry.payTo.slice(0,8)}... for this service, but agent pays ${payTo.slice(0,8)}...` });
      moduleResults.push({ module: 'catalog_payto_mismatch', category: 'Recipient Trust', status: 'flagged', level: 'CRITICAL' });
    } else {
      moduleResults.push({ module: 'catalog_payto_mismatch', category: 'Recipient Trust', status: 'clean', level: null });
    }
  } catch { moduleResults.push({ module: 'catalog_payto_mismatch', category: 'Recipient Trust', status: 'skipped', level: null }); }

  // Rule 2c: Typosquatting detection (GLM #5)
  try {
    const host = new URL(resource).hostname.toLowerCase();
    let typoFound = false;
    for (const s of catalogServices) {
      const catHost = new URL(s.resource).hostname.toLowerCase();
      const dist = levenshtein(host, catHost);
      if (dist > 0 && dist <= 2 && host !== catHost) {
        flags.push({ level: 'HIGH', reason: `URL closely resembles known service "${catHost}" — possible typosquatting` });
        moduleResults.push({ module: 'typosquatting', category: 'Recipient Trust', status: 'flagged', level: 'HIGH' });
        typoFound = true;
        break;
      }
    }
    if (!typoFound) moduleResults.push({ module: 'typosquatting', category: 'Recipient Trust', status: 'clean', level: null });
  } catch { moduleResults.push({ module: 'typosquatting', category: 'Recipient Trust', status: 'skipped', level: null }); }

  // ── Rule 3: Rate limiting (from SQLite) ────────────────────────────────────
  try {
    const recentTxs = getRecentActions(agentAddress, 3_600_000); // 1-hour window
    if (recentTxs.length > 50) {
      flags.push({ level: 'CRITICAL', reason: `${recentTxs.length} transactions in last hour` });
    } else if (recentTxs.length > 20) {
      flags.push({ level: 'HIGH', reason: `${recentTxs.length} transactions in last hour` });
    } else if (recentTxs.length > 10) {
      flags.push({ level: 'MEDIUM', reason: `${recentTxs.length} transactions in last hour` });
    }
  } catch (err) {
    console.warn('[Sensor] Rate limit check failed:', err.message);
  }

  // Rule 3b: Duplicate payment detection (GLM #3)
  const dupRow = db.prepare(`
    SELECT COUNT(*) as c FROM actions 
    WHERE pay_to = ? AND amount_wei = ? AND resource = ? AND timestamp > ?
  `).get(payTo, amountWei, resource, Date.now() - 3600_000);
  if (dupRow.c >= 2) {
    flags.push({ level: 'MEDIUM', reason: `Duplicate payment: same recipient, amount, and service paid ${dupRow.c} times in last hour` });
    moduleResults.push({ module: 'duplicate_payment', category: 'Amount & Budget', status: 'flagged', level: 'MEDIUM' });
  } else {
    moduleResults.push({ module: 'duplicate_payment', category: 'Amount & Budget', status: 'clean', level: null });
  }

  // ── Rule 4: Recipient contract risk (exploit DB + source verification) ─────
  try {
    const contractResult = await checkContractRisk(payTo);
    flags.push(...contractResult.flags);
    const cStatus = contractResult.flags.length > 0 ? 'flagged' : 'clean';
    const cLevel = contractResult.flags[0]?.level ?? null;
    moduleResults.push({ module: 'exploit_db', category: 'Contract Safety', status: cStatus, level: cLevel });
    moduleResults.push({ module: 'source_verification', category: 'Contract Safety', status: cStatus, level: cLevel });
  } catch (err) {
    console.warn('[Sensor] Contract risk check failed:', err.message);
    moduleResults.push({ module: 'exploit_db', category: 'Contract Safety', status: 'error', level: null });
  }

  // ── Rule 5: LayerZero / cross-chain risk ───────────────────────────────────
  try {
    const crosschainResult = await checkCrossChainRisk(payTo, resource);
    flags.push(...crosschainResult.flags);
    const xStatus = crosschainResult.flags.length > 0 ? 'flagged' : 'clean';
    moduleResults.push({ module: 'lz_core_contracts', category: 'Cross-Chain', status: xStatus, level: crosschainResult.flags[0]?.level ?? null });
    moduleResults.push({ module: 'crosschain_keywords', category: 'Cross-Chain', status: xStatus, level: crosschainResult.flags[0]?.level ?? null });
  } catch (err) {
    console.warn('[Sensor] Cross-chain risk check failed:', err.message);
    moduleResults.push({ module: 'lz_core_contracts', category: 'Cross-Chain', status: 'error', level: null });
  }

  // ── Rule 6: Session intent drift ──────────────────────────────────────────
  if (sessionId) {
    try {
      const driftResult = await checkSessionDrift(sessionId, resource);
      if (driftResult?.driftDetected && driftResult.flag) {
        flags.push(driftResult.flag);
        moduleResults.push({ module: 'session_drift', category: 'Agent Behaviour', status: 'flagged', level: driftResult.flag.level });
      } else {
        moduleResults.push({ module: 'session_drift', category: 'Agent Behaviour', status: 'clean', level: null });
      }
    } catch (err) {
      console.warn('[Sensor] Session drift check failed:', err.message);
      moduleResults.push({ module: 'session_drift', category: 'Agent Behaviour', status: 'error', level: null });
    }
  } else {
    moduleResults.push({ module: 'session_drift', category: 'Agent Behaviour', status: 'skipped', level: null });
  }

  // ── Rule 6b: Context anomaly (spending proximity, TTL, urgency) ───────────
  if (sessionId || vaultAddress) {
    try {
      const contextFlags = await checkContextAnomaly({ sessionId, vaultAddress, amountWei, resource });
      flags.push(...contextFlags);
      moduleResults.push({ module: 'context_anomaly', category: 'Agent Behaviour', status: contextFlags.length > 0 ? 'flagged' : 'clean', level: contextFlags[0]?.level ?? null });
    } catch (err) {
      console.warn('[Sensor] Context anomaly check failed:', err.message);
      moduleResults.push({ module: 'context_anomaly', category: 'Agent Behaviour', status: 'error', level: null });
    }
  } else {
    moduleResults.push({ module: 'context_anomaly', category: 'Agent Behaviour', status: 'skipped', level: null });
  }

  // ── Rule 7: Behavioral drift (3σ) ─────────────────────────────────────────
  try {
    const behavioralFlag = checkBehavioralDrift(agentAddress, amountWei);
    if (behavioralFlag) {
      flags.push(behavioralFlag);
      moduleResults.push({ module: 'behavioral_drift', category: 'Agent Behaviour', status: 'flagged', level: behavioralFlag.level });
    } else {
      moduleResults.push({ module: 'behavioral_drift', category: 'Agent Behaviour', status: 'clean', level: null });
    }
  } catch (err) {
    console.warn('[Sensor] Behavioral drift check failed:', err.message);
    moduleResults.push({ module: 'behavioral_drift', category: 'Agent Behaviour', status: 'error', level: null });
  }

  // ── Rule 8: Urgency keywords in resource URL ──────────────────────────────
  try {
    const urlLower = resource.toLowerCase();
    const hasUrgency = URGENCY_KEYWORDS.some(k => urlLower.includes(k));
    if (hasUrgency) {
      const currentMax = flags.reduce((max, f) => Math.max(max, SEVERITY_VALUE[f.level] ?? 0), 0);
      if (currentMax < SEVERITY_VALUE['HIGH']) {
        flags.push({ level: 'HIGH', reason: 'Urgency keywords in service URL — possible social engineering' });
        moduleResults.push({ module: 'urgency_keywords', category: 'Agent Behaviour', status: 'flagged', level: 'HIGH' });
      } else {
        flags.push({ level: 'MEDIUM', reason: 'Urgency keywords in service URL' });
        moduleResults.push({ module: 'urgency_keywords', category: 'Agent Behaviour', status: 'flagged', level: 'MEDIUM' });
      }
    } else {
      moduleResults.push({ module: 'urgency_keywords', category: 'Agent Behaviour', status: 'clean', level: null });
    }
  } catch (err) {
    console.warn('[Sensor] Urgency keyword check failed:', err.message);
    moduleResults.push({ module: 'urgency_keywords', category: 'Agent Behaviour', status: 'error', level: null });
  }

  // ── Rule 9: On-chain trust tier (AgentRegistry.sol) ────────────────────────
  let trustTier = 0;
  if (process.env.AGENT_REGISTRY_ADDRESS && process.env.KITE_RPC_URL) {
    try {
      const provider = new ethers.JsonRpcProvider(process.env.KITE_RPC_URL);
      const ABI = ['function getTrustTier(address) view returns (uint8)'];
      const registry = new ethers.Contract(process.env.AGENT_REGISTRY_ADDRESS, ABI, provider);
      trustTier = Number(await registry.getTrustTier(agentAddress));
    } catch (err) {
      // AgentRegistry not deployed or RPC error — skip
      console.warn('[Sensor] Trust tier check skipped:', err.message);
    }
  }

  // ── Rule 10: Threat intel (Grok via OpenRouter) ────────────────────────────
  let threatIntel = null;
  if (process.env.OPENROUTER_KEY && process.env.OPENROUTER_KEY !== 'sk-or-v1-your-key-here') {
    try {
      threatIntel = await checkThreatIntel({ payTo, resource });
      if (threatIntel?.threatsFound) {
        flags.push({
          level: 'HIGH',
          reason: `Threat intel: ${threatIntel.summary}`
        });
      }
    } catch (err) {
      console.warn('[Sensor] Threat intel check failed:', err.message);
    }
  }

  // Rule 11: Self-payment detection (GLM #6)
  const selfTargets = [
    agentAddress, vaultAddress, process.env.SETTLEMENT_TOKEN, process.env.SETTLEMENT_CONTRACT
  ].filter(Boolean).map(a => a.toLowerCase());
  if (selfTargets.includes(payTo.toLowerCase())) {
    flags.push({ level: 'HIGH', reason: 'Payment targets the agent itself, its vault, or a core settlement contract' });
    moduleResults.push({ module: 'self_payment', category: 'Recipient Trust', status: 'flagged', level: 'HIGH' });
  } else {
    moduleResults.push({ module: 'self_payment', category: 'Recipient Trust', status: 'clean', level: null });
  }

  // Rule 12: IP / Geolocation Anomaly Check
  const ipGeoFlag = await checkIPGeo(resource);
  if (ipGeoFlag) { flags.push(ipGeoFlag); moduleResults.push({ module: 'ip_geolocation', category: 'Phishing & Social Engineering', status: 'flagged', level: ipGeoFlag.level }); }
  else { moduleResults.push({ module: 'ip_geolocation', category: 'Phishing & Social Engineering', status: 'clean', level: null }); }

  // Rule 13: Malicious Host Lookup (Domain Reputation)
  const domainFlag = checkDomainReputation(resource);
  if (domainFlag) { flags.push(domainFlag); moduleResults.push({ module: 'malicious_domain', category: 'Phishing & Social Engineering', status: 'flagged', level: domainFlag.level }); }
  else { moduleResults.push({ module: 'malicious_domain', category: 'Phishing & Social Engineering', status: 'clean', level: null }); }

  // Rule 14: TLS Certificate Validity
  try {
    const hostname = new URL(resource).hostname;
    if (hostname !== 'localhost') {
      const tlsFlag = await checkTLS(resource);
      if (tlsFlag) { flags.push(tlsFlag); moduleResults.push({ module: 'tls_certificate', category: 'Phishing & Social Engineering', status: 'flagged', level: tlsFlag.level }); }
      else { moduleResults.push({ module: 'tls_certificate', category: 'Phishing & Social Engineering', status: 'clean', level: null }); }
    } else {
      moduleResults.push({ module: 'tls_certificate', category: 'Phishing & Social Engineering', status: 'skipped', level: null });
    }
  } catch (err) {
    console.warn('[Sensor] TLS check failed:', err.message);
    moduleResults.push({ module: 'tls_certificate', category: 'Phishing & Social Engineering', status: 'error', level: null });
  }

  // Rule 15: Unlimited ERC20 Approval Check
  if (process.env.KITE_RPC_URL) {
    try {
      const tokenAddresses = (process.env.WATCHED_TOKENS || '').split(',').filter(Boolean);
      if (tokenAddresses.length > 0) {
        const approvalFlag = await checkUnlimitedApprovals(agentAddress, payTo, tokenAddresses);
        if (approvalFlag) { flags.push(approvalFlag); moduleResults.push({ module: 'unlimited_approval', category: 'Contract Safety', status: 'flagged', level: approvalFlag.level }); }
        else { moduleResults.push({ module: 'unlimited_approval', category: 'Contract Safety', status: 'clean', level: null }); }
      } else {
        moduleResults.push({ module: 'unlimited_approval', category: 'Contract Safety', status: 'skipped', level: null });
      }
    } catch (err) {
      console.warn('[Sensor] Approval check failed:', err.message);
      moduleResults.push({ module: 'unlimited_approval', category: 'Contract Safety', status: 'error', level: null });
    }
  } else {
    moduleResults.push({ module: 'unlimited_approval', category: 'Contract Safety', status: 'skipped', level: null });
  }

  // Rule 16: Pre-payment Oracle Integrity
  try {
    const oracleFlag = await checkOracleIntegrity(resource, null);
    if (oracleFlag) { flags.push(oracleFlag); moduleResults.push({ module: 'oracle_integrity', category: 'Data & Oracle Integrity', status: 'flagged', level: oracleFlag.level }); }
    else { moduleResults.push({ module: 'oracle_integrity', category: 'Data & Oracle Integrity', status: 'clean', level: null }); }
  } catch (err) {
    console.warn('[Sensor] Oracle integrity check failed:', err.message);
    moduleResults.push({ module: 'oracle_integrity', category: 'Data & Oracle Integrity', status: 'error', level: null });
  }

  // ── Final level: max of all flags, then trust-tier reduction ────────────────
  const baseLevel = flags.reduce(
    (max, f) => (SEVERITY_VALUE[f.level] > SEVERITY_VALUE[max] ? f.level : max),
    'LOW'
  );
  // Trust tier ≥ 2 (Trusted agent) reduces severity by one level
  const trustReduction = (trustTier >= 2) ? 1 : 0;
  const finalIndex = Math.max(0, SEVERITY_VALUE[baseLevel] - trustReduction);
  const finalLevel = SEVERITY_NAMES[finalIndex];

  return { level: finalLevel, flags, trustTier, threatIntel, moduleResults };
}

module.exports = { check, SEVERITY_VALUE, SEVERITY_NAMES };

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, (_, i) => [i]);
  dp[0] = Array.from({length: n+1}, (_, i) => i);
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i-1][j] + 1,
        dp[i][j-1] + 1,
        dp[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)
      );
  return dp[m][n];
}
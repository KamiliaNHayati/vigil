# Rules.md — Vigil Risk & Verification Rules

> **Revision note (v3):** Cleaned section numbering. Added §8 Cross-Chain Risk Rules (LayerZero). Removed "Post-MVP" label from Oracle Sanity — it ships in week 3. Updated response codes throughout. Prior fixes: 18-decimal math, model name, install URL, ksearch catalog, ABI calls.

---

## 0. Decimal Handling — Read This First

All amounts on Kite testnet use **18 decimal places**.

```javascript
const { ethers } = require('ethers');
const ONE_TOKEN = ethers.parseUnits('1', 18); // 1000000000000000000n
const displayAmount = ethers.formatUnits(amountWei, 18); // "1.0"
// ❌ WRONG: parseInt(amountWei) / 10**6
// ✅ CORRECT: ethers.formatUnits(amountWei, 18)
```

---

## 1. Sensor Rules (Deterministic — Runs Before LLM)

### 1.1 Amount Thresholds

| Condition | Risk Level | Reason Text |
|-----------|------------|-------------|
| > 1000 tokens (1e21 wei) | CRITICAL | "Amount exceeds 1000 tokens" |
| > 100 tokens (1e20 wei) | HIGH | "Amount exceeds 100 tokens" |
| > 10 tokens (1e19 wei) | MEDIUM | "Amount exceeds 10 tokens" |
| ≤ 10 tokens | LOW | No flag |

### 1.2 Recipient Trust (Dynamic ksearch Catalog)

```javascript
const catalogServices = await ksearchClient.listServices({ limit: 200 });
const isKnownService = catalogServices.some(s =>
  s.payTo?.toLowerCase() === payTo.toLowerCase() ||
  new URL(s.resource).hostname === new URL(resource).hostname
);
```

| Condition | Risk Modifier |
|-----------|---------------|
| Matches catalog entry | No flag |
| Same hostname as catalog service | No flag |
| Completely unknown | HIGH: "Recipient not in Kite service catalog" |
| Previously blocked (SQLite) | Override to CRITICAL |

**Static fallback:** If ksearch is unavailable, load `data/known-services-fallback.json` (seeded from official Kite demo services).

**Catalog payTo Mismatch Guard:**
If the hostname matches a catalog entry but `payTo` differs from the catalog's listed `payTo`, flag CRITICAL: "Recipient differs from catalog listing for this service."

### 1.3 Rate Limiting

| Transactions in Last Hour | Risk Level |
|--------------------------|------------|
| > 100 | CRITICAL |
| > 50 | HIGH |
| > 20 | MEDIUM |
| > 10 | LOW warning |

**Duplicate Payment Detection:**
If `COUNT(payTo, amountWei, resource)` in last hour ≥ 2, flag MEDIUM.

### 1.4 Agent Reputation Modifier

Reads `getTrustTier(agentAddress)` from `AgentRegistry.sol` via `ethers.Contract`.

| Tier | Name | Effect |
|------|------|--------|
| 0 — New | < 5 actions | Add MEDIUM: "New agent with fewer than 5 recorded actions" |
| 1 — Established | 5+ actions, score < 6000 | No modifier |
| 2 — Trusted | Score 6000–9000 | Reduce final level by one step |
| 3 — Verified | Score > 9000 | Reduce by one step; auto-approve if final level is LOW |

### 1.5 Final Level Calculation

```javascript
const SEVERITY_VALUE = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
const SEVERITY_NAMES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const baseLevel = flags.reduce((max, f) =>
  SEVERITY_VALUE[f.level] > SEVERITY_VALUE[max] ? f.level : max, 'LOW');

const trustReduction = (trustTier >= 2) ? 1 : 0;
const finalIndex = Math.max(0, SEVERITY_VALUE[baseLevel] - trustReduction);
const finalLevel = SEVERITY_NAMES[finalIndex];
```

### 1.6 Rolling 24h Spend Cap

| Spend | Level | Reason |
|---|---|---|
| > 500 tokens | CRITICAL | "24h spending exceeds 500 tokens" |
| > 100 tokens | HIGH | "24h spending exceeds 100 tokens" |
| > 50 tokens | MEDIUM | "24h spending exceeds 50 tokens" |

### 1.7 Self-Payment Detection

If `payTo` equals `agentAddress`, `vaultAddress`, `SETTLEMENT_TOKEN`, or `SETTLEMENT_CONTRACT`, flag HIGH.

### 1.8 Typosquatting Detection

If `levenshtein(hostname, catalogHostname) <= 2` and not equal, flag HIGH.

---

## 2. Guide Rules (LLM Explanation)

### 2.1 Model

`google/gemini-2.0-flash-lite` via OpenRouter. Verify current model name at openrouter.ai/models before building.

### 2.2 Prompt Structure

```
You are a security analyst for AI agent payments on Kite blockchain.

Payment intent:
- Amount: {displayAmount} tokens
- Recipient: {payTo[0..5]}...{payTo[-4..]}
- Service: {resource}
- Risk flags: {flags | join '; '} — or "None" if empty
- Overall risk level: {finalLevel}

Rules:
1. If CRITICAL, start with "WARNING:"
2. Mention exact display amount and truncated recipient
3. Reference the highest-severity flag explicitly
4. Max 2 sentences, plain English — no jargon (no "EOA", "calldata", "wei")
```

### 2.3 Required Output Schema

```json
{
  "riskLevel": "LOW | MEDIUM | HIGH | CRITICAL",
  "explanation": "Max 2 sentences",
  "primaryConcern": "string or null"
}
```

### 2.4 Output Validation

| Check | Rule |
|-------|------|
| Schema valid | `riskLevel`, `explanation` must be present |
| Risk level matches sensor | `riskLevel` must equal sensor's `finalLevel` |
| WARNING prefix | If CRITICAL, explanation must start with "WARNING:" |
| No false safety | If HIGH/CRITICAL: must not contain "safe", "low risk", "no concern", "trusted", "looks fine" |

### 2.5 Prompt Injection Sanitization

Strip `ignore previous`, `disregard all above`, `you are now`, `system:`, and safety-keyword injections from `resource` and `task_summary` before they enter the LLM prompt. Truncate to 500 chars.

---

## 3. Verification Rules

### 3.1 Alignment Criteria (All Must Pass)

| Check | Failure Action |
|-------|----------------|
| `guideResult.riskLevel === sensorResult.finalLevel` | Misaligned |
| CRITICAL → explanation starts with "WARNING:" | Misaligned |
| HIGH/CRITICAL → no false-safety language | Misaligned → BLOCK immediately (no retry) |
| HIGH/CRITICAL flags → at least one flag keyword in explanation | Misaligned |

### 3.2 Retry Logic

```
attempt 1 → fail → retry with correction prompt appending issues
attempt 2 → fail → BLOCK (no further retries)
```

### 3.3 False-Safety Fast-Path Block

```javascript
const FALSE_SAFETY_TERMS = ['safe', 'low risk', 'no concern', 'fine', 'trusted', 'looks good'];
const isFalseSafe = highRisk && FALSE_SAFETY_TERMS.some(t => explanation.toLowerCase().includes(t));
if (isFalseSafe) return { action: 'BLOCK', code: 'HALLUCINATION_RISK', skipRetry: true };
```

---

## 4. Policy Rules (Final Decision)

### 4.1 Decision Table

| Sensor Level | Verifier | Vault Budget | Decision |
|--------------|----------|--------------|----------|
| LOW | ALIGNED | Within budget | APPROVE |
| LOW | ALIGNED | Exceeds budget | BLOCK |
| MEDIUM | ALIGNED | Within budget | APPROVE + WARN |
| MEDIUM | MISALIGNED (2nd fail) | Any | BLOCK |
| HIGH | ALIGNED | Within budget | WARN |
| HIGH | MISALIGNED | Any | BLOCK |
| CRITICAL | Any | Any | BLOCK |
| Any | HALLUCINATION_RISK | Any | BLOCK |
| Any | Any | Any (LLM down) | DEGRADED MODE |

### 4.2 Vault Budget Check

```javascript
// AA SDK does NOT expose .getSpendingRules() — use ethers.Contract ABI directly
const vault = new ethers.Contract(vaultAddress, CLIENT_AGENT_VAULT_ABI, provider);
const rules = await vault.getSpendingRules();
if (BigInt(amountWei) > rules[0].budget) {
  return { action: 'BLOCK', code: 'BUDGET_EXCEEDED' };
}
```

### 4.3 Circuit Breaker

If file `CIRCUIT_BREAKER_PATH` exists, immediately return BLOCK with code `CIRCUIT_BREAKER_ENGAGED`.

---

## 5. Session Intent Drift Rules

Fires when an agent pays for a service outside the scope of its session's authorized task. Amount and recipient checks alone cannot catch this.

### 5.1 Detection Logic

```
1. Load task_summary from SQLite (keyed by sessionId)
2. Keyword overlap: extract 4+ char words from task_summary and resource URL
3. ≥ 2 overlaps → no drift (free, no LLM call)
4. < 2 overlaps → LLM semantic check (≤80 tokens)
5. LLM confirms mismatch → HIGH flag
6. No stored sessionId → skip (not an error)
```

### 5.2 Risk Assignment

| Condition | Flag |
|-----------|------|
| Keyword overlap ≥ 2 | No drift |
| Keyword overlap < 2, LLM confirms match | No drift |
| Keyword overlap < 2, LLM confirms mismatch | HIGH: "Session intent drift: authorized for X, attempting Y" |
| No stored intent | Skip |

### 5.3 Parameterization

Keyword overlap threshold (default: 2) is configurable via env var `DRIFT_KEYWORD_THRESHOLD`. Document in README. A production deployment lets operators tune without code changes.

---

## 6. Recipient Contract Risk Rules

Addresses **arbitrary-call vulnerabilities** and **unaudited contract** attack classes from the 2025–2026 DeFi hack analysis.

### 6.1 Decision Tree

```
Is payTo an EOA (no bytecode)?
  → Yes: Skip contract checks
  → No:
      In EXPLOITED_CONTRACTS? → CRITICAL (short-circuit)
      In TRUSTED_CONTRACTS?   → Pass
      Source verified?         → No: HIGH
                               → Yes, but unknown: MEDIUM
```

### 6.2 Risk Assignment

| Condition | Risk Level | Reason Text |
|-----------|------------|-------------|
| EOA | No flag | — |
| In TRUSTED_CONTRACTS | No flag | Known protocol contract |
| In EXPLOITED_CONTRACTS | CRITICAL | "Recipient involved in a known exploit" |
| Unverified + not trusted | HIGH | "Recipient contract source code is unverified" |
| Verified + not trusted | MEDIUM | "Unrecognized contract — review before paying" |

### 6.3 README Statement (Copy This)

> "We reviewed recent 2025–2026 DeFi protocol hacks catalogued in DeFiHackLabs (github.com/SunWeb3Sec/DeFiHackLabs) and identified the failure modes relevant to AI agent payments. Vigil adds targeted Recipient Contract Risk rules addressing the two most common: arbitrary-call vulnerabilities and unaudited contracts. These flags fire at payment evaluation time — before any tokens move."

---

## 7. Cross-Chain Risk Rules (LayerZero)

Kite AI natively supports LayerZero v2 (Endpoint ID 30406, Chain ID 2366). Payments targeting LayerZero infrastructure or OFT contracts carry cross-chain opacity risk.

### 7.1 Decision Tree

```
Is payTo a core LZ contract (EndpointV2, Executor, Send/ReceiveULN)?
  → YES: CRITICAL — infrastructure, never a valid payment target

Is payTo a known OFT?
  → YES, trusted: No flag (mention in Guide for transparency)
  → YES, untrusted: HIGH — "Unrecognised OFT: verify remote chain"

Does resource URL contain cross-chain keyword?
  (layerzero, lz, oft, bridge, omnichain, relay, crosschain)
  → YES: MEDIUM — "Cross-chain service: verify destination"
```

### 7.2 Risk Assignment

| Condition | Risk Level | Reason Text |
|-----------|------------|-------------|
| PayTo is EndpointV2/Executor/ULN | CRITICAL | "Payment targets a LayerZero core contract — likely misdirected" |
| PayTo is untrusted OFT | HIGH | "Cross-chain payment to unrecognised OFT — verify remote chain" |
| PayTo is trusted OFT | No flag | — |
| Cross-chain keyword in URL | MEDIUM | "Service URL suggests cross-chain interaction — verify destination" |

### 7.3 Canonical LZ Contract Addresses (Kite Mainnet)

These are **mainnet** addresses (chainId 2366). Kite testnet (chainId 2368) may have different LZ addresses if LayerZero is deployed there. For the hackathon, use these as the blocklist — no legitimate testnet agent should be paying these mainnet addresses anyway.

| Contract | Address |
|----------|---------|
| EndpointV2 | `0x6F475642a6e85809B1c36Fa62763669b1b48DD5B` |
| SendUln302 | `0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7` |
| ReceiveUln302 | `0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043` |
| Executor | `0x4208D6E27538189bB48E603D6123A94b8Abe0A0b` |
| Blocked Msg Lib | `0xc1ce56b2099ca68720592583c7984cab4b6d7e7a` |
| Dead DVN | `0x6788f52439ACA6BFF597d3eeC2DC9a44B8FEE842` |

Chain ID: 2366 · Endpoint ID (eid): 30406 · Note: eid ≠ chainId

### 7.4 Demo Scenario

Attack URL: `https://malicious.io/layerzero-relay/drain`
- Keyword `layerzero` in URL → MEDIUM
- Unknown recipient → HIGH  
- Unverified contract → HIGH
- Behavioral drift (500 tokens, z≈1660σ with seeded stdDev≈0.3; demo claims '>100σ') → MEDIUM
- Combined → CRITICAL

60-second demo close: *"With Kite's native LayerZero integration, agents will soon pay across chains. Vigil already screens for cross-chain risks — unrecognised OFTs, relay contracts, misdirected infrastructure payments. Same Sensor-Verifier loop. Every chain."*

---

## 8. Behavioral Drift Rules

Addresses **private key compromise** and **social engineering** classes. A compromised key signing normal-looking payments to a known address bypasses amount/recipient checks — but deviates statistically from the agent's history.

### 8.1 Trigger Condition

Requires ≥ 5 successful historical actions in SQLite. Skip if insufficient baseline.

### 8.2 Detection

| Condition | Flag |
|-----------|------|
| Current amount within 3σ of 7-day mean | No flag |
| Current amount > 3σ from 7-day mean | MEDIUM: "Unusual amount: Xσ from 7-day average of Y tokens" |
| < 5 historical actions | Skip |

### 8.3 Demo Setup

Seed SQLite with 10 synthetic actions at 0.5–1.5 tokens each via `scripts/seed-demo-data.js`. Attack at 500 tokens → z≈(500-1)/0.3 ≈ 1660σ; demo states '>100σ' which is accurate and dramatic.

---

## 9. Degraded Mode Rules (LLM Unavailable)

### 9.1 Trigger Conditions

- OpenRouter request throws or times out after 5 seconds
- Response is not valid JSON matching the schema
- `data.choices[0]` missing or empty

### 9.2 Degraded Behavior

| Sensor Level | Normal Mode | Degraded Mode |
|--------------|-------------|---------------|
| LOW | APPROVE | APPROVE (with `degraded: true`) |
| MEDIUM | APPROVE + WARN | **BLOCK** |
| HIGH | WARN | **BLOCK** |
| CRITICAL | BLOCK | BLOCK |

Verifier is skipped in degraded mode. Response always includes `"degraded": true`.

---

## 10. Oracle Sanity Hook (Post-Payment)

Runs inside `record_outcome`. A **warning**, not a block — payment has already settled. Demonstrates full payment lifecycle thinking.

### 10.1 Thresholds

| Metric | Suspicious Threshold | Action |
|--------|---------------------|--------|
| APY / yield percentage | > 50% | Dashboard ⚠️ warning |
| Price vs baseline | > 20% deviation | Dashboard ⚠️ warning |
| Response bytes | < 50 bytes | Dashboard ⚠️ warning |

### 10.2 Implementation

```javascript
function checkOracleSanity(traceDataStr) {
  try {
    const data = JSON.parse(traceDataStr ?? '{}');
    if (data.apy && Number(data.apy) > 50)
      return `APY of ${data.apy}% exceeds sanity threshold`;
    if (data.price && data.priceBaseline) {
      const dev = Math.abs(data.price - data.priceBaseline) / data.priceBaseline;
      if (dev > 0.2) return `Price deviates ${(dev*100).toFixed(1)}% from baseline`;
    }
    if (data.responseBytes !== undefined && data.responseBytes < 50)
      return `Paid service returned only ${data.responseBytes} bytes`;
    return null;
  } catch { return null; }
}
```

### 10.3 Dashboard Integration

The evaluation feed shows a ⚠️ `POST` badge next to any entry whose `record_outcome` returned an `oracleWarning`. One column, 30 minutes of UI work.

---

## 11. Reputation Rules (AgentRegistry.sol)

### 11.1 Score Changes

| Event | Score Change |
|-------|-------------|
| Successful LOW payment | +10 |
| Successful MEDIUM payment | +15 |
| Successful HIGH payment | +25 |
| Failed LOW | -20 |
| Failed MEDIUM | -50 |
| Failed HIGH | -100 |
| CRITICAL (always blocked pre-execution) | N/A |

### 11.2 Trust Tiers

| Tier | Name | Score | Actions Required | Privileges |
|------|------|-------|-----------------|------------|
| 0 | New | Any | < 5 | +1 risk level |
| 1 | Established | Any | ≥ 5 | Baseline |
| 2 | Trusted | > 6000 | ≥ 5 | -1 risk level |
| 3 | Verified | > 9000 | ≥ 5 | -1 risk level + auto-approve LOW |

### 11.3 Trace Hashing = On-Chain Attestation

The traceHash passed to AgentRegistry.recordAction() is a timestamped commitment proving that Vigil recorded a risk evaluation at this time. It does not cryptographically attest to the validity of the data itself — it proves that Vigil evaluated this payment, creating an auditable anchor point. No separate attestation contract is needed.

```javascript
const traceHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({
  agent: agentAddress, payTo, amountWei, resource,
  sensorLevel, verified: verifierAligned, timestamp: Date.now()
})));
// → stored on-chain as bytes32 in AgentRegistry.sol
```

---

## 12. Context Anomaly Rules (Session-Aware)

These require reading `kpass agent:session status`.

| Condition | Flag |
|-----------|------|
| Payment > 80% of session `max-amount-per-tx` | MEDIUM: "Near per-tx limit" |
| Session total spent > 80% of `max-total-amount` | MEDIUM: "Near session budget limit" |
| Session TTL < 5 minutes | MEDIUM: "Session expiring — urgency signal" |
| URL contains: urgent, immediate, expiring, final-chance, limited-time | +1 risk level |

```javascript
// context-anomaly.js — Session-Aware Context Anomaly Detection
// Rules.md §12: Payment proximity to limits, session TTL, urgency signals
// Requires reading kpass session status or using stored session data

const { ethers } = require('ethers');
const { getSessionSpending, db } = require('./store');

// Urgency keywords that signal social engineering / prompt injection
const URGENCY_KEYWORDS = (process.env.URGENCY_KEYWORDS || 'urgent,immediate,expiring,final-chance,limited-time')
  .split(',').map(s => s.trim());

/**
 * Check session context anomalies:
 * - Payment > 80% of session max-amount-per-tx
 * - Session total spent > 80% of max-total-amount
 * - Session TTL < 5 minutes
 * - Urgency keywords in URL
 */
async function checkContextAnomaly({ sessionId, vaultAddress, amountWei, resource }) {
  const flags = [];

  // 1. Check urgency keywords in URL (independent of kpass status)
  const urlLower = resource.toLowerCase();
  const hasUrgency = URGENCY_KEYWORDS.some(k => urlLower.includes(k));
  if (hasUrgency) {
    flags.push({
      level: 'MEDIUM',
      reason: 'Urgency keywords detected in service URL — possible social engineering'
    });
  }

  // 2. Try to read session status from kpass CLI
  // NOTE: This requires kpass to be installed and authenticated.
  // For demo: if kpass is unavailable, skip session-specific checks silently.
  try {
    const sessionStatus = await getKpassSessionStatus(sessionId);
    if (!sessionStatus) return flags; // kpass unavailable — skip

    const { maxAmountPerTx, maxTotalAmount, ttlSeconds, spentSoFar } = sessionStatus;

    // Check: Payment > 80% of per-tx limit
    if (maxAmountPerTx && BigInt(amountWei) > (BigInt(maxAmountPerTx) * 80n / 100n)) {
      flags.push({
        level: 'MEDIUM',
        reason: `Payment exceeds 80% of session per-transaction limit (${ethers.formatUnits(maxAmountPerTx, 18)} tokens)`
      });
    }

    // Check: Session total > 80% of total budget
    const sessionSpending = getSessionSpending(sessionId);
    const totalSpentWei = BigInt(sessionSpending.totalWei) + BigInt(amountWei);
    if (maxTotalAmount && totalSpentWei > (BigInt(maxTotalAmount) * 80n / 100n)) {
      flags.push({
        level: 'MEDIUM',
        reason: `Session spending near budget limit (${ethers.formatUnits(maxTotalAmount, 18)} tokens)`
      });
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
```

**Note:** If a legitimate service contains these words, the threshold is tunable via `URGENCY_KEYWORDS` env override. Document in README.

**First-Action Session Anomaly:** If `COUNT(actions WHERE sessionId)` = 0 and `amountWei` > 5 tokens, flag MEDIUM.

---

## 13. Full Response Shape

```json
{
  "action": "APPROVE | WARN | BLOCK",
  "code": "OK | BUDGET_EXCEEDED | CRITICAL_RISK | VERIFICATION_FAILED | HALLUCINATION_RISK | SESSION_DRIFT | CONTRACT_RISK | CROSSCHAIN_RISK | BEHAVIORAL_DRIFT | DEGRADED_MODE_STRICT",
  "sensorLevel": "LOW | MEDIUM | HIGH | CRITICAL",
  "verifierAligned": true,
  "verifierAttempts": 1,
  "degraded": false,
  "explanation": "Human-readable explanation from Guide",
  "primaryConcern": "string or null",
  "flags": [
    { "level": "CRITICAL", "reason": "Payment targets a LayerZero core contract — likely misdirected" },
    { "level": "HIGH", "reason": "Session intent drift: authorized for 'DeFi yield data', attempting 'layerzero-relay'" },
    { "level": "HIGH", "reason": "Recipient contract is unverified" },
    { "level": "MEDIUM", "reason": "Unusual amount: 312σ from 7-day average" }
  ],
  "oracleWarning": null
}
```

---

## 14. MCP Tool Input Validation

```javascript
function validateInput({ payTo, amountWei, resource, agentAddress }) {
  if (!ethers.isAddress(payTo)) throw new Error('Invalid payTo address');
  if (!/^\d+$/.test(amountWei)) throw new Error('Invalid amountWei format');
  if (BigInt(amountWei) === 0n) throw new Error('Zero-value payment');
  const url = new URL(resource);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('Resource must be HTTPS (localhost exempted for development)');
  }
  if (!ethers.isAddress(agentAddress)) throw new Error('Invalid agentAddress');
}
```

---

## 15. Kite-Specific Constants

Taken directly from official Kite docs. Do not change.

```javascript
const KITE_TESTNET = {
  chainId: 2368,
  rpcUrl: 'https://rpc-testnet.gokite.ai',
  bundlerUrl: 'https://bundler-service.staging.gokite.ai/rpc/',
  settlementToken: '0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63', // 18 decimals
  settlementContract: '0x8d9FaD78d5Ce247aA01C140798B9558fd64a63E3',
  vaultImpl: '0xB5AAFCC6DD4DFc2B80fb8BCcf406E1a2Fd559e23',
  facilitatorAddress: '0x12343e649e6b2b2b77649DFAb88f103c02F3C78b',
  facilitatorUrl: 'https://facilitator.pieverse.io',
  installUrl: 'https://agentpassport.ai/install.sh' // live URL, not a placeholder
};

// Kite Mainnet LayerZero (from official docs)
const KITE_MAINNET_LZ = {
  chainId: 2366,
  endpointId: 30406, // eid ≠ chainId
  endpointV2: '0x6F475642a6e85809B1c36Fa62763669b1b48DD5B',
  executor:   '0x4208D6E27538189bB48E603D6123A94b8Abe0A0b',
};
```

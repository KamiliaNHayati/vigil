# PRD — Vigil: AI Agent Security Harness for Kite Agent Passport

> **Revision note (v2):** Incorporates UI requirement fix (dashboard + CLI moved to P0), multi-transport MCP architecture, session intent drift detection, threat-informed recipient contract risk scoring, behavioral drift detection, degraded/sensor-only fallback mode, and local SQLite store for rate limit history. Prior revision corrected: Helius removal, 18-decimal fix, SDK usage, interception model redesign.

---

## 1. Problem Statement

Kite Agent Passport lets AI agents discover and pay for services autonomously. Users approve sessions — budgeted, time-limited authorizations — via passkey. Within an approved session, agents operate without further human review.

This creates three distinct trust gaps:

**Gap 1 — Payment-level risk:** The user approves a session for "DeFi yield research, max $2/tx" but has no visibility into the specific payment the agent is about to make within that session. A confused LLM or malicious service can drain the budget before anyone notices.

**Gap 2 — Session intent drift:** The agent was authorized to query DeFi yield analytics. After session creation, it gets compromised and tries to call a completely different service. Kite's spending rules don't check *what the agent was authorized to do* — only *how much*.

**Gap 3 — Contract-level threats:** The agent's payment target might be an unverified, previously exploited, or maliciously crafted contract. Amount and recipient checks alone don't catch this. Analysis of recent 2025–2026 DeFi protocol hacks (source: DeFiHackLabs on GitHub) shows arbitrary-call vulnerabilities and unaudited contracts are two of the most relevant attack classes for on-chain agent payments.

Vigil closes all three gaps through a multi-layer harness that agents consult before every payment.

---

## 2. Positioning: Vigil + Kite SPACE Framework

Kite defines five core pillars in its SPACE framework:

| Pillar | Kite's Contribution | Vigil's Contribution |
|--------|--------------------|---------------------------------|
| **S**tablecoin-native | Sub-cent gas, testnet stablecoin | N/A (uses existing infrastructure) |
| **P**rogrammable constraints | AA SDK spending rules per vault | Dynamic risk-based rules on top of session budgets |
| **A**gent-first authentication | Hierarchical wallets, BIP-32 agent keys | Per-agent reputation scoring enriching trust signals |
| **C**ompliance-ready | Immutable audit trails | Trace anchoring + structured risk reports per transaction |
| **E**conomically viable micropayments | State channels, sub-cent fees | N/A |

Vigil primarily enhances **P** and **C**. One-liner:
> *"Kite Agent Passport lets agents pay. Vigil makes sure they should — with recursive verification, on-chain reputation, and semantic risk analysis."*

---

## 3. Target Users

**Primary:** Developers and power users running AI agents (Claude Code, Cursor, Codex) with Kite Agent Passport who want to monitor and gate what their agents actually pay for.

**Secondary:** Service providers who want to signal trustworthiness to agents (verified in the Kite catalog via `ksearch`).

---

## 4. How Vigil Integrates with Real Kite Passport Flow

The actual Kite Passport payment flow is:

```
1. Agent discovers service via ksearch
2. Agent creates session: kpass agent:session create (user approves via passkey)
3. Agent executes paid request: kpass agent:session execute --url <service>
4. Kite handles x402 flow: service returns 402 → agent gets signed token → service settles via facilitator
```

Vigil inserts between steps 2 and 3 as an **MCP tool** and **pre-execution wrapper**:

```
1. Agent discovers service via ksearch
2. Agent creates session (unchanged)
3. [NEW] Agent calls Vigil MCP tool: evaluate_payment
   → Sensor + Guide + Verifier loop runs
   → Returns: APPROVE / WARN / BLOCK with explanation
4. If APPROVED: Agent calls kpass agent:session execute (unchanged)
5. [NEW] After execution: Agent calls Vigil MCP tool: record_outcome
   → AgentRegistry.sol updated on-chain
```

This means Vigil does **not** need to intercept Kite's signing internals. It operates as an advisory + enforcement layer that agents consult, making it compatible with any Kite-based agent regardless of implementation.

---

## 5. Feature Scope (Hackathon — 4 Weeks)

### MVP (Weeks 1–3) — Required for Submission

| Feature | Description | Priority | Notes |
|---------|-------------|----------|-------|
| **CLI Tool** | `vigil evaluate --pay-to ... --amount ... --resource ...` with color-coded output | **P0** | Satisfies "Functional UI" judging criterion immediately |
| **Web Dashboard** | Single-page Next.js app: evaluation feed, agent reputation lookup, risk badges, auto-refresh (5s poll) | **P0** | Auto-refresh is 30 min of work (`setInterval` or `useSWR`) — ship it |
| Multi-transport MCP Server | Expose tools via stdio (Claude Code/Cursor), Streamable HTTP (web apps), SSE (browser), REST wrapper | **P0** | One core, four interfaces |
| Sensor Engine | Amount, recipient catalog check, rate limiting, trust tier modifier | P0 | 18-decimal math throughout |
| **Session Intent Drift** | Hash session `--task-summary` on creation; semantic diff against payment `resource` at evaluation time | **P0** | Closes the biggest gap no other project will have |
| **Recipient Contract Risk** | Check exploit DB, trusted protocol list, source verification (demo mock — no live Kite explorer API yet) | **P0** | Exploit DB check is real; source verification is conservative mock that flags unknowns HIGH |
| **Cross-Chain Risk (LayerZero)** | Flag payments to LZ core contracts, unrecognised OFTs, cross-chain keyword URLs | **P1** | Uses Kite's native LayerZero v2 integration; addresses cross-chain opacity gap |
| Guide Engine | LLM explanation via OpenRouter `gemini-2.0-flash-lite` | P0 | Structured output, ≤2 sentences |
| **Degraded Mode** | If LLM unavailable: sensor-only decision, block anything MEDIUM+ | **P0** | Required for production credibility |
| Verification Loop | Semantic alignment check; retry once; hallucination-risk fast-path block | P0 | Core differentiator |
| AgentRegistry.sol | On-chain per-agent reputation, circular-buffer trace hashes | P1 | `traceHash` in `recordAction` is a timestamped on-chain commitment — it proves Vigil evaluated this payment at this time, creating an audit trail. It is not a cryptographic attestation of data validity. |
| **Behavioral Drift Detection** | 7-day rolling average per agent; flag 3σ deviations in amount/category | **P1** | Addresses private key compromise + social engineering class |
| SQLite Local Store | Rate limit history, session intent hashes, agent action log, behavioral baseline | P0 | In-process, no external DB needed for demo |
| ksearch Catalog Client | Dynamic recipient trust check; static fallback list if endpoint unavailable | P0 | Smoke test in `/scripts/` |
| **Oracle Sanity Hook** | In `record_outcome`: if `traceData.apy > 50%` → dashboard warning | **P1** | Stub: ~2 hours. Shows lifecycle thinking beyond pre-payment gating |
| **Service Provider Trust Scores** | Static trust score JSON for catalog services; shown in dashboard "Service Trust" column | **P1** | Demonstrates architecture readiness; no second contract needed for hackathon |
| **Demo DeFi Agent** | Autonomously discovers paid yield analytics services via ksearch, calls Vigil `evaluate_payment` for each, executes approved payments, and compiles results into a yield report. In the attack scenario, it is hijacked via prompt injection to attempt a cross-chain relay drain — and gets blocked at all four gap layers simultaneously. | P1 | Without this, Vigil is infrastructure around nothing |

> **No Post-MVP list.** Every feature above ships within the 4-week window. P0 = must-have for a working demo. P1 = ships by week 4 or is convincingly demonstrated as a stub that proves architectural readiness.

---

## 6. Problem Statement — Four Gaps (Updated)

Vigil closes four distinct trust gaps that Kite Passport's spending rules alone cannot address:

| Gap | Description | Vigil Response |
|-----|-------------|--------------------------|
| **Payment-level risk** | Agent pays the wrong amount/recipient within a session | Sensor + Guide + Verifier loop |
| **Session intent drift** | Agent authorized for DeFi yield data, attempts unrelated service after compromise | Session intent hash + semantic diff |
| **Contract-level threats** | Payment target is unaudited or exploited contract | Recipient Contract Risk module |
| **Cross-chain opacity** | Payment targets a LayerZero OFT or relay, carrying funds off Kite without review | LayerZero Cross-Chain Risk module |



- Intercepting Kite Passport's internal signing (not architecturally feasible without forking Passport)
- Mainnet deployment (testnet only)
- ZK proofs
- State channels (not yet exposed in AA SDK)
- Mobile app
- A full on-chain service reputation contract (static JSON trust scores demonstrate the architecture)

---

## 7. Cost Budget

| Item | Cost | Notes |
|------|------|-------|
| Kite testnet gas | $0 | Covered by testnet |
| Testnet stablecoin | $0 | `kpass faucet drop` |
| DeepSeek API (analysis) | ~$0.10 | ~100 calls × 150 tokens at $0.28/M out |
| Grok API (threat intel) | ~$0.05 | ~20 calls × 200 tokens at $0.50/M out |
| Hosting (Vercel/Railway free tier) | $0 | |
| **Total** | **~$0.15** | |

---

## 8. Build Order (4 Weeks)

| Week | Focus | Ships By End of Week |
|------|-------|----------------------|
| 1 | Kite setup + AgentRegistry deploy + SQLite store + ksearch smoke test | Contract live, faucet funded, catalog queries working, rate-limit DB ready |
| 2 | Full Sensor (amount + catalog + rate limit + contract risk + cross-chain risk + session drift + behavioral drift) + Degraded mode | Complete risk report for all 4 gap scenarios; LLM fallback tested |
| 3 | Guide + Verifier + Multi-transport MCP server + CLI tool + Oracle sanity hook + Demo Research Agent | End-to-end agent flow; all four transports; CLI color output; oracle warning in dashboard |
| 4 | Dashboard (feed + reputation + service trust column + auto-refresh) + demo script + README + seed data | Full polished demo: attack chain → BLOCK at every layer, safe path → APPROVE |

---

## 9. Autonomy Framing (Critical for Judges)

The judging criterion says "Agent Autonomy — minimal human involvement." Vigil *enables* confident autonomy, not restricted autonomy.

> "95% of normal agent payments are APPROVED in under 3 seconds with zero human interaction. Vigil runs silently. Only genuine anomalies surface for review: a $500 drain to an unknown address, a service outside the agent's authorized scope, a contract from a known exploit, a cross-chain relay carrying funds off Kite without review. That is the confidence that makes the remaining 95% safe to run fully autonomously. Even as agents expand to cross-chain payments via Kite's native LayerZero integration, every transaction stays inside transparent safety boundaries."

---

## 10. Success Metrics

- CRITICAL payment → BLOCK with coherent explanation in <3s
- Session intent drift → HIGH flag without any amount/recipient trigger
- Unverified contract → HIGH/CRITICAL from contract risk module
- LayerZero core contract targeted → CRITICAL from cross-chain module
- LLM down → degraded mode auto-blocks MEDIUM+
- Guide ALIGNED by Verifier on both safe and attack paths
- Oracle sanity: `apy > 50` in `record_outcome` → dashboard warning visible
- `AgentRegistry.sol` on Kite testnet: `traceHash` stored = timestamped commitment proving Vigil evaluated this payment (not a cryptographic attestation of data validity)
- CLI `vigil evaluate` → color-coded APPROVE/WARN/BLOCK in terminal, exits 1 on BLOCK
- Dashboard live at public Vercel URL, auto-refreshing every 5 seconds
- Judge can follow the full loop in 60 seconds from README



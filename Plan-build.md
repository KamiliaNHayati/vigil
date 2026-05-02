### WHAT'S ALREADY DONE

- ✅ Architecture designed (multi-transport MCP server, 10 sensor rules, verification loop)
- ✅ Rules specified (amount thresholds, rate limits, contract risk, cross-chain, behavioral drift, etc.)
- ✅ All 30 implementation gaps identified and documented
- ✅ Real Kite testnet data collected (contract addresses, x402 response format, services)
- ✅ Code stubs generated for all modules

### WHAT YOU NEED TO BUILD

Working Node.js backend with:
- MCP server (stdio/HTTP/SSE/REST transports)
- Sensor engine (10 rule modules)
- Guide engine (LLM explanation via OpenRouter)
- Verifier (alignment check with retry)
- Policy enforcer (decision + vault budget check)
- SQLite store (actions, session intents, baselines)
- CLI tool (`vigil evaluate`)
- Demo agent (DeFi yield research agent)
- Next.js dashboard (evaluation feed, reputation, auto-refresh)

---

## DELIVERABLE 1: Day-by-Day Build Schedule (Days 1-10)

Create a granular day-by-day schedule. Use the 4-week build order from Architecture.md §8 but compress to **10 aggressive days** (with buffer through May 17). Each day must have:
- Specific tasks (not vague "work on sensor")
- Deliverables (what's done by end of day)
- Deadline (hard cutoff)
- Cut criteria (what to drop if behind)

| Day | Date | Theme | Tasks | Deliverables | Cut If Behind |
|-----|------|-------|-------|--------------|---------------|
| 1 | May 2 | Foundation | ... | ... | ... |
| ... | ... | ... | ... | ... | ... |

**Reference:** Architecture.md §8 Build Order:
- Week 1: Kite setup + AgentRegistry deploy + SQLite store + ksearch smoke test
- Week 2: Full Sensor (7 modules) + Guide + Verifier + Degraded mode
- Week 3: Multi-transport MCP + CLI + Oracle hook + Demo agent
- Week 4: Dashboard + demo script + README + seed data

---

## DELIVERABLE 2: Progress Tracking Checklist

Create a markdown table with these columns:
- Feature/component name
- Priority (P0/P1 from PRD §5)
- Status (Not Started / In Progress / Done / Blocked)
- Owner (always "Solo Dev")
- Estimated hours
- Dependencies (what must finish first)
- Verification criteria (specific test proving it's done)

**Reference:** PRD §5 Feature Table for the full feature list.

---

## DELIVERABLE 3: Risk/Mitigation Table

Identify what could derail the 10-day schedule and how to handle it:

| Risk | Likelihood | Impact | Mitigation | Contingency |
|------|-----------|--------|------------|-------------|
| ... | ... | ... | ... | ... |

**Known risks from previous analysis:**
- Kite testnet MCP `discover_services` not live (fallback only)
- OpenRouter API downtime (degraded mode exists but needs testing)
- AgentRegistry.sol deployment complexity (on-chain write commented out)
- Next.js dashboard scope creep (keep it single-page)
- x402 payment execution requires real kpass CLI + funded wallet

---

## CONSTRAINTS

- **Solo developer** — no team, no outsourcing
- **Node.js 18+** — `fetch` is native, no `node-fetch`
- **Kite testnet only** — mainnet addresses are blocklist references only
- **OpenRouter credit** — ~$0.015 budget, but have backup API key
- **Vercel free tier** — for dashboard hosting
- **SQLite in-process** — no external DB

---

## SUCCESS CRITERIA (from PRD §10) (it's okay if u want to change or add)

Must all be true by May 17:
- [ ] CRITICAL payment → BLOCK with coherent explanation in <3s
- [ ] Session intent drift → HIGH flag without amount/recipient trigger
- [ ] Unverified contract → HIGH/CRITICAL from contract risk module
- [ ] LayerZero core contract → CRITICAL from cross-chain module
- [ ] LLM down → degraded mode auto-blocks MEDIUM+
- [ ] Guide ALIGNED by Verifier on both safe and attack paths
- [ ] Oracle sanity: `apy > 50` → dashboard warning visible
- [ ] AgentRegistry.sol on Kite testnet with traceHash stored
- [ ] CLI `vigil evaluate` → color-coded output, exits 1 on BLOCK
- [ ] Dashboard live at public URL, auto-refreshing every 5s
- [ ] Judge can follow full loop in 60 seconds from README

---

"use client";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState } from "react";

const NAV = [
  { id: "quickstart", label: "Quick Start", icon: "rocket_launch" },
  { id: "architecture", label: "Architecture", icon: "account_tree" },
  { id: "mcp-tools", label: "MCP Tools", icon: "terminal" },
  { id: "sensor-rules", label: "Sensor Rules (16)", icon: "radar" },
  { id: "policy", label: "Policy Engine", icon: "policy" },
  { id: "trust-tiers", label: "Trust Tiers", icon: "verified" },
  { id: "auth-flow", label: "Wallet Auth Flow", icon: "key" },
  { id: "rest-api", label: "REST API Reference", icon: "api" },
];

const RULES = [
  { id: "01", name: "Amount Thresholds", cat: "Amount & Budget", flags: ["MEDIUM (>10 tokens)", "HIGH (>100 tokens)", "CRITICAL (>1000 tokens)"], detail: "Uses 18-decimal BigInt arithmetic. Also checks a rolling 24h spend cap: >50 medium, >100 high, >500 critical." },
  { id: "02", name: "Ksearch Catalog (payTo)", cat: "Recipient Trust", flags: ["HIGH: recipient not in Kite catalog", "CRITICAL: payTo mismatch vs catalog"], detail: "Queries the live Kite MCP service catalog. If the recipient address differs from the catalog's registered payTo for that service URL, a CRITICAL flag is raised." },
  { id: "03", name: "Typosquatting Detection", cat: "Recipient Trust", flags: ["HIGH: URL resembles known service (Levenshtein ≤2)"], detail: "Compares the resource URL hostname against all catalog entries using Levenshtein distance." },
  { id: "04", name: "Rate Limiting", cat: "Amount & Budget", flags: ["MEDIUM (>10 tx/hr)", "HIGH (>20 tx/hr)", "CRITICAL (>50 tx/hr)"], detail: "The database (Supabase) 1-hour sliding window. Also detects duplicate payments: same recipient + amount + service within 1 hour." },
  { id: "05", name: "Contract Risk", cat: "Contract Safety", flags: ["CRITICAL: contract in exploit DB", "HIGH: unverified source"], detail: "Checks the payTo contract against a known exploit database and verifies source code on-chain." },
  { id: "06", name: "Cross-Chain Risk", cat: "Cross-Chain", flags: ["HIGH: LayerZero blocklisted address", "MEDIUM: OFT bridge keywords in URL"], detail: "Checks against the LayerZero Core Contracts blocklist and scans resource URLs for cross-chain bridge keywords." },
  { id: "07", name: "Session Intent Drift", cat: "Agent Behaviour", flags: ["HIGH: LLM detects semantic drift", "MEDIUM: keyword mismatch"], detail: "Compares the resource being paid against the agent's declared session intent using LLM semantic analysis." },
  { id: "08", name: "Context Anomaly", cat: "Agent Behaviour", flags: ["HIGH: spending near vault limit", "MEDIUM: TTL violation", "HIGH: urgency in context"], detail: "Detects spending proximity to vault limits, TTL-based session violations, and urgency manipulation patterns." },
  { id: "09", name: "Behavioral Drift (3σ)", cat: "Agent Behaviour", flags: ["HIGH: amount >3 standard deviations"], detail: "Statistical analysis of the agent's historical transaction amounts. Flags transactions significantly above the agent's normal spending pattern." },
  { id: "10", name: "Urgency Keywords", cat: "Agent Behaviour", flags: ["HIGH/MEDIUM: 150+ keywords in URL"], detail: "Scans resource URLs for 150+ urgency, social-engineering, action-imperative, and trust-claim keywords." },
  { id: "11", name: "On-Chain Trust Tier", cat: "Recipient Trust", flags: ["Tier ≥2 reduces severity by 1 level"], detail: "Queries AgentRegistry.sol getTrustTier(). Trusted agents benefit from automatic severity reduction." },
  { id: "12", name: "Threat Intel (Grok)", cat: "Threat Intel", flags: ["HIGH: active threat detected"], detail: "Uses Grok via OpenRouter to run real-time threat intelligence queries on the payee address and resource URL." },
  { id: "13", name: "Self-Payment Detection", cat: "Recipient Trust", flags: ["HIGH: payment targets agent, vault, or settlement contract"], detail: "Prevents agents from paying themselves, their vault, or core system contracts." },
  { id: "14", name: "IP / Geolocation", cat: "Phishing & Social Eng.", flags: ["HIGH: high-risk jurisdiction IP"], detail: "Resolves the resource hostname to an IP and checks against a blocklist of high-risk geographic zones." },
  { id: "15", name: "Domain Reputation", cat: "Phishing & Social Eng.", flags: ["CRITICAL: known malicious domain"], detail: "Checks against a curated local malicious-domains.json database plus external reputation signals." },
  { id: "16", name: "TLS Certificate", cat: "Phishing & Social Eng.", flags: ["HIGH: invalid or expired TLS cert"], detail: "Validates TLS certificate validity and chain integrity for all non-localhost service URLs." },
  { id: "bonus", name: "Oracle Integrity (Pre-Pay)", cat: "Data & Oracle Integrity", flags: ["HIGH: oracle data anomaly detected"], detail: "Pre-payment oracle sanity check — validates data quality and integrity before authorizing execution." },
];

// Helper to colorize flags dynamically based on text
const getFlagStyle = (flagText) => {
  if (flagText.includes("CRITICAL")) return "text-error border-error/30 bg-error/10";
  if (flagText.includes("HIGH")) return "text-orange-400 border-orange-400/30 bg-orange-400/10";
  return "text-tertiary border-tertiary/30 bg-tertiary/10";
};

function CodeBlock({ label, children }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    if (typeof children === "string") {
      navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-[#0a0c10] border border-outline-variant/50 rounded-xl overflow-hidden shadow-lg mb-6 relative group">
      {/* Decorative window controls for code blocks */}
      <div className="bg-[#1c212b] border-b border-[#30363d] px-4 py-2.5 flex justify-between items-center relative z-10">
        <div className="flex gap-2 items-center">
          <div className="flex gap-1.5 mr-3">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>
          {label && <span className="font-code-snippet text-[11px] text-[#8b949e] font-bold tracking-widest uppercase">{label}</span>}
        </div>
        <button onClick={handleCopy} className="flex items-center justify-center p-1 rounded hover:bg-white/10 transition-colors">
          <span className={`material-symbols-outlined text-[16px] transition-colors ${copied ? "text-secondary" : "text-[#8b949e] group-hover:text-primary"}`}>
            {copied ? "check" : "content_copy"}
          </span>
        </button>
      </div>
      <div className="p-5 overflow-x-auto code-block-scroll relative z-10">
        <pre className="font-code-snippet text-[13px] text-[#c9d1d9] leading-relaxed">{children}</pre>
      </div>
    </div>
  );
}

function Section({ id, title, icon, children }) {
  return (
    <section id={id} className="space-y-6 scroll-mt-24 pt-4">
      <h2 className="font-black text-2xl md:text-3xl text-on-surface flex items-center gap-3 border-b border-outline-variant/30 pb-4">
        <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center border border-outline-variant/50 shadow-sm shrink-0">
          <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
        </div>
        {title}
      </h2>
      <div className="text-on-surface-variant leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function DocsPage() {
  const [active, setActive] = useState("quickstart");
  
  return (
    <>
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-surface-container-lowest">
        <div className="absolute inset-0 ambient-glow-blue opacity-40" /><div className="absolute inset-0 ambient-glow-teal opacity-30" />
        <div className="absolute inset-0 bg-grid opacity-20" />
      </div>
      
      <header className="w-full bg-surface/80 backdrop-blur-md sticky top-0 z-50 border-b border-outline-variant/50 shadow-sm">
        <div className="flex justify-between items-center w-full px-6 h-16 max-w-full mx-auto">
          <div className="flex items-center gap-2">
            <img src="/vigil.svg" alt="Vigil Logo" className="h-10 w-10 object-contain" />
            <span className="text-xl font-bold text-on-surface tracking-tight">Vigil</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/" className="text-on-surface-variant hover:text-on-surface transition-colors text-sm font-semibold">Home</Link>
            <Link href="/features" className="text-on-surface-variant hover:text-on-surface transition-colors text-sm font-semibold">Features</Link>
            <Link href="/dashboard" className="text-on-surface-variant hover:text-on-surface transition-colors text-sm font-semibold">Dashboard</Link>
            <Link href="/docs" className="text-primary font-bold text-sm">Docs</Link>
          </nav>
          <ConnectButton chainStatus="icon" showBalance={false} />
        </div>
      </header>

      <div className="flex-1 flex relative z-10 max-h-[calc(100vh-64px)]" style={{ height: "calc(100vh - 64px)" }}>
        
        {/* Sidebar Navigation */}
        <aside className="w-72 bg-surface/80 backdrop-blur-md border-r border-outline-variant/50 flex flex-col pt-8 overflow-y-auto hidden lg:flex shrink-0">
          <div className="px-6 mb-8">
            <div className="inline-flex items-center gap-2 px-2 py-1 rounded bg-surface border border-outline-variant/50 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
              <span className="text-[9px] font-bold text-on-surface-variant font-code-snippet tracking-widest uppercase">API v1.0.4</span>
            </div>
            <h2 className="font-black text-on-surface text-xl tracking-tight">Documentation</h2>
            <p className="text-on-surface-variant text-xs mt-1">Vigil Security Harness</p>
          </div>
          <nav className="flex flex-col gap-1.5 flex-1 px-4">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} onClick={() => setActive(n.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-xs font-bold tracking-wider relative overflow-hidden group ${active === n.id ? "bg-primary/10 text-primary border border-primary/20" : "text-on-surface-variant border border-transparent hover:bg-surface hover:text-on-surface hover:border-outline-variant/50"}`}>
                <span className={`material-symbols-outlined text-[18px] ${active === n.id ? "text-primary" : "text-outline group-hover:text-primary transition-colors"}`}>{n.icon}</span>
                {n.label}
                {active === n.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
              </a>
            ))}
          </nav>
          <div className="p-6 border-t border-outline-variant/50 bg-surface-container-lowest/50 mt-4 pb-8">
            <a href="https://github.com/KamiliaNHayati/vigil" className="flex items-center justify-center gap-2 text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/20 px-4 py-3 rounded-xl border border-outline-variant/50 transition-colors font-semibold">
              <span className="material-symbols-outlined text-[16px]">code</span> View on GitHub
            </a>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto px-6 py-12 md:px-12 lg:px-20 pb-32 scroll-smooth">
          <div className="max-w-4xl mx-auto space-y-24">
            
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-[10px] font-code-snippet text-primary font-bold tracking-widest uppercase">
              <span>Vigil Hub</span><span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="text-outline">Technical Reference</span>
            </div>

            {/* Quick Start */}
            <Section id="quickstart" title="Quick Start" icon="rocket_launch">
              <p className="mb-6">You don't need to run Vigil locally. You simply point your agent's MCP client to our deployed server network.</p>
              
              <div className="bg-surface-container-low border border-outline-variant/50 p-6 rounded-2xl mb-8 shadow-sm">
                <h3 className="font-bold text-lg mb-4 text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">route</span>
                  Integration Lifecycle
                </h3>
                <ol className="space-y-4 text-sm text-on-surface-variant list-decimal list-inside marker:text-primary marker:font-bold">
                  <li><span className="text-on-surface font-medium">Discovery:</span> Agent discovers a paid service via <code className="font-code-snippet text-primary bg-primary/10 px-1.5 py-0.5 rounded">ksearch</code>.</li>
                  <li><span className="text-on-surface font-medium">Evaluation:</span> Agent calls <code className="font-code-snippet text-primary bg-primary/10 px-1.5 py-0.5 rounded">evaluate_payment</code> — MCP routes this to the Vigil server.</li>
                  <li><span className="text-on-surface font-medium">Processing:</span> Vigil runs the 16-rule pipeline and returns APPROVE / WARN / BLOCK.</li>
                  <li><span className="text-on-surface font-medium">Execution:</span> If approved, the agent calls <code className="font-code-snippet text-primary bg-primary/10 px-1.5 py-0.5 rounded">kpass agent:session execute</code>.</li>
                </ol>
              </div>

              <h3 className="font-bold text-lg mb-3 text-on-surface">Add Vigil to your MCP Client</h3>
              <p className="text-sm mb-4">Add a single entry to your MCP configuration JSON (Claude Desktop, Cursor, etc.):</p>
              
              <CodeBlock label="mcp.json (Claude Desktop / Cursor)">
{`{
  "mcpServers": {
    "vigil": {
      "url": "https://vigil-backend.railway.app/mcp"
    }
  }
}`}
              </CodeBlock>
              
              <p className="text-sm mt-6 mb-4">Or use the CLI command if supported by your environment. The agent passes its address as an argument when calling the tool automatically.</p>
              
              <CodeBlock label="Claude Code CLI">
{`claude mcp add vigil https://vigil-backend.railway.app/mcp`}
              </CodeBlock>
              
              <div className="mt-8 bg-secondary/10 border border-secondary/20 p-5 rounded-2xl flex items-start gap-4 shadow-sm">
                <div className="bg-secondary/20 p-1.5 rounded-full shrink-0">
                  <span className="material-symbols-outlined text-secondary text-[20px]">check_circle</span>
                </div>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  <strong className="text-on-surface text-base">That's it. No clone. No install. No .env variables.</strong><br/>
                  Your agent now has <code className="font-code-snippet text-secondary">evaluate_payment</code>, <code className="font-code-snippet text-secondary">record_outcome</code>, and <code className="font-code-snippet text-secondary">get_reputation</code> available as native tools over HTTP.
                </p>
              </div>
            </Section>

            {/* Architecture */}
            <Section id="architecture" title="Architecture Overview" icon="account_tree">
              <p className="mb-4">Vigil utilizes a 4-stage sequential security pipeline. Every stage must pass before the next begins. The result of all stages is aggregated into a final policy decision.</p>
              <div className="bg-primary/5 border-l-4 border-primary p-4 rounded-r-xl mb-8">
                <p className="text-sm leading-relaxed">The evaluation feed and detailed risk reports are stored off‑chain in Supabase for performance and cost efficiency, while the immutable on‑chain reputation is anchored in <code className="font-code-snippet">AgentRegistry.sol</code>. Off‑chain data is accessed only after cryptographic wallet signature verification.</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                {[
                  { n: "1", name: "Sensor", col: "text-primary", border: "border-primary/30", bg: "bg-surface", desc: "16 deterministic rules run in parallel. Output: severity level + flags[]." },
                  { n: "2", name: "Guide", col: "text-amber-400", border: "border-amber-400/30", bg: "bg-surface", desc: "LLM (Grok via OpenRouter) explains the risk. Degrades gracefully if offline." },
                  { n: "3", name: "Verifier", col: "text-secondary", border: "border-secondary/30", bg: "bg-surface", desc: "Checks alignment between sensor flags and LLM explanation. Fails closed." },
                  { n: "4", name: "Policy", col: "text-tertiary", border: "border-tertiary/30", bg: "bg-surface", desc: "Final decision matrix: APPROVE / WARN / BLOCK / CRITICAL_BLOCK." },
                ].map(s => (
                  <div key={s.n} className={`rounded-2xl border ${s.border} p-5 ${s.bg} shadow-sm relative overflow-hidden group`}>
                    <div className={`absolute top-0 right-0 w-16 h-16 opacity-5 translate-x-4 -translate-y-4 rounded-full bg-current ${s.col}`} />
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black bg-current/10 ${s.col}`}>{s.n}</div>
                      <div className={`font-bold ${s.col}`}>{s.name}</div>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* MCP Tools */}
            <Section id="mcp-tools" title="MCP Tools" icon="terminal">
              <p className="mb-6">Vigil exposes 3 core MCP tools callable from Claude Code, Cursor, or any MCP-compatible autonomous agent runtime.</p>
              <div className="space-y-10">
                {[
                  { name: "evaluate_payment", badge: "Primary Function", desc: "Pre-flight risk evaluation for a payment intent. Returns the final action, severity level, specific risk flags, explanation, and a breakdown of sensor module activity.",
                    code: `const result = await evaluate_payment({
  agentAddress: "0xYourAgent",
  payTo: "0xRecipient",
  amountWei: "1000000000000000000",  // 1.0 token (18 dec)
  resource: "https://api.service.com/task",
  sessionId: "sess_abc123",          // optional
  vaultAddress: "0xYourVault"        // optional
});

// Returns:
// result.action: "APPROVE" | "WARN" | "BLOCK" | "CRITICAL_BLOCK"
// result.sensorLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
// result.flags: [{ level: "HIGH", reason: "Exploit DB match" }]
// result.pipelineElapsedMs: 420` },
                  { name: "record_outcome", badge: "Post-Flight", desc: "Records the final execution outcome after a transaction. This is critical for model training and maintaining accurate on-chain AgentRegistry reputation.",
                    code: `await record_outcome({
  agentAddress: "0xYourAgent",
  success: true,
  riskLevel: "LOW",
  traceData: JSON.stringify({ txHash: "0xabc...", amount: "1.0" }),
  vaultAddress: "0xYourVault",
  sessionId: "sess_abc123"
});

// Action: Writes telemetry to Supabase + commits state to AgentRegistry.sol` },
                  { name: "get_reputation", badge: "Read-Only", desc: "Fetches an agent's on-chain reputation and trust tier directly from AgentRegistry.sol.",
                    code: `const rep = await get_reputation({ agentAddress: "0xYourAgent" });

// Returns:
// rep.trustTier: 0 | 1 | 2 | 3
// rep.successRate: 0.985
// rep.totalTransactions: 142` },
                ].map(t => (
                  <div key={t.name} className="relative">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="font-code-snippet font-bold text-primary text-lg">{t.name}</h3>
                      <span className="text-[9px] text-outline font-bold border border-outline-variant/50 px-2 py-0.5 rounded tracking-widest uppercase">{t.badge}</span>
                    </div>
                    <p className="text-sm text-on-surface-variant mb-4">{t.desc}</p>
                    <CodeBlock>{t.code}</CodeBlock>
                  </div>
                ))}
              </div>
            </Section>

            {/* Sensor Rules */}
            <Section id="sensor-rules" title="Sensor Rules Reference (16+)" icon="radar">
              <p className="mb-6">All rules execute in parallel during Stage 1. The final severity is calculated as the maximum severity across all flagged rules, minus any reductions granted by the agent's Trust Tier.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {RULES.map(r => (
                  <div key={r.id} className="bg-surface border border-outline-variant/40 hover:border-outline-variant rounded-2xl p-6 transition-colors shadow-sm flex flex-col h-full">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-code-snippet text-[10px] text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">R{r.id}</span>
                        <span className="font-bold text-on-surface text-sm">{r.name}</span>
                      </div>
                    </div>
                    <div className="text-[9px] font-bold text-outline tracking-widest uppercase mb-2">{r.cat}</div>
                    <p className="text-xs text-on-surface-variant mb-4 flex-grow leading-relaxed">{r.detail}</p>
                    <div className="flex flex-col gap-1.5 pt-4 border-t border-outline-variant/30">
                      {r.flags.map(f => (
                        <div key={f} className={`text-[10px] font-code-snippet font-bold px-2.5 py-1.5 rounded-md border ${getFlagStyle(f)}`}>
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Policy Engine */}
            <Section id="policy" title="Policy Engine" icon="policy">
              <p className="mb-6">The Policy Engine (Stage 4) consumes the aggregated sensor level and verifier alignment to produce a deterministic final decision.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {[
                  { action: "APPROVE", col: "text-secondary", bg: "bg-surface", border: "border-secondary/30", icon: "check_circle", desc: "Sensor level LOW + Verifier aligned. A single-use capsule wallet is deployed if a vaultAddress is configured." },
                  { action: "WARN", col: "text-tertiary", bg: "bg-surface", border: "border-tertiary/30", icon: "warning", desc: "Sensor level MEDIUM or verifier needs attention. Agent should require explicit human approval before proceeding." },
                  { action: "BLOCK", col: "text-error", bg: "bg-surface", border: "border-error/30", icon: "block", desc: "Sensor level HIGH or critical flags. Transaction is denied. Event recorded to AgentRegistry." },
                  { action: "CRITICAL_BLOCK", col: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/30", icon: "cancel", desc: "Sensor level CRITICAL (e.g. exploit DB hit, payTo mismatch). Immediate halt. Security event logged." },
                ].map(a => (
                  <div key={a.action} className={`rounded-2xl border ${a.border} p-6 ${a.bg} flex items-start gap-4 shadow-sm`}>
                    <span className={`material-symbols-outlined text-[28px] ${a.col}`} style={{ fontVariationSettings: "'FILL' 1" }}>{a.icon}</span>
                    <div>
                      <div className={`font-code-snippet font-black text-lg ${a.col} mb-1 tracking-wide`}>{a.action}</div>
                      <p className="text-xs text-on-surface-variant leading-relaxed">{a.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Trust Tiers */}
            <Section id="trust-tiers" title="Trust Tier System" icon="verified">
              <p className="mb-6">AgentRegistry.sol tracks every agent's on-chain reputation. Tiers are computed dynamically from an agent's success rate and total completed transactions.</p>
              <div className="bg-surface rounded-2xl border border-outline-variant/40 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse min-w-[600px]">
                    <thead>
                      <tr className="border-b border-outline-variant/50 bg-surface-container-lowest text-[10px] text-outline uppercase tracking-widest text-left font-bold">
                        <th className="py-4 pl-6 pr-4 w-16">Level</th>
                        <th className="py-4 pr-4">Designation</th>
                        <th className="py-4 pr-4">Privilege / Reduction</th>
                        <th className="py-4 pr-6">On-Chain Requirements</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs font-medium">
                      {[
                        [0,"Unknown","None","New agent, no on-chain history", "text-outline"],
                        [1,"Registered","None","At least 1 completed evaluation", "text-tertiary"],
                        [2,"Trusted","Automatic −1 Severity Level","Proven success rate >90%, recorded on-chain", "text-secondary"],
                        [3,"Verified","Automatic −1 Level + Fast Track","High success rate + Human/KYC verification", "text-primary"],
                      ].map(([t,n,r,req,col]) => (
                        <tr key={t} className="border-b border-outline-variant/20 hover:bg-surface-variant/10 transition-colors">
                          <td className="py-4 pl-6 pr-4">
                            <div className={`w-8 h-8 rounded bg-surface border border-outline-variant/50 flex items-center justify-center font-black ${col}`}>{t}</div>
                          </td>
                          <td className={`py-4 pr-4 font-bold text-sm ${col}`}>{n}</td>
                          <td className="py-4 pr-4 text-on-surface font-code-snippet">{r}</td>
                          <td className="py-4 pr-6 text-on-surface-variant">{req}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Section>

            {/* Wallet Auth Flow */}
            <Section id="auth-flow" title="Wallet Auth Flow" icon="key">
              <p className="mb-4">The dashboard interface uses an EIP-4361 style nonce-signing challenge-response to authenticate wallet ownership before serving private evaluation telemetry.</p>
              <div className="bg-tertiary/10 border-l-4 border-tertiary p-4 rounded-r-xl mb-8 flex gap-3 items-start">
                <span className="material-symbols-outlined text-tertiary text-[20px]">info</span>
                <p className="text-xs leading-relaxed text-on-surface"><strong className="text-tertiary uppercase tracking-wider">Environment Note:</strong> The example below uses localhost. In production environments, replace the base URL with your deployed backend (e.g., Railway, Heroku).</p>
              </div>
              
              <div className="space-y-6 relative border-l border-outline-variant/50 pl-6 ml-3">
                <div className="relative">
                  <div className="absolute w-6 h-6 rounded-full bg-surface border border-outline-variant/50 flex items-center justify-center text-[10px] font-black -left-[37px] top-1 text-primary">1</div>
                  <h3 className="font-bold text-sm mb-2">Get a fresh nonce (5-min expiry)</h3>
                  <CodeBlock>
{`const { nonce, expiresAt } = await fetch(
  \`http://localhost:3001/api/auth/nonce/\${address}\`
).then(r => r.json());`}
                  </CodeBlock>
                </div>
                
                <div className="relative">
                  <div className="absolute w-6 h-6 rounded-full bg-surface border border-outline-variant/50 flex items-center justify-center text-[10px] font-black -left-[37px] top-1 text-primary">2</div>
                  <h3 className="font-bold text-sm mb-2">Sign the challenge with your wallet</h3>
                  <CodeBlock>
{`const message = \`Vigil authentication for agent \${address}. Nonce: \${nonce}\`;
const signature = await signMessageAsync({ message });`}
                  </CodeBlock>
                </div>

                <div className="relative">
                  <div className="absolute w-6 h-6 rounded-full bg-surface border border-outline-variant/50 flex items-center justify-center text-[10px] font-black -left-[37px] top-1 text-primary">3</div>
                  <h3 className="font-bold text-sm mb-2">Send signed headers to access protected data</h3>
                  <CodeBlock>
{`const res = await fetch(
  \`http://localhost:3001/api/evaluations/\${address}\`,
  { headers: { 'x-wallet-signature': signature, 'x-wallet-nonce': nonce } }
);
const { evaluations } = await res.json();`}
                  </CodeBlock>
                </div>
              </div>
            </Section>

            {/* REST API */}
            <Section id="rest-api" title="REST API Reference" icon="api">
              <div className="flex items-center gap-3 mb-6 bg-surface-container-low px-4 py-3 rounded-xl border border-outline-variant/50">
                <span className="text-sm font-bold text-on-surface-variant">Base URL</span>
                <code className="font-code-snippet bg-surface border border-outline-variant px-3 py-1 rounded text-primary text-sm shadow-sm">http://localhost:3001</code>
              </div>
              
              <div className="space-y-3">
                {[
                  { method:"POST", path:"/api/evaluate", auth:false, desc:"Run the full 4-stage pipeline on a payment intent." },
                  { method:"POST", path:"/api/record", auth:false, desc:"Record transaction outcome and write to AgentRegistry.sol." },
                  { method:"GET",  path:"/api/reputation/:address", auth:false, desc:"Get on-chain trust tier and reputation for an agent." },
                  { method:"GET",  path:"/api/evaluations", auth:false, desc:"Recent evaluation feed (public, limited fields)." },
                  { method:"GET",  path:"/api/evaluations/:address", auth:true, desc:"Agent-specific evaluations (requires wallet signature)." },
                  { method:"GET",  path:"/api/auth/nonce/:address", auth:false, desc:"Generate a fresh nonce for wallet authentication." },
                  { method:"POST", path:"/api/compose-rule", auth:false, desc:"Trigger LLM Composer to analyze blocks and propose shadow rules." },
                  { method:"GET",  path:"/api/trust/:identifier", auth:false, desc:"Get service trust score for a hostname or address." },
                  { method:"POST", path:"/api/trust/batch", auth:false, desc:"Batch trust score lookup for multiple entities." },
                  { method:"GET",  path:"/api/health", auth:false, desc:"Health check. Returns system status, timestamp, and active version." },
                ].map((e, idx) => (
                  <div key={idx} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-surface border border-outline-variant/40 hover:border-outline-variant rounded-xl transition-colors group">
                    <div className="w-16 shrink-0">
                      <span className={`font-code-snippet text-[10px] font-black px-2 py-1 rounded w-full flex justify-center tracking-widest ${e.method==="POST"?"bg-primary/10 border border-primary/20 text-primary":"bg-secondary/10 border border-secondary/20 text-secondary"}`}>
                        {e.method}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="font-code-snippet text-[13px] font-bold text-on-surface mb-1 group-hover:text-primary transition-colors">{e.path}</div>
                      <div className="text-xs text-on-surface-variant leading-relaxed">{e.desc}</div>
                    </div>
                    {e.auth && (
                      <div className="md:text-right shrink-0">
                        <span className="inline-flex items-center gap-1 text-[9px] font-code-snippet text-tertiary bg-tertiary/10 border border-tertiary/20 px-2 py-1 rounded uppercase tracking-wider">
                          <span className="material-symbols-outlined text-[12px]">lock</span> Auth Required
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
            
          </div>
        </main>
      </div>
    </>
  );
}
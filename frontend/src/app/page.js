"use client";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";

const fadeUp = { hidden: { opacity: 0, y: 40 }, show: { opacity: 1, y: 0, transition: { duration: 0.6 } } };
const stagger = { show: { transition: { staggerChildren: 0.12 } } };

const SENSOR_RULES = [
  { id: "01", name: "Amount Thresholds", cat: "Amount & Budget", icon: "paid", desc: "18-decimal BigInt checks against 10/100/1000 token thresholds with 24h rolling cap." },
  { id: "02", name: "Ksearch Catalog", cat: "Recipient Trust", icon: "travel_explore", desc: "Validates recipient against the live Kite service catalog via MCP bridge." },
  { id: "03", name: "Rate Limiting", cat: "Behaviour", icon: "speed", desc: "Database 1-hour sliding window: >10 medium, >20 high, >50 critical." },
  { id: "04", name: "Contract Risk", cat: "Contract Safety", icon: "bug_report", desc: "Exploit DB lookup and on-chain source verification for smart contract recipients." },
  { id: "05", name: "Cross-Chain Risk", cat: "Cross-Chain", icon: "swap_horiz", desc: "LayerZero blocklist and OFT token bridge risk detection." },
  { id: "06", name: "Session Intent Drift", cat: "Behaviour", icon: "track_changes", desc: "Detects semantic deviation from declared session intent using keyword + LLM checks." },
  { id: "07", name: "Context Anomaly", cat: "Behaviour", icon: "psychology_alt", desc: "Spending proximity, TTL violations, and urgency-pattern matching." },
  { id: "08", name: "Behavioral Drift", cat: "Behaviour", icon: "show_chart", desc: "3-sigma statistical analysis of agent spending patterns over time." },
  { id: "09", name: "Urgency Keywords", cat: "Phishing", icon: "warning_amber", desc: "150+ urgency/social-engineering keywords in resource URLs." },
  { id: "10", name: "On-Chain Trust Tier", cat: "Recipient Trust", icon: "verified", desc: "AgentRegistry.sol getTrustTier() — tier ≥2 reduces severity by one level." },
  { id: "11", name: "Threat Intel", cat: "Threat Intel", icon: "radar", desc: "Grok via OpenRouter: real-time threat intelligence on payee and resource." },
  { id: "12", name: "Self-Payment", cat: "Recipient Trust", icon: "loop", desc: "Detects payments targeting the agent itself, its vault, or core settlement contracts." },
  { id: "13", name: "IP / Geolocation", cat: "Phishing", icon: "location_on", desc: "Resolves resource host IP and flags high-risk jurisdictions." },
  { id: "14", name: "Domain Reputation", cat: "Phishing", icon: "domain_verification", desc: "Local malicious-domains.json + external reputation signals." },
  { id: "15", name: "TLS Certificate", cat: "Phishing", icon: "lock", desc: "Validates TLS cert validity and chain for all non-localhost service URLs." },
  { id: "16", name: "Oracle Integrity", cat: "Data Integrity", icon: "hub", desc: "Pre-payment oracle sanity checks — validates data quality before execution." },
];

const PIPELINE = [
  { key: "Sensor", icon: "sensors", color: "text-primary", border: "border-primary/30", glow: "shadow-[0_0_20px_rgba(173,198,255,0.15)]", desc: "16 deterministic rules run in parallel. Flags are aggregated into a severity level (LOW → CRITICAL)." },
  { key: "Guide", icon: "account_tree", color: "text-amber-400", border: "border-amber-400/30", glow: "shadow-[0_0_20px_rgba(251,191,36,0.15)]", desc: "LLM explanation of risk. Gracefully degrades to rule-based fallback if OpenRouter is unavailable." },
  { key: "Verifier", icon: "verified_user", color: "text-secondary", border: "border-secondary/30", glow: "shadow-[0_0_20px_rgba(78,222,163,0.15)]", desc: "Alignment check between sensor flags and LLM explanation. Retries up to 3x for consistency." },
  { key: "Policy", icon: "policy", color: "text-tertiary", border: "border-tertiary/30", glow: "shadow-[0_0_20px_rgba(255,185,95,0.15)]", desc: "Final decision engine: APPROVE / WARN / BLOCK / CRITICAL_BLOCK based on all upstream signals." },
];

function Navbar() {
  const { isConnected } = useAccount();
  return (
    <header className="w-full bg-surface/80 backdrop-blur-md sticky top-0 z-50 border-b border-outline-variant">
      <div className="flex justify-between items-center w-full px-6 h-16 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <img src="/vigil.svg" alt="Vigil Logo" className="h-10 w-10 object-contain" />
          <span className="text-2xl font-bold text-on-surface tracking-tight">Vigil</span>
        </div>
        <nav className="hidden md:flex items-center gap-8">
          <Link href="/" className="text-on-surface-variant hover:text-on-surface transition-colors font-semibold text-sm">Home</Link>
          <Link href="/features" className="text-on-surface-variant hover:text-on-surface transition-colors font-semibold text-sm">Features</Link>
          <Link href="/docs" className="text-on-surface-variant hover:text-on-surface transition-colors font-semibold text-sm">Docs</Link>
          {isConnected && <Link href="/dashboard" className="text-primary font-bold text-sm">Dashboard</Link>}
        </nav>
        <ConnectButton chainStatus="icon" showBalance={false} />
      </div>
    </header>
  );
}

export default function HomePage() {
  // 1. Group rules dynamically inside the component render
  const groupedRules = SENSOR_RULES.reduce((acc, rule) => {
    if (!acc[rule.cat]) acc[rule.cat] = [];
    acc[rule.cat].push(rule);
    return acc;
  }, {});

  return (
    <>
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 ambient-glow-blue" />
        <div className="absolute inset-0 ambient-glow-teal" />
        <div className="absolute inset-0 bg-grid" />
        <div className="absolute inset-0 particles" />
      </div>

      <Navbar />

      <main className="flex-grow flex flex-col relative z-10">
        {/* HERO */}
        <section className="px-6 py-24 md:py-36 relative min-h-screen flex items-center">
          <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div className="flex flex-col items-start" initial="hidden" animate="show" variants={stagger}>
              <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-secondary/30 bg-secondary/10 text-secondary text-xs font-bold tracking-widest uppercase mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                Live on Kite Testnet · 16 Active Rules
              </motion.div>
              <motion.h1 variants={fadeUp} className="text-[56px] md:text-[76px] font-bold text-on-surface leading-[1.05] tracking-tighter mb-6">
                The Trust Layer for{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary-container to-secondary">
                  Machine Economies.
                </span>
              </motion.h1>
              <motion.p variants={fadeUp} className="text-[18px] leading-relaxed text-on-surface-variant max-w-xl mb-8 border-l-2 border-outline-variant/30 pl-4">
                Vigil provides real-time advisory and enforcement for Kite-based agent transactions via 16 parallel sensor rules, LLM-guided risk explanation, and on-chain AgentRegistry integration.
              </motion.p>
              <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-start gap-4">
                <ConnectButton label="Connect Wallet to Start" />
                <Link href="/docs" className="flex items-center gap-2 px-6 py-3 border border-outline-variant rounded-xl text-on-surface-variant hover:text-on-surface hover:border-outline transition-colors text-sm font-semibold">
                  <span className="material-symbols-outlined text-[18px]">menu_book</span> Read Docs
                </Link>
              </motion.div>
              <motion.div variants={fadeUp} className="mt-10 pt-8 border-t border-outline-variant/20 w-full max-w-xl">
                <p className="text-xs font-bold text-outline tracking-widest uppercase mb-4">Securing transactions across</p>
                <div className="flex gap-8 items-center opacity-60 hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-2 font-bold text-on-surface"><span className="material-symbols-outlined text-[20px]">api</span> Kite</div>
                  <div className="flex items-center gap-2 font-bold text-on-surface"><span className="material-symbols-outlined text-[20px]">memory</span> MCP Agents</div>
                  <div className="flex items-center gap-2 font-bold text-on-surface"><span className="material-symbols-outlined text-[20px]">payments</span> x402</div>
                </div>
              </motion.div>
            </motion.div>

            <motion.div className="relative w-full aspect-square flex items-center justify-center" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1 }}>
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-[100px]" />
              <svg className="w-full h-full max-w-[600px] spin-container" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="pg" x1="0%" x2="100%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#adc6ff" stopOpacity="0.8" /><stop offset="100%" stopColor="#4b8eff" stopOpacity="0.2" />
                  </linearGradient>
                  <linearGradient id="sg" x1="100%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#4edea3" stopOpacity="0.6" /><stop offset="100%" stopColor="#00a572" stopOpacity="0.1" />
                  </linearGradient>
                  <filter id="glow"><feGaussianBlur result="cb" stdDeviation="4" /><feMerge><feMergeNode in="cb" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                </defs>
                <circle className="mesh-ring" cx="200" cy="200" fill="none" r="180" stroke="url(#pg)" strokeDasharray="4 8" strokeWidth="1" />
                <circle className="mesh-ring" cx="200" cy="200" fill="none" r="160" stroke="url(#sg)" strokeDasharray="10 20" strokeWidth="2" />
                <g className="mesh-ring" style={{ transformOrigin: "200px 200px" }}>
                  <polygon fill="none" points="200,40 340,120 340,280 200,360 60,280 60,120" stroke="url(#pg)" strokeWidth="1.5" />
                  <polygon fill="none" points="200,80 300,140 300,260 200,320 100,260 100,140" stroke="url(#sg)" strokeWidth="1" />
                  <line stroke="url(#pg)" strokeDasharray="4 4" strokeWidth="0.5" x1="200" x2="200" y1="40" y2="360" />
                  <line stroke="url(#pg)" strokeDasharray="4 4" strokeWidth="0.5" x1="60" x2="340" y1="120" y2="280" />
                  <line stroke="url(#pg)" strokeDasharray="4 4" strokeWidth="0.5" x1="60" x2="340" y1="280" y2="120" />
                </g>
                <circle className="animate-pulse" cx="200" cy="200" fill="url(#pg)" filter="url(#glow)" r="40" />
                <circle cx="200" cy="200" fill="#ffffff" opacity="0.8" r="20" />
                <circle cx="200" cy="200" fill="#10131b" r="4" />
              </svg>
            </motion.div>
          </div>
        </section>

{/* PIPELINE (Redesigned as a Vertical Timeline) */}
        <section className="py-24 px-6 border-t border-outline-variant/20 relative overflow-hidden">
          {/* Subtle background glow for the timeline */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
          
          <div className="max-w-4xl mx-auto relative z-10">
            <motion.div className="text-center mb-20" initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}>
              <h2 className="text-4xl md:text-5xl font-bold mb-4">The Vigil Security Loop</h2>
              <p className="text-on-surface-variant max-w-2xl mx-auto">A 4-stage deterministic pipeline that evaluates every AI agent payment before execution.</p>
            </motion.div>

            <motion.div className="relative" initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}>
              {/* Central Glowing Line (Hidden on very small screens, aligned left on mobile, center on desktop) */}
              <div className="absolute top-0 bottom-0 left-8 md:left-1/2 w-0.5 bg-gradient-to-b from-primary/40 via-secondary/40 to-transparent md:-translate-x-1/2" />

              <div className="space-y-12 md:space-y-24">
                {PIPELINE.map((s, i) => {
                  const isEven = i % 2 === 0;
                  return (
                    <motion.div key={s.key} variants={fadeUp} className={`relative flex flex-col md:flex-row items-start md:items-center gap-8 md:gap-16 ${isEven ? 'md:flex-row-reverse' : ''}`}>
                      
                      {/* Timeline Node (The Icon) */}
                      <div className="absolute left-8 md:left-1/2 -translate-x-1/2 flex items-center justify-center z-10">
                        <div className={`w-14 h-14 rounded-full bg-surface border-4 ${s.border} flex items-center justify-center ${s.glow}`}>
                          <span className={`material-symbols-outlined ${s.color} text-2xl`} style={{ fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
                        </div>
                      </div>

                      {/* Content Card */}
                      <div className={`w-full md:w-1/2 pl-20 md:pl-0 ${isEven ? 'md:pr-16 md:text-right' : 'md:pl-16 md:text-left'}`}>
                        <div className="glass-card p-8 rounded-2xl border border-outline-variant/20 hover:border-outline-variant/50 transition-colors">
                          <div className={`text-[10px] font-bold tracking-widest mb-2 uppercase ${s.color}`}>Stage {i + 1}</div>
                          <h4 className="text-2xl font-bold mb-3 text-on-surface">{s.key}</h4>
                          <p className="text-on-surface-variant leading-relaxed text-sm">{s.desc}</p>
                        </div>
                      </div>

                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </section>

        {/* 16 RULES CATEGORIZED LIST */}
        <section className="py-24 px-6 bg-surface-container-lowest/50 border-t border-outline-variant/20">
          <div className="max-w-6xl mx-auto">
            
            {/* Header Section */}
            <motion.div 
              className="mb-20 text-center md:text-left" 
              initial="hidden" 
              whileInView="show" 
              viewport={{ once: true }} 
              variants={fadeUp}
            >
              <h2 className="text-4xl md:text-5xl font-bold mb-4">16 Active Sensor Rules</h2>
              <p className="text-on-surface-variant max-w-2xl">
                All rules run in parallel on every payment intent. Severity is aggregated: 
                any CRITICAL flag can trigger an immediate halt.
              </p>
            </motion.div>

            {/* Grouped Rules Layout */}
            <motion.div 
              className="space-y-16"
              initial="hidden" 
              whileInView="show" 
              viewport={{ once: true }} 
              variants={stagger}
            >
              {Object.entries(groupedRules).map(([category, rules]) => (
                <div key={category} className="flex flex-col md:flex-row gap-6 md:gap-12">
                  
                  {/* Left Column: Category Label */}
                  <motion.div variants={fadeUp} className="md:w-1/3 shrink-0">
                    <div className="sticky top-24">
                      <h3 className="text-lg font-bold text-secondary tracking-widest uppercase mb-2">
                        {category}
                      </h3>
                      <div className="w-12 h-1 bg-primary/30 rounded-full mb-4"></div>
                      <p className="text-sm text-outline hidden md:block">
                        {rules.length} active {rules.length === 1 ? "sensor" : "sensors"} monitoring this vector.
                      </p>
                    </div>
                  </motion.div>

                  {/* Right Column: Rule List */}
                  <div className="md:w-2/3 flex flex-col gap-4">
                    {rules.map((r) => (
                      <motion.div 
                        key={r.id} 
                        variants={fadeUp} 
                        className="group flex flex-col sm:flex-row sm:items-start gap-4 p-5 glass-card rounded-xl hover:bg-surface-container/40 hover:-translate-y-0.5 transition-all duration-300 cursor-default border border-transparent hover:border-outline-variant/20"
                      >
                        {/* Icon */}
                        <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors duration-300">
                          <span className="material-symbols-outlined text-on-surface group-hover:text-primary transition-colors duration-300">
                            {r.icon}
                          </span>
                        </div>

                        {/* Rule Content */}
                        <div>
                          <div className="flex items-center gap-3 mb-1.5">
                            <span className="font-code-snippet text-[10px] text-outline font-bold tracking-widest bg-surface-container-highest px-2 py-0.5 rounded-sm">
                              RULE {r.id}
                            </span>
                            <h4 className="font-bold text-base text-on-surface">{r.name}</h4>
                          </div>
                          <p className="text-on-surface-variant text-sm leading-relaxed">
                            {r.desc}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  
                </div>
              ))}
            </motion.div>

          </div>
        </section>

        {/* MCP TOOL INTEGRATION */}
        <section className="py-24 px-6 border-t border-outline-variant/20">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}>
              <motion.h2 variants={fadeUp} className="text-4xl md:text-5xl font-bold mb-6">MCP Tool Integration</motion.h2>
              <motion.p variants={fadeUp} className="text-on-surface-variant mb-8 leading-relaxed">Vigil injects directly into the Model Context Protocol, providing an un-bypassable verification layer for any tool call attempting financial execution.</motion.p>
              {[["evaluate_payment","01","primary/20","primary","Pre-flight simulation checks balance, recipient trust score, and temporal limits."],
                ["execution_wrapper","02","emerald-500/20","emerald-500","If approved, the payload is wrapped with a single-use authorization token."],
                ["record_outcome","03","outline-variant/40","on-surface","Final state is committed to the AgentRegistry, updating on-chain reputation scores."]
              ].map(([fn, num, bg, col, desc]) => (
                <motion.li key={fn} variants={fadeUp} className="flex items-start gap-4 list-none mb-6">
                  <div className={`mt-1 w-6 h-6 rounded bg-${bg} flex items-center justify-center flex-shrink-0`}>
                    <span className={`font-code-snippet text-xs text-${col}`}>{num}</span>
                  </div>
                  <div>
                    <h4 className="font-code-snippet font-bold mb-1">{fn}</h4>
                    <p className="text-sm text-on-surface-variant">{desc}</p>
                  </div>
                </motion.li>
              ))}
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }} className="bg-[#0d1117] rounded-xl border border-outline-variant/40 p-6 font-code-snippet text-sm shadow-2xl">
              <div className="flex items-center gap-2 mb-4 border-b border-outline-variant/30 pb-4">
                <div className="w-3 h-3 rounded-full bg-rose-500" /><div className="w-3 h-3 rounded-full bg-amber-500" /><div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="ml-4 text-outline text-xs">vigil_evaluation.json</span>
              </div>
              <pre className="text-outline-variant text-xs leading-relaxed overflow-x-auto">{`{
  "action": "APPROVE",
  "sensorLevel": "LOW",
  "verifierAligned": true,
  "verifierAttempts": 1,
  "trustTier": 2,
  "flags": [],
  "pipelineElapsedMs": 420,
  "sensorBreakdown": {
    "totalChecks": 16,
    "flaggedChecks": 0
  },
  "capsule": {
    "address": "0x7f3a...",
    "expiresAt": 1747089600
  }
}`}</pre>
              <div className="mt-4 pt-4 border-t border-outline-variant/20 flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>Execution Authorized · Capsule Deployed</span>
              </div>
            </motion.div>
          </div>
        </section>

<section className="py-24 px-6 bg-surface-container-lowest/50 border-t border-outline-variant/20">
          <div className="max-w-4xl mx-auto">
            <motion.div className="text-center mb-16" initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}>
              <h2 className="text-4xl md:text-5xl font-bold mb-4">On-Chain Trust Tiers</h2>
              <p className="text-on-surface-variant max-w-2xl mx-auto">AgentRegistry.sol tracks every agent's success rate on-chain. Higher tiers unlock automatic severity reductions.</p>
            </motion.div>

            <motion.div className="flex flex-col gap-4" initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}>
              {[
                { tier: 0, name: "Unknown", color: "text-outline", bg: "bg-outline/10", border: "border-outline/20", desc: "New agent. All rules apply at full weight. No automatic mitigations." },
                { tier: 1, name: "Registered", color: "text-tertiary", bg: "bg-tertiary/10", border: "border-tertiary/20", desc: "Has completed at least one successful evaluation. Low-level adjustments begin." },
                { tier: 2, name: "Trusted", color: "text-secondary", bg: "bg-secondary/10", border: "border-secondary/20", desc: "Proven track record. Severity is reduced by one level automatically." },
                { tier: 3, name: "Verified", color: "text-primary", bg: "bg-primary/10", border: "border-primary/20", desc: "Highest tier. Maximum privileges and lowest friction for transactions." },
              ].map((t) => (
                <motion.div 
                  key={t.tier} 
                  variants={fadeUp} 
                  className={`relative overflow-hidden glass-card rounded-2xl p-6 md:p-8 border ${t.border} hover:-translate-y-1 transition-transform group flex flex-col md:flex-row items-start md:items-center gap-6`}
                >
                  {/* Huge Background Number */}
                  <div className={`absolute -right-4 -top-8 text-[120px] font-black opacity-[0.03] select-none pointer-events-none group-hover:opacity-[0.06] transition-opacity ${t.color}`}>
                    {t.tier}
                  </div>

                  {/* Left Side: Tier Badge */}
                  <div className="flex-shrink-0 flex items-center gap-4 w-full md:w-1/3">
                    <div className={`w-14 h-14 rounded-xl ${t.bg} flex items-center justify-center text-2xl font-black ${t.color} border ${t.border}`}>
                      {t.tier}
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-outline tracking-widest uppercase mb-1">Tier Level</div>
                      <h3 className={`font-bold text-xl ${t.color}`}>{t.name}</h3>
                    </div>
                  </div>

                  {/* Right Side: Description */}
                  <div className="flex-grow border-t md:border-t-0 md:border-l border-outline-variant/20 pt-4 md:pt-0 md:pl-8">
                    <p className="text-on-surface-variant leading-relaxed">
                      {t.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 px-6 border-t border-outline-variant/20 text-center">
          <div className="max-w-3xl mx-auto">
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}>
              <motion.h2 variants={fadeUp} className="text-4xl md:text-6xl font-bold mb-6">
                Secure your agents.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Today.</span>
              </motion.h2>
              <motion.p variants={fadeUp} className="text-on-surface-variant mb-10 text-lg">Connect your wallet to access the live dashboard, monitor real-time evaluations, and protect your agent&apos;s transactions on the Kite network.</motion.p>
              <motion.div variants={fadeUp} className="flex justify-center gap-4 flex-wrap">
                <ConnectButton label="Connect Wallet" />
                <Link href="/docs" className="flex items-center gap-2 px-6 py-3 border border-outline-variant rounded-xl text-on-surface-variant hover:text-on-surface transition-colors font-semibold">
                  <span className="material-symbols-outlined text-[18px]">menu_book</span> Read Docs
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>
      </main>

      <footer className="w-full bg-surface border-t border-outline-variant/30 relative z-10">
        <div className="w-full py-6 px-6 flex flex-col md:flex-row justify-between items-center gap-4 max-w-7xl mx-auto">
          <div className="text-outline font-code-snippet text-xs flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">shield</span>© 2026 Vigil AI
          </div>
          <nav className="flex gap-6 text-[11px] font-bold uppercase tracking-wider">
            <Link href="/docs" className="text-on-surface-variant hover:text-primary transition-colors">Docs</Link>
            <Link href="/features" className="text-on-surface-variant hover:text-primary transition-colors">Features</Link>
            <Link href="/dashboard" className="text-on-surface-variant hover:text-primary transition-colors">Dashboard</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

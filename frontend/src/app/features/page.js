"use client";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";

const fadeUp = { hidden: { opacity: 0, y: 40 }, show: { opacity: 1, y: 0, transition: { duration: 0.6 } } };
const stagger = { show: { transition: { staggerChildren: 0.12 } } };

function Navbar() {
  return (
    <header className="w-full bg-surface/80 backdrop-blur-md sticky top-0 z-50 border-b border-outline-variant">
      <div className="flex justify-between items-center w-full px-6 h-16 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <img src="/vigil.svg" alt="Vigil Logo" className="h-10 w-10 object-contain" />
          <span className="text-2xl font-bold text-on-surface tracking-tight">Vigil</span>
        </div>
        <nav className="hidden md:flex items-center gap-8">
          <Link href="/" className="text-on-surface-variant hover:text-on-surface transition-colors font-semibold text-sm">Home</Link>
          <Link href="/features" className="text-primary font-bold text-sm">Features</Link>
          <Link href="/docs" className="text-on-surface-variant hover:text-on-surface transition-colors font-semibold text-sm">Docs</Link>
          <Link href="/dashboard" className="text-on-surface-variant hover:text-on-surface transition-colors font-semibold text-sm">Dashboard</Link>
        </nav>
        <ConnectButton chainStatus="icon" showBalance={false} />
      </div>
    </header>
  );
}

export default function FeaturesPage() {
  return (
    <>
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 ambient-glow-blue opacity-60" />
        <div className="absolute inset-0 ambient-glow-teal opacity-40" />
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute inset-0 particles" />
      </div>

      <Navbar />

      <main className="flex-grow flex flex-col relative z-10">
        
        {/* HERO SECTION */}
        <section className="px-6 pt-32 pb-24 border-b border-outline-variant/20 relative">
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-outline-variant/50 shadow-sm mb-8">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] font-bold text-on-surface-variant font-code-snippet tracking-widest uppercase">Vigil Security Suite v1.0</span>
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-[56px] md:text-[72px] font-black text-on-surface leading-[1.05] tracking-tighter mb-8">
              Protocol <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary-container to-secondary">Features.</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-[20px] leading-relaxed text-on-surface-variant max-w-2xl mx-auto">
              A comprehensive, deterministic security layer designed to protect autonomous AI agents executing financial transactions on the Kite network.
            </motion.p>
          </div>
        </section>

        {/* FEATURE 1: Semantic Intent */}
        <section className="px-6 py-32 overflow-hidden">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-100px" }} variants={stagger} className="order-2 lg:order-1">
              <motion.div variants={fadeUp} className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-8 shadow-[0_0_20px_rgba(173,198,255,0.15)]">
                <span className="material-symbols-outlined text-primary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
              </motion.div>
              <motion.h2 variants={fadeUp} className="text-4xl font-bold mb-5 tracking-tight">Semantic Intent Verification</motion.h2>
              <motion.p variants={fadeUp} className="text-on-surface-variant text-lg leading-relaxed mb-8">
                Vigil doesn't just look at numbers; it understands what your agent is trying to do. By comparing the declared session intent with the actual resource being paid for, Vigil detects semantic drift and potential social engineering attacks using an LLM-powered Heuristic Guide.
              </motion.p>
              <motion.ul variants={stagger} className="space-y-5 text-on-surface">
                {[
                  "Detects deviations from original designated tasks",
                  "Identifies urgency and manipulation keywords in payloads",
                  "Context-aware spending proximity analysis"
                ].map((item, i) => (
                  <motion.li key={i} variants={fadeUp} className="flex items-start gap-4">
                    <span className="material-symbols-outlined text-secondary mt-0.5">verified</span>
                    <span className="font-medium">{item}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </motion.div>

            {/* Simulated Terminal UI */}
            <motion.div className="order-1 lg:order-2 w-full max-w-md mx-auto lg:max-w-none" initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, type: "spring" }}>
               <div className="bg-[#0a0c10] border border-outline-variant/30 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col font-code-snippet relative group">
                 {/* Decorative glow */}
                 <div className="absolute -inset-1 bg-gradient-to-b from-error/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity blur-xl z-0 pointer-events-none" />
                 
                 <div className="bg-[#1c212b] px-4 py-3 flex items-center justify-between border-b border-[#30363d] relative z-10">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                      <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                      <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                    </div>
                    <div className="text-[10px] text-[#8b949e] tracking-widest uppercase font-bold flex items-center gap-2">
                      <span className="material-symbols-outlined text-[14px]">query_stats</span> intent_parser.rs
                    </div>
                 </div>
                 
                 <div className="p-6 md:p-8 text-xs relative z-10">
                   <div className="mb-6">
                     <div className="text-[#8b949e] mb-2 text-[10px] tracking-widest uppercase">Decoded Agent Intent</div>
                     <div className="bg-[#161b22] border border-[#30363d] p-3 rounded text-[#d2a8ff]">
                       "Pay $15 for quarterly cloud storage invoice"
                     </div>
                   </div>
                   
                   <div className="flex justify-center mb-6 relative">
                     <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-dashed border-[#30363d]" /></div>
                     <div className="bg-[#0a0c10] px-3 relative z-10">
                       <span className="material-symbols-outlined text-[#8b949e]">compare_arrows</span>
                     </div>
                   </div>
                   
                   <div className="mb-6">
                     <div className="text-[#8b949e] mb-2 text-[10px] tracking-widest uppercase">Target Execution URL</div>
                     <div className="bg-[#2a1215] border border-[#ff7b72]/30 p-3 rounded text-[#ff7b72] truncate">
                       https://defi-yield-farming.com/deposit/vault
                     </div>
                   </div>
                   
                   <div className="mt-8 bg-error/10 border border-error/30 rounded-xl p-4 flex items-start gap-4">
                     <div className="bg-error/20 text-error rounded-full p-1.5 shrink-0">
                       <span className="material-symbols-outlined text-[20px]">warning</span>
                     </div>
                     <div>
                       <div className="text-error font-bold text-sm mb-1">CRITICAL FLAG: Semantic Drift</div>
                       <div className="text-error/70 text-[10px] leading-relaxed">
                         Confidence: 99.2%<br/>
                         Mismatch between "cloud storage" and DeFi protocol endpoint. Halting transaction.
                       </div>
                     </div>
                   </div>
                 </div>
               </div>
            </motion.div>
          </div>
        </section>

        {/* FEATURE 2: Reputation System */}
        <section className="px-6 py-32 bg-surface-container-lowest/50 border-y border-outline-variant/20 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[500px] h-[500px] bg-secondary/5 rounded-full blur-[120px] pointer-events-none" />
          
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            
            {/* Simulated Identity Card */}
            <motion.div className="w-full max-w-md mx-auto lg:max-w-none relative" initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, type: "spring" }}>
               <div className="relative aspect-[4/3] glass-card rounded-3xl border border-secondary/30 p-8 flex flex-col overflow-hidden group shadow-2xl bg-surface-container-low/80 backdrop-blur-xl z-10 hover:border-secondary/50 transition-colors">
                 {/* Massive watermark number */}
                 <div className="absolute -right-12 -bottom-10 text-[200px] leading-none font-black text-secondary opacity-[0.03] pointer-events-none transition-transform duration-700 group-hover:scale-110 group-hover:opacity-[0.06]">
                   2
                 </div>
                 
                 <div className="flex justify-between items-start mb-auto relative z-10">
                   <div className="w-16 h-16 rounded-2xl bg-secondary/10 flex items-center justify-center border border-secondary/30 shadow-[0_0_20px_rgba(78,222,163,0.15)]">
                     <span className="material-symbols-outlined text-secondary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
                   </div>
                   <div className="text-right">
                     <div className="text-[10px] text-outline font-code-snippet uppercase tracking-widest mb-1">On-Chain Status</div>
                     <div className="text-2xl font-black text-secondary tracking-tight">Tier 2 Trusted</div>
                   </div>
                 </div>
                 
                 <div className="space-y-6 relative z-10">
                   <div className="bg-surface/50 rounded-xl p-4 border border-outline-variant/30 font-code-snippet">
                     <div className="text-[10px] text-outline uppercase tracking-widest mb-1">Agent Identity Hash</div>
                     <div className="text-sm font-bold text-on-surface truncate">0x7a8...9f1e4a</div>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-4">
                     <div className="bg-surface/50 rounded-xl p-4 border border-outline-variant/30">
                       <div className="text-[10px] text-outline uppercase tracking-widest mb-1">Success Rate</div>
                       <div className="text-2xl font-black text-on-surface">98.5%</div>
                     </div>
                     <div className="bg-surface/50 rounded-xl p-4 border border-outline-variant/30">
                       <div className="text-[10px] text-outline uppercase tracking-widest mb-1">Evaluations</div>
                       <div className="text-2xl font-black text-on-surface">1,245</div>
                     </div>
                   </div>
                   
                   <div className="bg-secondary/10 text-secondary text-xs p-4 rounded-xl border border-secondary/20 flex items-start gap-3">
                     <span className="material-symbols-outlined text-[18px] shrink-0">auto_awesome</span>
                     <span className="leading-relaxed font-medium">Automatic severity reduction unlocked. Medium-risk flags are mitigated to Low.</span>
                   </div>
                 </div>
               </div>
            </motion.div>

            <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-100px" }} variants={stagger}>
              <motion.div variants={fadeUp} className="w-14 h-14 rounded-2xl bg-secondary/10 border border-secondary/20 flex items-center justify-center mb-8 shadow-[0_0_20px_rgba(78,222,163,0.15)]">
                <span className="material-symbols-outlined text-secondary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>gpp_good</span>
              </motion.div>
              <motion.h2 variants={fadeUp} className="text-4xl font-bold mb-5 tracking-tight">On-Chain Reputation</motion.h2>
              <motion.p variants={fadeUp} className="text-on-surface-variant text-lg leading-relaxed mb-8">
                Every decision Vigil makes is committed to the Kite blockchain via the <code className="text-sm bg-surface-variant/30 px-1.5 py-0.5 rounded text-on-surface">AgentRegistry</code> contract. Over time, agents build an immutable reputation score that dynamically influences future evaluations. Trusted agents encounter less friction, while problematic agents face increased scrutiny.
              </motion.p>
              <motion.ul variants={stagger} className="space-y-5 text-on-surface">
                {[
                  "Immutable audit trail of all agent actions",
                  "4-Tier Trust System (Unknown → Registered → Trusted → Verified)",
                  "Automatic risk mitigation for high-tier agents"
                ].map((item, i) => (
                  <motion.li key={i} variants={fadeUp} className="flex items-start gap-4">
                    <span className="material-symbols-outlined text-secondary mt-0.5">check_circle</span>
                    <span className="font-medium">{item}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </motion.div>
            
          </div>
        </section>

        {/* FEATURE 3: 16-Rule Engine */}
        <section className="px-6 py-32">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-100px" }} variants={stagger} className="order-2 lg:order-1">
              <motion.div variants={fadeUp} className="w-14 h-14 rounded-2xl bg-tertiary/10 border border-tertiary/20 flex items-center justify-center mb-8 shadow-[0_0_20px_rgba(255,185,95,0.15)]">
                <span className="material-symbols-outlined text-tertiary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>radar</span>
              </motion.div>
              <motion.h2 variants={fadeUp} className="text-4xl font-bold mb-5 tracking-tight">Deterministic Rule Engine</motion.h2>
              <motion.p variants={fadeUp} className="text-on-surface-variant text-lg leading-relaxed mb-8">
                Vigil evaluates every transaction against 16 parallel sensor rules spanning financial limits, contract safety, cross-chain risk, and phishing detection. This highly structured matrix ensures comprehensive baseline security before an LLM is ever invoked.
              </motion.p>
              <motion.div variants={fadeUp}>
                <Link href="/docs#sensor-rules" className="inline-flex items-center gap-2 bg-surface hover:bg-surface-variant/50 border border-outline-variant text-on-surface px-6 py-3 rounded-xl transition-colors font-bold text-sm group">
                  Explore all 16 Rules <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform text-tertiary">arrow_forward</span>
                </Link>
              </motion.div>
            </motion.div>

            {/* Asymmetrical Bento Grid */}
            <motion.div className="order-1 lg:order-2 grid grid-cols-2 gap-4" initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}>
               {/* Large prominent block */}
               <motion.div variants={fadeUp} className="col-span-2 glass-card rounded-2xl p-6 border border-tertiary/30 bg-gradient-to-br from-tertiary/5 to-transparent flex items-center gap-5 hover:border-tertiary/60 transition-colors">
                 <div className="w-12 h-12 rounded-xl bg-tertiary/20 flex items-center justify-center shrink-0">
                   <span className="material-symbols-outlined text-tertiary">paid</span>
                 </div>
                 <div>
                   <h3 className="font-bold text-on-surface mb-1">Amount Thresholds</h3>
                   <p className="text-xs text-on-surface-variant leading-relaxed">18-decimal BigInt checks against rolling 24h token limits.</p>
                 </div>
               </motion.div>
               
               {/* Standard blocks */}
               <motion.div variants={fadeUp} className="glass-card rounded-2xl p-6 border border-outline-variant/30 flex flex-col justify-between hover:-translate-y-1 transition-transform">
                 <span className="material-symbols-outlined text-primary text-2xl mb-4">bug_report</span>
                 <div>
                   <h3 className="font-bold text-sm text-on-surface mb-1">Contract Safety</h3>
                   <p className="text-[11px] text-on-surface-variant">Exploit DB lookups.</p>
                 </div>
               </motion.div>
               
               <motion.div variants={fadeUp} className="glass-card rounded-2xl p-6 border border-outline-variant/30 flex flex-col justify-between hover:-translate-y-1 transition-transform">
                 <span className="material-symbols-outlined text-secondary text-2xl mb-4">travel_explore</span>
                 <div>
                   <h3 className="font-bold text-sm text-on-surface mb-1">KSearch Bridge</h3>
                   <p className="text-[11px] text-on-surface-variant">Live service validation.</p>
                 </div>
               </motion.div>
               
               {/* Wide block */}
               <motion.div variants={fadeUp} className="col-span-2 glass-card rounded-2xl p-6 border border-outline-variant/30 flex items-center justify-between group hover:border-outline-variant/60 transition-colors">
                 <div className="flex items-center gap-4">
                   <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">show_chart</span>
                   <h3 className="font-bold text-sm text-on-surface">Statistical Behavioral Drift</h3>
                 </div>
                 <div className="flex gap-1">
                   <div className="w-1.5 h-4 bg-outline-variant/30 rounded-full group-hover:bg-primary/40 transition-colors delay-75" />
                   <div className="w-1.5 h-6 bg-outline-variant/30 rounded-full group-hover:bg-primary/60 transition-colors delay-150" />
                   <div className="w-1.5 h-8 bg-outline-variant/30 rounded-full group-hover:bg-primary transition-colors delay-200" />
                 </div>
               </motion.div>
            </motion.div>

          </div>
        </section>

      </main>

      <footer className="w-full bg-surface border-t border-outline-variant/30 relative z-10 mt-auto">
        <div className="w-full py-8 px-6 flex flex-col md:flex-row justify-between items-center gap-6 max-w-7xl mx-auto">
          <div className="text-outline font-code-snippet text-xs flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-surface-variant/30 flex items-center justify-center border border-outline-variant/30">
              <span className="material-symbols-outlined text-[14px]">shield</span>
            </div>
            © 2026 Vigil Protocol
          </div>
          <nav className="flex gap-8 text-[11px] font-bold uppercase tracking-widest">
            <Link href="/docs" className="text-on-surface-variant hover:text-primary transition-colors">Documentation</Link>
            <Link href="/features" className="text-primary transition-colors">Features</Link>
            <Link href="/dashboard" className="text-on-surface-variant hover:text-primary transition-colors">Dashboard</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
"use client";
import Link from "next/link";
import useSWR from "swr";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignMessage } from "wagmi";
import { useState, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_VIGIL_API || "http://localhost:3003";
const fetcher = (url) => fetch(url).then(r => { if (!r.ok) throw new Error("offline"); return r.json(); });

function short(a) { if (!a) return "—"; return `${a.slice(0,6)}…${a.slice(-4)}`; }
function host(url) { try { return new URL(url).hostname; } catch { return url?.slice(0,28) || "—"; } }
function fmtTime(ts) { if (!ts) return "—"; const d = new Date(ts); return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function fmtAmt(wei) { if (!wei) return "—"; try { const n = Number(BigInt(wei)) / 1e18; return n < 0.001 ? "<0.001" : n.toFixed(4); } catch { return wei; } }

const ACTION_STYLE = {
  APPROVE: { cls: "text-secondary border-secondary/20 bg-secondary-container/20", icon: "check_circle" },
  WARN:    { cls: "text-tertiary border-tertiary/20 bg-tertiary-container/20",   icon: "warning" },
  BLOCK:   { cls: "text-error border-error/20 bg-error-container/20",            icon: "block" },
};
const LEVEL_STYLE = {
  LOW:      "text-secondary",
  MEDIUM:   "text-tertiary",
  HIGH:     "text-orange-400",
  CRITICAL: "text-error",
};

function Navbar() {
  return (
    <header className="w-full bg-surface/80 backdrop-blur-md sticky top-0 z-50 border-b border-outline-variant">
      <div className="flex justify-between items-center w-full px-6 h-16 max-w-full mx-auto">
        <div className="flex items-center gap-2">
          <img src="/vigil.svg" alt="Vigil Logo" className="h-10 w-10 object-contain" />
          <span className="text-xl font-bold text-on-surface tracking-tight">Vigil</span>
        </div>
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/" className="text-on-surface-variant hover:text-on-surface transition-colors text-sm font-semibold">Home</Link>
          <Link href="/dashboard" className="text-primary font-bold text-sm">Dashboard</Link>
          <Link href="/docs" className="text-on-surface-variant hover:text-on-surface transition-colors text-sm font-semibold">Docs</Link>
        </nav>
        <ConnectButton chainStatus="icon" showBalance={false} />
      </div>
    </header>
  );
}

function StatItem({ label, value, sub, color, icon }) {
  return (
    <div className="p-6 flex flex-col items-start justify-center group hover:bg-surface-variant/10 transition-colors">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-8 h-8 rounded border border-outline-variant/30 bg-surface flex items-center justify-center shadow-sm`}>
          <span className={`material-symbols-outlined ${color} text-[18px]`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
        </div>
        <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">{label}</div>
      </div>
      <div className={`text-4xl font-black tracking-tighter mb-1 ${color}`}>{value}</div>
      {sub && <div className="text-[11px] font-code-snippet text-outline mt-1">{sub}</div>}
    </div>
  );
}

function CategoryBar({ label, modules }) {
  const total = modules.length;
  const flagged = modules.filter(m => m.status === "flagged").length;
  const pct = total > 0 ? Math.round((flagged / total) * 100) : 0;
  const color = pct > 50 ? "bg-error shadow-[0_0_10px_rgba(255,84,73,0.4)]" : pct > 20 ? "bg-tertiary shadow-[0_0_10px_rgba(255,185,95,0.4)]" : "bg-secondary";
  return (
    <div className="mb-4">
      <div className="flex justify-between text-[11px] mb-1.5 font-code-snippet">
        <span className="font-semibold text-on-surface-variant uppercase tracking-wider">{label}</span>
        <span className="font-bold text-on-surface">{flagged}/{total} <span className="text-outline">FLAGGED</span></span>
      </div>
      <div className="h-1 bg-surface-variant/50 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [authedEvals, setAuthedEvals] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [signing, setSigning] = useState(false);

  const { data: healthData } = useSWR(`${API}/api/health`, fetcher, { refreshInterval: 10000 });
  const { data: feedData, error: feedError } = useSWR(`${API}/api/evaluations?limit=100`, fetcher, { refreshInterval: 5000 });
  const { data: rulesData } = useSWR(`${API}/api/rules/proposed`, fetcher, { refreshInterval: 15000 });

  const evals = authedEvals ?? feedData?.evaluations ?? [];
  const total  = evals.length;
  const approved = evals.filter(e => e.action === "APPROVE").length;
  const blocked  = evals.filter(e => e.action === "BLOCK").length;
  const warned   = evals.filter(e => e.action === "WARN").length;
  const avgMs = total > 0 ? Math.round(evals.reduce((s, e) => s + (e.pipeline_elapsed_ms || e.pipelineElapsedMs || 0), 0) / total) : 0;

  const latestBreakdown = evals.find(e => e.sensor_breakdown || e.sensorBreakdown);
  const breakdown = latestBreakdown ? (latestBreakdown.sensor_breakdown || latestBreakdown.sensorBreakdown) : null;

  const signIn = useCallback(async () => {
    if (!address) return;
    setSigning(true); setAuthError(null);
    try {
      const { nonce } = await fetch(`${API}/api/auth/nonce/${address}`).then(r => r.json());
      const message = `Vigil authentication for agent ${address}. Nonce: ${nonce}`;
      const signature = await signMessageAsync({ message });
      const res = await fetch(`${API}/api/evaluations/${address}`, {
        headers: { "x-wallet-signature": signature, "x-wallet-nonce": nonce }
      });
      if (!res.ok) throw new Error((await res.json()).error || "Auth failed");
      const data = await res.json();
      setAuthedEvals(data.evaluations);
    } catch (e) {
      setAuthError(e.message);
    } finally {
      setSigning(false);
    }
  }, [address, signMessageAsync]);

  const loopStatus = [
    { name: "Data Sensor", sub: "16 Rules · ACTIVE", icon: "sensors", col: "text-secondary", ok: true },
    { name: "Heuristic Guide", sub: "LLM · Ruleset v4.2", icon: "route", col: "text-secondary", ok: true },
    { name: "Consensus Verifier", sub: healthData ? "EVALUATING..." : "OFFLINE", icon: "verified_user", col: healthData ? "text-primary" : "text-error", ok: !!healthData },
    { name: "Policy Engine", sub: "APPROVE / WARN / BLOCK", icon: "policy", col: "text-tertiary", ok: true },
  ];

  return (
    <>
      <Navbar />
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 ambient-glow-blue opacity-50" /><div className="absolute inset-0 ambient-glow-teal opacity-50" />
        <div className="absolute inset-0 bg-grid opacity-30" />
      </div>

      <main className="flex-grow relative z-10 max-w-7xl mx-auto w-full px-6 py-8 flex flex-col gap-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-surface border border-outline-variant mb-4">
              <div className={`w-2 h-2 rounded-full ${healthData ? "bg-secondary animate-pulse shadow-[0_0_8px_rgba(78,222,163,0.8)]" : "bg-error"}`} />
              <span className="font-code-snippet text-[10px] text-on-surface-variant font-bold tracking-widest">
                {healthData ? "NODE: VGL-KT-2368" : "BACKEND OFFLINE"}
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-on-surface leading-tight tracking-tighter">Network Telemetry</h1>
            <p className="text-on-surface-variant text-sm mt-2 max-w-xl">Real-time surveillance of autonomous agent execution paths across Kite Testnet.</p>
          </div>
        </div>

        {/* Telemetry Stats Ribbon */}
        <div className="grid grid-cols-2 lg:grid-cols-5 bg-surface-container-lowest/80 backdrop-blur-sm rounded-2xl border border-outline-variant/50 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-outline-variant/30 shadow-lg">
          <StatItem label="Total Evaluations" value={total} icon="analytics" color="text-primary" />
          <StatItem label="Approved" value={approved} sub={`${total > 0 ? Math.round(approved/total*100) : 0}% clearance rate`} icon="check_circle" color="text-secondary" />
          <StatItem label="Warned" value={warned} sub="Requires human review" icon="warning" color="text-tertiary" />
          <StatItem label="Blocked" value={blocked} sub={`${total > 0 ? Math.round(blocked/total*100) : 0}% rejection rate`} icon="block" color="text-error" />
          <StatItem label="Avg Pipeline" value={avgMs > 0 ? `${avgMs}ms` : "—"} sub="End-to-end latency" icon="speed" color="text-on-surface" />
        </div>

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column (4/12) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* Security Loop Status */}
            <div className="bg-surface-container-low/50 backdrop-blur-sm rounded-xl border border-outline-variant/40 flex flex-col shadow-sm">
              <div className="p-4 border-b border-outline-variant/40 flex justify-between items-center bg-surface/30">
                <h2 className="text-[11px] font-black text-on-surface uppercase tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-primary">account_tree</span>
                  Pipeline Status
                </h2>
                <span className="font-code-snippet text-[10px] text-outline">SYS-ID: 809A</span>
              </div>
              <div className="p-4 flex flex-col gap-2 relative">
                {/* Connecting Line */}
                <div className="absolute left-9 top-8 bottom-8 w-px bg-outline-variant/30 z-0" />
                {loopStatus.map((s, idx) => (
                  <div key={s.name} className={`relative z-10 flex items-center gap-4 bg-surface-container-lowest/80 border ${s.ok ? "border-outline-variant/50 hover:border-outline-variant" : "border-error/50"} rounded-lg p-3 transition-colors`}>
                    <div className={`h-8 w-8 rounded-full ${s.ok ? "bg-surface border border-outline-variant/50" : "bg-error/10 border border-error/30"} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                      <span className={`material-symbols-outlined ${s.col} text-[18px]`} style={{ fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-on-surface mb-0.5">{s.name}</div>
                      <div className={`text-[9px] font-code-snippet tracking-widest ${s.col}`}>{s.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Wallet Auth Area */}
              <div className="p-4 border-t border-outline-variant/40 bg-surface/20">
                {!isConnected ? (
                  <div className="flex flex-col items-center justify-center p-2">
                    <p className="text-[11px] font-bold text-outline uppercase tracking-widest mb-3">Agent Authentication</p>
                    <ConnectButton />
                  </div>
                ) : !authedEvals ? (
                  <button onClick={signIn} disabled={signing} className="w-full bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary font-bold text-xs py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">key</span>
                    {signing ? "Authenticating Payload..." : "Sign In With Agent Wallet"}
                  </button>
                ) : (
                  <div className="flex flex-col items-center justify-center py-2 bg-secondary/5 border border-secondary/20 rounded-lg">
                    <div className="flex items-center gap-2 text-secondary text-xs font-bold mb-1">
                      <span className="material-symbols-outlined text-[16px]">verified_user</span> Session Authenticated
                    </div>
                    <span className="font-code-snippet text-[10px] text-outline">{short(address)}</span>
                  </div>
                )}
                {authError && <p className="text-error text-xs mt-3 text-center font-code-snippet bg-error/10 py-2 rounded">{authError}</p>}
              </div>
            </div>

            {/* Sensor Breakdown */}
            <div className="bg-surface-container-low/50 backdrop-blur-sm rounded-xl border border-outline-variant/40 shadow-sm flex-grow">
              <div className="p-4 border-b border-outline-variant/40 bg-surface/30">
                <h2 className="text-[11px] font-black text-on-surface uppercase tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-tertiary">radar</span>
                  Vector Breakdown
                </h2>
              </div>
              <div className="p-5">
                {breakdown?.checks ? (
                  breakdown.checks.map(c => <CategoryBar key={c.category} label={c.category} modules={c.modules} />)
                ) : (
                  <div className="space-y-4 opacity-40 grayscale">
                    {["Amount & Budget","Recipient Trust","Contract Safety","Cross-Chain","Behavioral Drift"].map(cat => (
                      <CategoryBar key={cat} label={cat} modules={[{ status: "clean" }, { status: "clean" }]} />
                    ))}
                    <div className="text-center pt-4">
                      <span className="font-code-snippet text-[10px] text-outline border border-outline-variant px-2 py-1 rounded">AWAITING_TELEMETRY</span>
                    </div>
                  </div>
                )}
                <div className="mt-6 pt-5 border-t border-outline-variant/40 flex justify-between items-center text-center">
                  <div className="w-1/2 border-r border-outline-variant/40">
                    <div className="text-3xl font-black text-on-surface tracking-tighter">{breakdown?.totalChecks ?? 16}</div>
                    <div className="text-[9px] text-outline font-code-snippet tracking-widest uppercase mt-1">Active Rules</div>
                  </div>
                  <div className="w-1/2">
                    <div className={`text-3xl font-black tracking-tighter ${(breakdown?.flaggedChecks ?? 0) > 0 ? "text-error drop-shadow-[0_0_8px_rgba(255,84,73,0.5)]" : "text-secondary"}`}>
                      {breakdown?.flaggedChecks ?? 0}
                    </div>
                    <div className="text-[9px] text-outline font-code-snippet tracking-widest uppercase mt-1">Flags Detected</div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column (8/12) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* Evaluation Stream */}
            <div className="bg-surface-container-lowest/80 backdrop-blur-sm rounded-xl border border-outline-variant/50 shadow-sm flex flex-col h-[400px]">
              <div className="p-4 border-b border-outline-variant/50 flex justify-between items-center bg-surface/30">
                <h2 className="text-[11px] font-black text-on-surface uppercase tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-secondary">stream</span>
                  Live Event Stream
                </h2>
                <div className="flex items-center gap-2 bg-surface border border-outline-variant rounded px-2 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                  <span className="text-[9px] font-bold text-on-surface-variant font-code-snippet uppercase tracking-wider">{total} packets</span>
                </div>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-outline-variant/30 font-code-snippet text-[9px] font-bold text-outline tracking-widest uppercase bg-surface-container-lowest">
                  <div className="col-span-2">Action</div>
                  <div className="col-span-2">Severity</div>
                  <div className="col-span-4">Resource Target</div>
                  <div className="col-span-2">Agent ID</div>
                  <div className="col-span-2 text-right">Timestamp</div>
                </div>
                <div className="overflow-y-auto flex-1 log-viewer divide-y divide-outline-variant/10">
                  {evals.length === 0 && !feedError && (
                    <div className="h-full flex flex-col items-center justify-center gap-3 opacity-50">
                      <span className="material-symbols-outlined text-4xl">hourglass_empty</span>
                      <p className="text-[11px] font-code-snippet tracking-widest uppercase">Awaiting Network Events...</p>
                    </div>
                  )}
                  {feedError && (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-error/70">
                      <span className="material-symbols-outlined text-4xl">wifi_off</span>
                      <p className="text-[11px] font-code-snippet tracking-widest uppercase">Connection Lost</p>
                    </div>
                  )}
                  {evals.map((e, i) => {
                    const m = ACTION_STYLE[e.action] || ACTION_STYLE.WARN;
                    const lc = LEVEL_STYLE[e.sensorLevel || e.sensor_level] || "text-outline";
                    return (
                      <div key={i} className="grid grid-cols-12 gap-4 px-5 py-3 items-center hover:bg-surface-variant/20 transition-colors group">
                        <div className="col-span-2 flex items-center gap-2">
                          <span className={`material-symbols-outlined text-[16px] ${m.cls.split(" ")[0]}`} style={{ fontVariationSettings: "'FILL' 1" }}>{m.icon}</span>
                          <span className={`font-code-snippet text-[9px] font-bold px-1.5 py-0.5 rounded border ${m.cls} uppercase tracking-wider`}>{e.action}</span>
                        </div>
                        <div className={`col-span-2 font-code-snippet text-[10px] font-bold uppercase tracking-wider ${lc}`}>
                          {e.sensorLevel || e.sensor_level || "—"}
                        </div>
                        <div className="col-span-4 font-code-snippet text-[11px] text-on-surface-variant truncate group-hover:text-primary transition-colors">
                          {host(e.resource)}
                        </div>
                        <div className="col-span-2 font-code-snippet text-[11px] text-outline group-hover:text-on-surface transition-colors">
                          {short(e.agentAddress || e.agent_address)}
                        </div>
                        <div className="col-span-2 font-code-snippet text-[10px] text-outline/60 text-right">
                          {fmtTime(e.timestamp)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* True Terminal: AgentRegistry.sol */}
            <div className="bg-[#0a0c10] rounded-xl border border-outline-variant/30 overflow-hidden shadow-2xl flex flex-col">
              {/* Terminal Window Header */}
              <div className="bg-[#1c212b] px-4 py-2 flex justify-between items-center border-b border-[#30363d]">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]" />
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]" />
                  <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]" />
                </div>
                <div className="flex items-center gap-2 text-[#8b949e]">
                  <span className="material-symbols-outlined text-[14px]">terminal</span>
                  <span className="text-[10px] font-code-snippet tracking-widest font-bold">AgentRegistry.sol / stdout</span>
                </div>
                <div className="w-10"></div> {/* Spacer for center alignment */}
              </div>
              
              {/* Terminal Body */}
              <div className="p-5 font-code-snippet text-[11px] h-64 overflow-y-auto log-viewer leading-relaxed text-[#c9d1d9] space-y-1">
                <div className="mb-4">
                  <span className="text-[#8b949e]">admin@vigil-node:~$</span> tail -f /var/log/kite/registry.log
                </div>
                
                {evals.slice(0, 10).map((e, i) => {
                  const ts = fmtTime(e.timestamp);
                  const ag = short(e.agentAddress || e.agent_address);
                  const act = e.action;
                  const col = act === "BLOCK" ? "text-[#ff7b72]" : act === "WARN" ? "text-[#d2a8ff]" : "text-[#3fb950]";
                  const flagsRaw = e.flags || e.sensor_flags;
                  const flagsArr = Array.isArray(flagsRaw) ? flagsRaw : (typeof flagsRaw === 'string' ? JSON.parse(flagsRaw || "[]") : []);
                  
                  return (
                    <div key={i} className="hover:bg-white/5 px-1 -mx-1 rounded transition-colors">
                      <span className="text-[#484f58]">[{ts}]</span>{" "}
                      <span className={`font-bold ${col}`}>[{act}]</span>{" "}
                      <span className="text-[#8b949e]">TX_ENQUEUE:</span>{" "}
                      <span className="text-[#58a6ff]">{ag}</span>{" → "}
                      <span className="text-[#a5d6ff]">{host(e.resource)}</span>
                      {flagsArr.length > 0 && (
                        <span className="text-[#d2a8ff]"> 
                          {" "}| FLAGS:<span className="text-[#ff7b72]">{flagsArr.length}</span>
                        </span>
                      )}
                    </div>
                  );
                })}
                {evals.length === 0 && (
                  <>
                    <div><span className="text-[#484f58]">[--:--:--]</span> <span className="text-[#3fb950]">[INFO]</span> <span className="text-[#58a6ff]">RegistryDaemon</span>: Listening on port 8545...</div>
                    <div><span className="text-[#484f58]">[--:--:--]</span> <span className="text-[#8b949e]">[SYS]</span>  Pipeline synchronized. 16/16 modules active.</div>
                    <div><span className="text-[#484f58]">[--:--:--]</span> <span className="text-[#8b949e]">[SYS]</span>  Awaiting inbound RPC calls.</div>
                    <div className="animate-pulse text-[#8b949e] mt-2">_</div>
                  </>
                )}
              </div>
            </div>

            {/* Rule Composer (Shadow Mode) */}
            <div className="bg-surface-container-low/50 backdrop-blur-sm rounded-xl border border-outline-variant/40 shadow-sm mt-2">
              <div className="p-4 border-b border-outline-variant/40 flex justify-between items-center bg-primary/5">
                <h2 className="text-[11px] font-black text-on-surface uppercase tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-primary">auto_awesome</span>
                  Composer Shadow Mode
                </h2>
                <button 
                  onClick={async () => {
                    try {
                      await fetch(`${API}/api/compose-rule`, { method: "POST" });
                      alert("Rule Composer triggered! Check back in a few seconds.");
                    } catch (e) {
                      alert("Failed to trigger composer");
                    }
                  }}
                  className="text-[9px] font-code-snippet font-bold bg-primary text-on-primary hover:bg-primary/80 px-3 py-1.5 rounded uppercase tracking-wider transition-colors shadow-[0_0_10px_rgba(173,198,255,0.3)]"
                >
                  Trigger Generator
                </button>
              </div>
              <div className="p-0 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface/30 border-b border-outline-variant/40 text-outline font-code-snippet text-[9px] uppercase tracking-widest">
                      <th className="px-5 py-3 font-bold">Rule Vector Name</th>
                      <th className="px-5 py-3 font-bold">Category</th>
                      <th className="px-5 py-3 font-bold">Logic Description</th>
                      <th className="px-5 py-3 font-bold">Severity Base</th>
                      <th className="px-5 py-3 font-bold text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {(!rulesData?.rules || rulesData.rules.length === 0) ? (
                      <tr>
                        <td colSpan="5" className="py-12 text-center text-outline">
                          <span className="material-symbols-outlined text-3xl mb-2 opacity-50">code_blocks</span>
                          <p className="text-[11px] font-code-snippet uppercase tracking-widest">No custom rules deployed in shadow execution.</p>
                        </td>
                      </tr>
                    ) : (
                      rulesData.rules.map((r, i) => (
                        <tr key={i} className="hover:bg-surface-variant/10 transition-colors group">
                          <td className="px-5 py-4 font-bold text-on-surface text-sm">{r.rule_name}</td>
                          <td className="px-5 py-4">
                            <span className="bg-surface border border-outline-variant/50 text-on-surface-variant px-2 py-1 rounded text-[9px] font-code-snippet uppercase tracking-widest">
                              {r.category}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-on-surface-variant text-[11px] max-w-xs truncate leading-relaxed" title={r.description}>
                            {r.description}
                          </td>
                          <td className={`px-5 py-4 font-code-snippet font-bold text-[10px] uppercase tracking-wider ${LEVEL_STYLE[r.severity] || "text-outline"}`}>
                            {r.severity}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="inline-flex items-center gap-1.5 bg-tertiary/10 border border-tertiary/30 text-tertiary px-2 py-1 rounded text-[9px] font-code-snippet uppercase tracking-widest">
                              <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                              {r.status}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </main>
    </>
  );
}
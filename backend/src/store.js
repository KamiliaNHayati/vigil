// store.js — SQLite Local Store
// In-process storage — no external DB needed for demo

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.VIGIL_DB_PATH || path.join(__dirname, '../../vigil.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_address TEXT NOT NULL,
    session_id TEXT,
    pay_to TEXT,
    amount_wei TEXT,
    resource TEXT,
    risk_level TEXT,
    success INTEGER,
    vault_address TEXT,
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS session_intents (
    session_id TEXT PRIMARY KEY,
    agent_address TEXT NOT NULL,
    task_summary TEXT NOT NULL,
    summary_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_address TEXT NOT NULL,
    pay_to TEXT,
    amount_wei TEXT,
    resource TEXT,
    sensor_level TEXT,
    action TEXT,
    code TEXT,
    flags TEXT,
    explanation TEXT,
    verifier_aligned INTEGER,
    verifier_attempts INTEGER,
    degraded INTEGER DEFAULT 0,
    oracle_warning TEXT,
    timestamp INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_agent_ts ON actions(agent_address, timestamp);
  CREATE INDEX IF NOT EXISTS idx_session ON actions(session_id);
  CREATE INDEX IF NOT EXISTS idx_eval_ts ON evaluations(timestamp);
`);

/**
 * Store a session intent hash for drift detection.
 */
function storeSessionIntent(sessionId, agentAddress, taskSummary) {
  const hash = crypto.createHash('sha256').update(taskSummary).digest('hex');
  db.prepare(`INSERT OR REPLACE INTO session_intents VALUES (?, ?, ?, ?, ?)`)
    .run(sessionId, agentAddress, taskSummary, hash, Date.now());
  return hash;
}

/**
 * Get recent actions for rate limiting.
 * @param {string} agentAddress
 * @param {number} sinceMs - time window in milliseconds
 */
function getRecentActions(agentAddress, sinceMs) {
  return db.prepare(
    'SELECT * FROM actions WHERE agent_address = ? AND timestamp > ? ORDER BY timestamp DESC'
  ).all(agentAddress, Date.now() - sinceMs);
}

/**
 * Count actions in time window — more efficient than SELECT * when only count needed.
 */
function countRecentActions(agentAddress, sinceMs) {
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM actions WHERE agent_address = ? AND timestamp > ?'
  ).get(agentAddress, Date.now() - sinceMs);
  return row.count;
}

/**
 * Get 7-day successful action amounts for behavioral baseline.
 */
function getAgentBaseline(agentAddress) {
  return db.prepare(
    'SELECT amount_wei FROM actions WHERE agent_address = ? AND timestamp > ? AND success = 1'
  ).all(agentAddress, Date.now() - 7 * 24 * 3600 * 1000);
}

/**
 * Get total amount spent in a session — for context anomaly checks.
 */
function getSessionSpending(sessionId) {
  const row = db.prepare(
    `SELECT COALESCE(SUM(CAST(amount_wei AS INTEGER)), 0) as total_wei, COUNT(*) as count
     FROM actions WHERE session_id = ? AND success = 1`
  ).get(sessionId);
  return { totalWei: row.total_wei.toString(), count: row.count };
}

/**
 * Store an action record.
 */
function storeAction({ agentAddress, sessionId, payTo, amountWei, resource, riskLevel, success, vaultAddress }) {
  db.prepare(`
    INSERT INTO actions (agent_address, session_id, pay_to, amount_wei, resource, risk_level, success, vault_address, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(agentAddress, sessionId ?? null, payTo ?? null, amountWei ?? null, resource ?? null, riskLevel, success ? 1 : 0, vaultAddress ?? null, Date.now());
}

/**
 * Store an evaluation result for dashboard display.
 */
function storeEvaluation({ agentAddress, payTo, amountWei, resource, sensorLevel, action, code, flags, explanation, verifierAligned, verifierAttempts, degraded, oracleWarning }) {
  db.prepare(`
    INSERT INTO evaluations (agent_address, pay_to, amount_wei, resource, sensor_level, action, code, flags, explanation, verifier_aligned, verifier_attempts, degraded, oracle_warning, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    agentAddress, payTo ?? null, amountWei ?? null, resource ?? null,
    sensorLevel, action, code ?? null,
    JSON.stringify(flags ?? []), explanation ?? null,
    verifierAligned ? 1 : 0, verifierAttempts ?? 1,
    degraded ? 1 : 0, oracleWarning ?? null,
    Date.now()
  );
}

/**
 * Get recent evaluations for dashboard feed.
 */
function getRecentEvaluations(limit = 50) {
  return db.prepare(
    'SELECT * FROM evaluations ORDER BY timestamp DESC LIMIT ?'
  ).all(limit).map(row => ({
    ...row,
    flags: JSON.parse(row.flags || '[]'),
    verifier_aligned: !!row.verifier_aligned,
    degraded: !!row.degraded
  }));
}

module.exports = {
  db,
  storeSessionIntent,
  getRecentActions,
  countRecentActions,
  getAgentBaseline,
  getSessionSpending,
  storeAction,
  storeEvaluation,
  getRecentEvaluations
};

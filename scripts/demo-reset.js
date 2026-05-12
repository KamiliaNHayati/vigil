#!/usr/bin/env node
// scripts/demo-reset.js — Clear demo state for a clean run
// Wipes evaluations and recent actions so duplicate-payment rule doesn't fire
// Usage: node scripts/demo-reset.js

require('dotenv').config();
const { db } = require('../backend/src/store');

const tables = [
  { name: 'evaluations', label: 'Evaluations feed' },
  { name: 'actions',     label: 'Action history'  },
];

console.log('\n🧹 Vigil Demo Reset\n');

for (const t of tables) {
  const before = db.prepare(`SELECT COUNT(*) as n FROM ${t.name}`).get().n;
  db.prepare(`DELETE FROM ${t.name}`).run();
  console.log(`  ✓ ${t.label}: cleared ${before} rows`);
}

// Reset SQLite auto-increment counters
db.prepare(`DELETE FROM sqlite_sequence WHERE name IN ('evaluations','actions')`).run();

console.log('\n  ✅ Database reset — ready for a clean demo run\n');
process.exit(0);

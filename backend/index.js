// backend/index.js — Entry point for Vigil backend
// Loads environment, initializes store, and starts the MCP server

require('dotenv').config();

console.log('[Vigil] Starting backend...');
console.log(`[Vigil] Transport: ${process.env.MCP_TRANSPORT || 'stdio'}`);
console.log(`[Vigil] Kite RPC: ${process.env.KITE_RPC_URL || '(not set)'}`);

// Initialize store (creates SQLite tables on first run)
require('./src/store');
console.log('[Vigil] SQLite store initialized');

// Start MCP server (transport selected by MCP_TRANSPORT env var)
require('./src/mcp-server');

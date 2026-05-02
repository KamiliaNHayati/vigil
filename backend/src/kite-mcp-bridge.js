// kite-mcp-bridge.js — Kite Service Discovery Bridge
// Replaces the fictional ksearchClient.listServices() API.
// The "ksearch" name in Kite docs refers to agent service discovery via Kite's own MCP server
// — specifically the `discover_services` tool. catalogClient is a thin wrapper around this.
//
// For the hackathon demo, Kite's testnet MCP server is not yet live,
// so Vigil falls back to data/known-services-fallback.json.
// The validation logic is identical: the same isKnownService check runs regardless.

const path = require('path');

let FALLBACK;
try {
  FALLBACK = require(path.join(__dirname, '../../data/known-services-fallback.json'));
} catch {
  console.warn('[CatalogClient] Could not load fallback catalog, using empty array');
  FALLBACK = [];
}

let mcpClient = null;
let mcpInitAttempted = false;

/**
 * Attempt to connect to Kite's own MCP server.
 * Returns null if unavailable (expected during hackathon).
 */
async function getClient() {
  if (mcpClient) return mcpClient;
  if (mcpInitAttempted) return null; // Don't retry after first failure
  mcpInitAttempted = true;

  try {
    // Dynamic import to avoid breaking if @modelcontextprotocol/sdk client is unavailable
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

    const transport = new StdioClientTransport({
      command: 'kpass',
      args: ['mcp-server']
    });
    mcpClient = new Client({ name: 'vigil-bridge', version: '1.0.0' });
    await mcpClient.connect(transport);
    console.log('[CatalogClient] Connected to Kite MCP server');
    return mcpClient;
  } catch (err) {
    console.warn('[CatalogClient] Kite MCP server unavailable, using static fallback:', err.message);
    return null;
  }
}

/**
 * List available services from Kite catalog.
 * Falls back to static JSON if MCP server is unavailable.
 *
 * @param {Object} [options]
 * @param {number} [options.limit=50] - Max results
 * @param {string} [options.query] - Search query
 * @returns {Array} Array of service objects with payTo, resource, name, etc.
 */
async function listServices({ limit = 50, query } = {}) {
  const client = await getClient();
  if (!client) {
    // Static fallback path — the realistic demo path
    let services = FALLBACK;
    if (query) {
      const q = query.toLowerCase();
      services = services.filter(s =>
        s.name?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q) ||
        s.resource?.toLowerCase().includes(q)
      );
    }
    return services.slice(0, limit);
  }

  try {
    const result = await client.callTool({
      name: 'discover_services',
      arguments: { limit, query }
    });
    // Result shape: { services: [{ payTo, resource, name, maxAmountRequired }] }
    return result.services ?? FALLBACK.slice(0, limit);
  } catch (err) {
    console.warn('[CatalogClient] discover_services failed, using fallback:', err.message);
    return FALLBACK.slice(0, limit);
  }
}

// Wrapper object that sensor.js expects
const catalogClient = { listServices };

module.exports = { listServices, catalogClient };

// demo-agent/mock-kpass.js
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const CANNED_RESPONSES = {
  weather: {
    data: { temperature: 22, conditions: "sunny", humidity: 65 },
    settlement: "mock"
  },
  yield: {
    data: { apy: "8.5", tvl: "1200000" },
    settlement: "mock"
  }
};

async function kpassExecute(url, opts = {}) {
  // TRY REAL FIRST
  try {
    const args = [
      'agent:session', 'execute',
      '--url', url,
      '--method', 'GET',
      '--output', 'json'
    ];
    // Use capsule key if provided (one-shot session key from Vigil)
    if (opts.capsuleKey) {
      args.push('--key', opts.capsuleKey);
    }

    const { stdout } = await execFileAsync('kpass', args, { timeout: 10000 });

    const result = JSON.parse(stdout);
    if (result.status >= 400) throw new Error(`HTTP ${result.status}`);

    return {
      data: typeof result.body === 'string' ? JSON.parse(result.body) : result.body,
      settlement: result.settlement,
      source: 'real'
    };
  } catch (err) {
    console.warn(`[kpass] Real execute failed (${err.message}), falling back to mock`);

    // FALLBACK TO MOCK
    if (url.includes('weather')) return { ...CANNED_RESPONSES.weather, source: 'mock' };
    // if (url.includes('yield')) return { ...CANNED_RESPONSES.yield, source: 'mock' };
    return { data: { message: 'Mock response for ' + url }, source: 'mock' };
  }
}

module.exports = { kpassExecute };
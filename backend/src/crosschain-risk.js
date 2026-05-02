// crosschain-risk.js — LayerZero Cross-Chain Risk Module
// Kite AI natively supports LayerZero v2. Agents may pay services that carry funds
// off-chain via OFT contracts or relay calls — a cross-chain opacity risk.
//
// All contract addresses are from the official Kite mainnet LayerZero deployment docs.
// These are MAINNET addresses used as a blocklist on testnet — no legitimate testnet agent
// should ever pay these mainnet infrastructure addresses.
//
// Decision tree:
//   Is payTo in TRUSTED_CROSSCHAIN_SERVICES? → Pass
//   Is payTo a core LZ contract?             → CRITICAL
//   Is payTo a known OFT?                    → Trusted: pass / Untrusted: HIGH
//   Does URL contain cross-chain keyword?    → MEDIUM

require('dotenv').config();
const { ethers } = require('ethers');

// ── REAL Kite Mainnet LayerZero contracts ─────────────────────────────────────
// From official smart contract list: chainId 2366, endpointId 30406
const LZ_KITE_CONTRACTS = {
  ENDPOINT_V2:    '0x6F475642a6e85809B1c36Fa62763669b1b48DD5B',
  SEND_ULN302:    '0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7',
  RECEIVE_ULN302: '0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043',
  EXECUTOR:       '0x4208D6E27538189bB48E603D6123A94b8Abe0A0b',
  BLOCKED_LIB:    '0xc1ce56b2099ca68720592583c7984cab4b6d7e7a',
  DEAD_DVN:       '0x6788f52439ACA6BFF597d3eeC2DC9a44B8FEE842',
};

// Pre-compute lowercase set for O(1) lookup
const LZ_ADDRESSES_LOWER = new Set(
  Object.values(LZ_KITE_CONTRACTS).map(a => a.toLowerCase())
);

// ── Trusted cross-chain services ──────────────────────────────────────────────
const TRUSTED_CROSSCHAIN_SERVICES = new Set([
  'bridge.prod.gokite.ai',
  'www.tesseract.finance',
]);

// ── Trusted OFT addresses ─────────────────────────────────────────────────────
// Populate with real deployed OFT addresses when available
const TRUSTED_OFTS = new Set([
  // e.g., '0xYourTrustedOFTAddress'.toLowerCase()
]);

// ── Demo OFT addresses ───────────────────────────────────────────────────────
// In production: replace with ERC-165 interface detection or registry query
const DEMO_OFTS = new Set([
  // e.g., '0xYourDemoOFTAddress'.toLowerCase()
]);

// ── URL keywords hinting at cross-chain interaction ──────────────────────────
const CROSSCHAIN_KEYWORDS = [
  'crosschain', 'cross-chain', 'layerzero', 'lz', 'oft',
  'bridge', 'omnichain', 'relay'
];

/**
 * Check cross-chain risk for a payment target.
 *
 * @param {string} payTo - Recipient address
 * @param {string} resource - Service URL
 * @returns {{ flags: Array, isCrossChain: boolean, trusted: boolean }}
 */
async function checkCrossChainRisk(payTo, resource) {
  const flags = [];
  const payToLower = payTo.toLowerCase();

  // Extract hostname for trusted service check
  let hostname = '';
  try {
    hostname = new URL(resource).hostname.toLowerCase();
  } catch {
    // Invalid URL — will fail validation elsewhere
  }

  // Check 0: Is this a known trusted cross-chain service?
  if (TRUSTED_CROSSCHAIN_SERVICES.has(hostname)) {
    return { flags: [], isCrossChain: true, trusted: true };
  }

  // Check 1: Core LZ infrastructure — agents must NEVER pay these directly
  if (LZ_ADDRESSES_LOWER.has(payToLower)) {
    flags.push({
      level: 'CRITICAL',
      reason: 'Payment targets a LayerZero core contract — misdirected or malicious'
    });
    return { flags, isCrossChain: true, trusted: false };
  }

  // Check 2: Known OFT contract
  const isOFT = DEMO_OFTS.has(payToLower) || await detectOFTInterface(payToLower);
  if (isOFT) {
    if (!TRUSTED_OFTS.has(payToLower)) {
      flags.push({
        level: 'HIGH',
        reason: 'Cross-chain payment to unrecognised OFT — verify remote chain and destination contract'
      });
    }
    return { flags, isCrossChain: true, trusted: TRUSTED_OFTS.has(payToLower) };
  }

  // Check 3: URL keyword hint
  const urlLower = (resource ?? '').toLowerCase();
  const matchedKeyword = CROSSCHAIN_KEYWORDS.find(kw => urlLower.includes(kw));
  if (matchedKeyword) {
    flags.push({
      level: 'MEDIUM',
      reason: 'Service URL suggests cross-chain interaction — verify destination chain'
    });
    return { flags, isCrossChain: true, trusted: false };
  }

  return { flags: [], isCrossChain: false, trusted: false };
}

/**
 * Production-ready OFT detection via ERC-165 interface check.
 * For hackathon: falls back to hardcoded demo set if RPC call fails.
 */
async function detectOFTInterface(addressLower) {
  if (!process.env.KITE_RPC_URL) return false;

  try {
    const provider = new ethers.JsonRpcProvider(process.env.KITE_RPC_URL);
    const ERC165_ABI = ['function supportsInterface(bytes4 interfaceId) view returns (bool)'];
    const contract = new ethers.Contract(addressLower, ERC165_ABI, provider);
    // Common OFT interface ID — verify against actual OFT implementation
    const OFT_INTERFACE_ID = '0x02e49c2c'; // IOAppCore from LZ v2
    return await contract.supportsInterface(OFT_INTERFACE_ID);
  } catch {
    // RPC failed or not a contract — fall back to hardcoded set
    return DEMO_OFTS.has(addressLower);
  }
}

module.exports = { checkCrossChainRisk, LZ_KITE_CONTRACTS, LZ_ADDRESSES_LOWER };

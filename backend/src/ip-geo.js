// backend/src/ip-geo.js
const dns = require('dns').promises;
const HIGH_RISK = require('../../data/high-risk-regions.json');

async function checkIPGeo(resource) {
  const hostname = new URL(resource).hostname;
  let ip;
  try {
    const addresses = await dns.resolve4(hostname);
    if (addresses.length === 0) return null;
    ip = addresses[0];
  } catch {
    return null; // DNS failure – skip
  }

  // DEMO MOCK: in production, use a Geo-IP database or service
  const mockGeo = getMockGeoData(ip, hostname);
  if (!mockGeo) return null;

  const regionMatch = HIGH_RISK.regions.includes(mockGeo.countryCode);
  const asnMatch = HIGH_RISK.asns.includes(mockGeo.asn);

  if (regionMatch || asnMatch) {
    return {
      level: 'MEDIUM',
      reason: `Service IP ${ip} is in a high-risk jurisdiction (${mockGeo.countryCode})`
    };
  }
  return null;
}

// Mock for hackathon – hardcode IPs for demo domains
function getMockGeoData(ip, hostname) {
  const MOCK_MAP = {
    '93.184.216.34': { countryCode: 'US', asn: 15133 },
    '5.255.100.100': { countryCode: 'RU', asn: 44444 }
  };
  // For demo, map your attack domain to a Russian IP
  return MOCK_MAP[ip] || null;
}
module.exports = { checkIPGeo };
const MALICIOUS_HOSTS = new Set(
  require('../../data/malicious-domains.json').map(d => d.toLowerCase())
);

function checkDomainReputation(resource) {
  try {
    const host = new URL(resource).hostname.toLowerCase();
    // Check exact host and parent domain
    const parts = host.split('.');
    const parentDomain = parts.slice(-2).join('.'); // e.g., "fake-kite.io"
    if (MALICIOUS_HOSTS.has(host) || MALICIOUS_HOSTS.has(parentDomain)) {
      return {
        level: 'CRITICAL',
        reason: `Domain "${host}" is a known malicious host`
      };
    }
  } catch {}
  return null;
}
module.exports = { checkDomainReputation };
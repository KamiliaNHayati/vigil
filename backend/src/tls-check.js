const tls = require('tls');
function checkTLS(url) {
  return new Promise((resolve) => {
    try {
      const hostname = new URL(url).hostname;
      const socket = tls.connect({ host: hostname, port: 443, servername: hostname }, () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.raw) {
          resolve({ level: 'HIGH', reason: 'Invalid or self‑signed SSL certificate' });
        } else if (cert.issuer && cert.issuer.O === 'Fake CA') {
          resolve({ level: 'CRITICAL', reason: 'Certificate issued by suspicious CA' });
        } else {
          resolve(null);
        }
      });
      socket.on('error', () => resolve(null)); // skip on error
    } catch { resolve(null); }
  });
}
module.exports = { checkTLS };
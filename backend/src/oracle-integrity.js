// Mock for demo: compare a known aggregator price
async function checkOracleIntegrity(resource, expectedPrice) {
  // For demo, if resource contains "price" and expectedPrice is provided by agent
  if (resource.includes('price') && expectedPrice) {
    // Fetch alternative data (mock here, but could call a Chainlink contract)
    const referencePrice = 1.00; // static dummy
    const deviation = Math.abs(expectedPrice - referencePrice) / referencePrice;
    if (deviation > 0.05) {
      return { level: 'MEDIUM', reason: `Price deviates ${(deviation*100).toFixed(1)}% from reference oracle` };
    }
  }
  return null;
}
module.exports = { checkOracleIntegrity };
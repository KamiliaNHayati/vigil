const ethers = require('ethers');
// Kite vault ABI (minimal for addSessionKeyRule)
const VAULT_ABI = [
  "function addSessionKeyRule(address sessionKey, bytes32 agentId, bytes4 functionSelector, uint256 valueLimit, uint48 validUntil, address allowedRecipient) external"
];

async function deployCapsule({ signer, vaultAddress, agentId, payTo, amountWei, ttlMinutes = 5 }) {
  const provider = signer.provider;
  const vault = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
  
  // Generate a random session key
  const capsuleSigner = ethers.Wallet.createRandom().connect(provider);
  const capsuleAddress = await capsuleSigner.getAddress();
  
  const validUntil = Math.floor(Date.now() / 1000) + ttlMinutes * 60;
  const functionSelector = ethers.id("pay(address,uint256)").slice(0, 10); // adjust to actual payment function sig
  const agentIdBytes = ethers.zeroPadBytes(ethers.toUtf8Bytes(agentId), 32);
  
  const tx = await vault.addSessionKeyRule(
    capsuleAddress,
    agentIdBytes,
    functionSelector,
    amountWei,          // valueLimit = exact amount
    validUntil,
    payTo               // allowedRecipient
  );
  await tx.wait();
  
  // Fund the vault slot if needed (the vault already holds funds from the main budget)
  // Actually the rule just authorizes; the main vault balance is used. So no explicit funding of a sub-vault needed. The existing vault funds are already there; the rule limits what the session key can spend from the main vault.
  
  return {
    capsulePrivateKey: capsuleSigner.privateKey,
    capsuleAddress: capsuleAddress,
    expiresAt: validUntil
  };
}
module.exports = { deployCapsule };
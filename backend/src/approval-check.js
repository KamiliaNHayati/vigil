const ethers = require('ethers');
const ERC20_ABI = ['function allowance(address owner, address spender) view returns (uint256)'];

async function checkUnlimitedApprovals(agentAddress, payTo, tokenAddresses) {
  const provider = new ethers.JsonRpcProvider(process.env.KITE_RPC_URL);
  for (const token of tokenAddresses) {
    const contract = new ethers.Contract(token, ERC20_ABI, provider);
    const allowance = await contract.allowance(agentAddress, payTo);
    if (allowance > ethers.parseUnits('10000', 18)) { // >10k tokens
      return { level: 'HIGH', reason: `Agent has unlimited or excessive token allowance for ${payTo}` };
    }
  }
  return null;
}
module.exports = { checkUnlimitedApprovals };
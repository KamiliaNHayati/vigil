// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title AgentRegistry
 * @notice On-chain per-agent reputation with circular-buffer trace hashes.
 *         The traceHash stored here is a timestamped commitment — it proves
 *         that Vigil recorded a risk evaluation at this time, creating an
 *         auditable anchor point. It does not cryptographically attest to
 *         the validity of the data itself.
 *
 * @dev Access control: only the deployed Vigil backend (reporter) can write reputation.
 *      Production: replace onlyReporter with agent-signature verification.
 */
contract AgentRegistry {
    uint8 public constant MAX_TRACES = 10;

    // Access control: only the deployed Vigil backend can write reputation
    address public reporter;
    
    modifier onlyReporter() {
        require(msg.sender == reporter, "AgentRegistry: caller is not authorized reporter");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "AgentRegistry: paused");
        _;
    }

    constructor(address _reporter) {
        reporter = _reporter;
    }

    struct Profile {
        uint256 reputationScore;
        uint256 totalActions;
        uint256 successfulActions;
        uint256 failedActions;
        bytes32[10] recentTraces;   // Circular buffer
        uint8 traceIndex;
    }

    mapping(address => Profile) public agents;

    event ActionRecorded(
        address indexed agent,
        bool success,
        bytes32 traceHash,
        uint8 riskLevel
    );

    /**
     * @notice Record an agent action outcome.
     * @param agent      Agent wallet address
     * @param success    Whether the payment succeeded
     * @param traceHash  Keccak256 hash of the full risk report
     * @param riskLevel  0=LOW, 1=MEDIUM, 2=HIGH, 3=CRITICAL
     */
    function recordAction(
        address agent,
        bool success,
        bytes32 traceHash,
        uint8 riskLevel
    ) external onlyReporter whenNotPaused {
        require(agent != address(0), "AgentRegistry: zero agent address");
        require(riskLevel <= 3, "AgentRegistry: riskLevel out of bounds");
        
        // CRITICAL success is a protocol violation — force as failure
        if (success && riskLevel == 3) {
            success = false;
        }

        Profile storage p = agents[agent];
        p.totalActions++;
        p.recentTraces[p.traceIndex % MAX_TRACES] = traceHash;
        p.traceIndex++;

        if (success) {
            p.successfulActions++;
            // LOW=+10, MEDIUM=+15, HIGH=+25
            uint256 gain = riskLevel == 2 ? 25 : (riskLevel == 1 ? 15 : 10);
            p.reputationScore = _min(10000, p.reputationScore + gain);
        } else {
            p.failedActions++;
            // LOW=-20, MEDIUM=-50, HIGH=-100, CRITICAL=-100
            uint256 penalty;
            if (riskLevel == 0) penalty = 20;
            else if (riskLevel == 1) penalty = 50;
            else penalty = 100; // HIGH or CRITICAL
            p.reputationScore = p.reputationScore > penalty ? p.reputationScore - penalty : 0;
        }

        emit ActionRecorded(agent, success, traceHash, riskLevel);
    }

    /**
     * @notice Transfer reporter role to a new address.
     */
    function transferReporter(address newReporter) external onlyReporter {
        require(newReporter != address(0), "AgentRegistry: zero address");
        reporter = newReporter;
    }

    /**
     * @notice Get trust tier for an agent.
     * @return 0=New (<5 actions), 1=Established, 2=Trusted (>6000), 3=Verified (>9000)
     */
    function getTrustTier(address agent) external view returns (uint8) {
        Profile storage p = agents[agent];
        if (p.totalActions < 5) return 0;
        if (p.reputationScore > 9000) return 3;
        if (p.reputationScore > 6000) return 2;
        return 1;
    }

    /**
     * @notice Get full agent profile.
     */
    function getProfile(address agent) external view returns (
        uint256 score, uint256 total, uint256 successful, uint256 failed
    ) {
        Profile storage p = agents[agent];
        return (p.reputationScore, p.totalActions, p.successfulActions, p.failedActions);
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}

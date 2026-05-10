// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title AgentRegistry
 * @notice On-chain per-agent reputation with circular-buffer trace hashes.
 *
 * SECURITY NOTES:
 * - traceHash is a timestamped commitment. It proves Vigil recorded a risk
 *   evaluation at this time. It does not cryptographically attest to the
 *   validity of the underlying data.
 * - onlyReporter prevents reputation spoofing. Production: replace with
 *   agent-signature verification or a multisig reporter.
 * - CRITICAL success is treated as a protocol violation and forced to failure.
 *
 * AUDIT CHECKLIST:
 * - No reentrancy risk: state-only writes, no external calls
 * - No overflow risk: Solidity 0.8.x built-in checks + explicit _min cap
 * - No unbounded loops: circular buffer is O(1)
 * - Access control: onlyReporter on all writes
 * - Pausable: owner can pause writes without destroying state
 */
contract AgentRegistry {

    // ─── Constants ──────────────────────────────────────────────────────────

    uint8   public constant MAX_TRACES       = 10;
    uint256 public constant MAX_SCORE        = 10000;
    uint8   public constant MIN_RISK_LEVEL   = 0;
    uint8   public constant MAX_RISK_LEVEL   = 3;

    // ─── State ───────────────────────────────────────────────────────────────

    address public reporter;
    bool    public paused;          // FIX: was used in modifier but never declared

    // ─── Structs ─────────────────────────────────────────────────────────────

    struct Profile {
        uint256 reputationScore;    // 0–10000
        uint256 totalActions;
        uint256 successfulActions;
        uint256 failedActions;
        bytes32[10] recentTraces;   // Circular buffer — O(1) insert
        uint256   traceIndex;         // Wraps at 255 → 0; fine for MAX_TRACES=10
    }

    // ─── Storage ─────────────────────────────────────────────────────────────

    mapping(address => Profile) public agents;

    // ─── Events ──────────────────────────────────────────────────────────────

    event ActionRecorded(
        address indexed agent,
        bool    success,
        bytes32 traceHash,
        uint8   riskLevel
    );
    event CriticalSuccessOverridden(address indexed agent, bytes32 traceHash);
    event ReporterTransferred(address indexed previousReporter, address indexed newReporter);
    event Paused(address by);
    event Unpaused(address by);

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier onlyReporter() {
        require(msg.sender == reporter, "AgentRegistry: not reporter");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "AgentRegistry: paused");
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _reporter) {
        require(_reporter != address(0), "AgentRegistry: zero reporter");
        reporter = _reporter;
        paused   = false;
    }

    // ─── Write Functions ─────────────────────────────────────────────────────

    /**
     * @notice Record an agent action outcome.
     * @param agent      Agent wallet address
     * @param success    Whether the payment succeeded
     * @param traceHash  keccak256 of the full Vigil risk report JSON
     * @param riskLevel  0=LOW, 1=MEDIUM, 2=HIGH, 3=CRITICAL
     */
    function recordAction(
        address agent,
        bool    success,
        bytes32 traceHash,
        uint8   riskLevel
    ) external onlyReporter whenNotPaused {
        require(agent    != address(0), "AgentRegistry: zero agent");
        require(riskLevel <= MAX_RISK_LEVEL, "AgentRegistry: riskLevel out of bounds");

        // Protocol invariant: CRITICAL payments are always blocked pre-execution.
        // If somehow a CRITICAL+success arrives, treat it as a failure.
        if (success && riskLevel == MAX_RISK_LEVEL) {
            success = false;
            emit CriticalSuccessOverridden(agent, traceHash);
        }

        Profile storage p = agents[agent];

        // Circular buffer insert — O(1), no unbounded loop
        p.recentTraces[p.traceIndex % MAX_TRACES] = traceHash;
        p.totalActions++;

        if (success) {
            p.successfulActions++;
            // LOW(0)=+10, MEDIUM(1)=+15, HIGH(2)=+25
            uint256 gain = riskLevel == 2 ? 25 : (riskLevel == 1 ? 15 : 10);
            p.reputationScore = _min(MAX_SCORE, p.reputationScore + gain);
        } else {
            p.failedActions++;
            // LOW(0)=-20, MEDIUM(1)=-50, HIGH(2)=-100, CRITICAL(3)=-100
            uint256 penalty = riskLevel == 0 ? 20 : (riskLevel == 1 ? 50 : 100);
            p.reputationScore = p.reputationScore > penalty
                ? p.reputationScore - penalty
                : 0;
        }

        emit ActionRecorded(agent, success, traceHash, riskLevel);
    }

    /**
     * @notice Transfer reporter role.
     * @dev Two-step transfer not implemented (hackathon scope).
     *      Production: use a pending-reporter pattern to prevent fat-finger.
     */
    function transferReporter(address newReporter) external onlyReporter {
        require(newReporter != address(0), "AgentRegistry: zero address");
        emit ReporterTransferred(reporter, newReporter);
        reporter = newReporter;
    }

    /**
     * @notice Pause all writes. Reads remain unaffected.
     */
    function pause() external onlyReporter {
        require(!paused, "AgentRegistry: already paused");
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @notice Unpause writes.
     */
    function unpause() external onlyReporter {
        require(paused, "AgentRegistry: not paused");
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ─── View Functions ──────────────────────────────────────────────────────

    /**
     * @notice Get trust tier for an agent.
     * @return 0=New (<5 actions), 1=Established, 2=Trusted (>6000), 3=Verified (>9000)
     */
    function getTrustTier(address agent) external view returns (uint8) {
        Profile storage p = agents[agent];
        if (p.totalActions  < 5)    return 0; // New
        if (p.reputationScore > 9000) return 3; // Verified
        if (p.reputationScore > 6000) return 2; // Trusted
        return 1;                               // Established
    }

    /**
     * @notice Get full agent profile stats.
     */
    function getProfile(address agent) external view returns (
        uint256 score,
        uint256 total,
        uint256 successful,
        uint256 failed
    ) {
        Profile storage p = agents[agent];
        return (p.reputationScore, p.totalActions, p.successfulActions, p.failedActions);
    }

    /**
     * @notice Get recent trace hashes (returns all 10 slots; unset = bytes32(0)).
     */
    function getRecentTraces(address agent) external view returns (bytes32[10] memory) {
        return agents[agent].recentTraces;
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}

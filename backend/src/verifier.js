// verifier.js — Verification Loop (Core Feature)
// Checks alignment between sensor output and LLM guide explanation.
// Three safeguards:
//   (1) expanded false-safety terms list (10 terms)
//   (2) null guard on explanation
//   (3) hallucinationRisk flag surfaced for Policy to differentiate
//
// Retry logic: attempt 1 → fail → retry with correction prompt → fail → BLOCK

const guideEngine = require('./guide');

// Expanded — LLMs commonly use these to rationalise HIGH/CRITICAL risk
const FALSE_SAFETY_TERMS = [
  'safe', 'low risk', 'no concern', 'fine', 'trusted', 'approved',
  'routine', 'standard', 'normal', 'nothing unusual'
];

/**
 * Check if the guide's explanation aligns with the sensor's risk assessment.
 *
 * @param {Object} sensorResult - { level: string, flags: Array }
 * @param {Object} guideResult  - { riskLevel: string, explanation: string, primaryConcern: string|null }
 * @returns {{ aligned: boolean, issues: string[], hallucinationRisk: boolean }}
 */
function checkAlignment(sensorResult, guideResult) {
  const issues = [];
  // Null guard: explanation might be missing on schema violations
  const normalizedExpl = (guideResult.explanation ?? '').toLowerCase();

  // Check 1: Risk level must match sensor's finalLevel
  if (guideResult.riskLevel !== sensorResult.level) {
    issues.push(`Risk level mismatch: sensor=${sensorResult.level}, guide=${guideResult.riskLevel}`);
  }

  // Check 2: CRITICAL must start with WARNING:
  if (sensorResult.level === 'CRITICAL' && !normalizedExpl.startsWith('warning:')) {
    issues.push('CRITICAL risk not prefixed with WARNING in explanation');
  }

  // Check 3: No false-safety language on HIGH/CRITICAL
  const highRisk = ['HIGH', 'CRITICAL'].includes(sensorResult.level);
  if (highRisk) {
    const isFalseSafe = FALSE_SAFETY_TERMS.some(t => normalizedExpl.includes(t));
    if (isFalseSafe) {
      issues.push('Guide falsely characterises HIGH/CRITICAL risk as safe');
      // Mark as hallucination risk — Policy will fast-path block, no retry
      return { aligned: false, issues, hallucinationRisk: true };
    }
  }

  // Check 4: At least one HIGH/CRITICAL flag must be referenced in explanation
  const criticalFlags = sensorResult.flags.filter(f => ['CRITICAL', 'HIGH'].includes(f.level));
  if (criticalFlags.length > 0) {
    const explWords = normalizedExpl.split(/\W+/);
    const mentionsFlag = criticalFlags.some(f => {
      const keywords = f.reason.toLowerCase().split(/\W+/).filter(w => w.length > 4);
      return keywords.some(kw => explWords.includes(kw));
    });
    if (!mentionsFlag) {
      issues.push(`Guide does not mention critical flags: ${criticalFlags.map(f => f.reason).join(', ')}`);
    }
  }

  return { aligned: issues.length === 0, issues, hallucinationRisk: false };
}

/**
 * Full verification loop: check alignment, retry if needed.
 *
 * @param {Object} sensorResult - Sensor output
 * @param {Object} guideResult  - First guide explanation
 * @param {Object} intent       - Original payment intent (for retry)
 * @returns {{ aligned: boolean, guide: Object, attempts: number, issues: string[]|null, hallucinationRisk: boolean }}
 */
async function verify(sensorResult, guideResult, intent) {
  const first = checkAlignment(sensorResult, guideResult);

  // Hallucination risk: fast-path block, no retry
  // Rationale: if the LLM is actively lying about safety, a retry is unreliable
  if (first.hallucinationRisk) {
    return { aligned: false, guide: guideResult, attempts: 1,
             issues: first.issues, hallucinationRisk: true };
  }

  if (first.aligned) {
    return { aligned: true, guide: guideResult, attempts: 1, hallucinationRisk: false };
  }

  // One retry with explicit correction
  // Why not more retries? Cost + latency. After one correction the LLM has had its chance.
  try {
    const correctedGuide = await guideEngine.explainWithCorrection({
      ...intent,
      sensorResult,
      previousExplanation: guideResult.explanation,
      issues: first.issues
    });

    const second = checkAlignment(sensorResult, correctedGuide);
    return {
      aligned:          second.aligned,
      guide:            correctedGuide,
      attempts:         2,
      issues:           second.aligned ? null : second.issues,
      hallucinationRisk: second.hallucinationRisk ?? false
    };
  } catch (err) {
    console.warn('[Verifier] Retry failed:', err.message);
    return {
      aligned: false,
      guide: guideResult,
      attempts: 2,
      issues: [...first.issues, `Retry failed: ${err.message}`],
      hallucinationRisk: false
    };
  }
}

module.exports = { checkAlignment, verify };

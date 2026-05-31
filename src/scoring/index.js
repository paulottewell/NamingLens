import { scoreCollisionResilience }       from "./dimensions/collisionResilience.js"
import { scorePrivacyDataMinimisation }  from "./dimensions/privacyDataMinimisation.js"
import { scoreSafeguardingExposure }     from "./dimensions/safeguardingExposure.js"
import { scoreRecognisability }          from "./dimensions/recognisability.js"
import { scoreEnumerationResistance }    from "./dimensions/enumerationResistance.js"
import { scoreUsabilityByPhase }         from "./dimensions/usabilityByPhase.js"
import { scoreOperationalRobustness }    from "./dimensions/operationalRobustness.js"
import { scoreChangeabilityLifecycle }   from "./dimensions/changeabilityLifecycle.js"
import { scoreInteroperability }         from "./dimensions/interoperability.js"
import { evaluateWarnings }             from "./warnings/warningRules.js"
import { classifyDecisionPosture, buildDecisionProfile } from "./profiles/decisionPosture.js"
import { computeCompositeScore }         from "./overall/compositeScore.js"
import { computeFallbackStats, computeFairnessStats } from "./exposure/piiHelpers.js"

export { DIMENSION_WEIGHTS, DIMENSION_LABELS, DIMENSION_ORDER, weightedOverall } from "./overall/weights.js"

export function computeAllScores({
  primaryTokens,
  allAddressTokens,
  allDnTokens,
  addressLevels,
  dnLevels,
  totalPupils,
  stats,
  subdomainMode,
  mode,
}) {
  const fallbackStats  = computeFallbackStats(addressLevels, totalPupils)
  const fairnessStats  = computeFairnessStats(addressLevels, totalPupils)
  const allAddrFlat    = allAddressTokens.flat()
  const allDnFlat      = allDnTokens.flat()

  // Compute all dimension scores
  const collisionResilience     = scoreCollisionResilience(stats, addressLevels, totalPupils)
  const privacyDataMinimisation = scorePrivacyDataMinimisation(addressLevels, dnLevels, totalPupils, subdomainMode, mode)
  const safeguardingExposure    = scoreSafeguardingExposure(addressLevels, dnLevels, totalPupils, subdomainMode, mode)
  const recognisability         = scoreRecognisability(primaryTokens, addressLevels, totalPupils)
  const enumerationResistance   = scoreEnumerationResistance(primaryTokens)
  const usabilityByPhase        = scoreUsabilityByPhase(stats, primaryTokens)
  const operationalRobustness   = scoreOperationalRobustness(primaryTokens, addressLevels, totalPupils, stats)
  const changeabilityLifecycle  = scoreChangeabilityLifecycle(allAddrFlat, primaryTokens)
  const interoperability        = scoreInteroperability(primaryTokens, stats)

  const scores = {
    collisionResilience,
    privacyDataMinimisation,
    safeguardingExposure,
    recognisability,
    enumerationResistance,
    usabilityByPhase,
    operationalRobustness,
    changeabilityLifecycle,
    interoperability,
  }

  // Warnings use fallback stats from the collision resilience result for consistency
  const warnings = evaluateWarnings({
    primaryTokens,
    allAddressTokens,
    allDnTokens,
    addressLevels,
    dnLevels,
    totalPupils,
    subdomainMode,
    stats,
    fallbackStats: collisionResilience.fallbackStats,
    fairnessStats,
  })

  const { rawScore, adjustedScore, riskBand } = computeCompositeScore(scores, warnings)

  const postureClassification = classifyDecisionPosture(scores, warnings)
  const decisionProfile = buildDecisionProfile(scores, warnings, postureClassification)

  return {
    scores,
    warnings,
    rawScore,
    adjustedScore,
    riskBand,
    decisionProfile,
    fallbackStats: collisionResilience.fallbackStats,
    fairnessStats,
  }
}

import { weightedOverall } from "./weights.js"

// Hard caps applied when serious issues are present.
function applyCaps(rawScore, scores, warnings) {
  let maxScore = 5

  const hasRed = warnings.some((w) => w.severity === "red")

  // Any red warning caps the overall score.
  if (hasRed) maxScore = Math.min(maxScore, 3.0)

  // External domain discloses school location — serious privacy issue.
  if (warnings.some((w) => w.id === "external-school-location")) {
    maxScore = Math.min(maxScore, 3.5)
  }

  // Full name exposed for all pupils.
  if (warnings.some((w) => w.id === "full-name-all-pupils")) {
    if (scores.privacyDataMinimisation) {
      scores.privacyDataMinimisation = {
        ...scores.privacyDataMinimisation,
        score: Math.min(scores.privacyDataMinimisation.score, 3),
      }
    }
  }

  // Critical collision rate.
  if ((scores.collisionResilience?.score ?? 5) === 1) {
    maxScore = Math.min(maxScore, 3.0)
  }

  // Deep fallback cascade.
  if (warnings.some((w) => w.id === "deep-fallback-cascade")) {
    maxScore = Math.min(maxScore, 2.5)
  }

  return Math.min(rawScore, maxScore)
}

function riskBandForScore(adjustedScore, hasRed, hasAmber) {
  if (hasRed || adjustedScore <= 2) return "High risk"
  if (adjustedScore < 3)            return "Elevated risk"
  if (adjustedScore < 3.5 && hasAmber) return "Needs review"
  if (adjustedScore < 4)            return "Acceptable"
  if (adjustedScore < 4.5)          return "Good"
  return "Strong"
}

export function computeCompositeScore(scores, warnings) {
  const rawScore   = weightedOverall(scores)
  if (rawScore == null) return { rawScore: null, adjustedScore: null, riskBand: null }

  const adjustedScore = parseFloat(applyCaps(rawScore, scores, warnings).toFixed(2))
  const rawRounded    = parseFloat(rawScore.toFixed(2))

  const hasRed   = warnings.some((w) => w.severity === "red")
  const hasAmber = warnings.some((w) => w.severity === "amber")
  const riskBand = riskBandForScore(adjustedScore, hasRed, hasAmber)

  return { rawScore: rawRounded, adjustedScore, riskBand }
}

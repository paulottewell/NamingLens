import { clamp } from "../utils.js"
import { hasToken, populationWeightedScore } from "../exposure/piiHelpers.js"

function tokenRecognisabilityScore(tokens) {
  const hasFullFirst = hasToken(tokens, "first")
  const hasFullLast  = hasToken(tokens, "last")
  const hasInitFirst = hasToken(tokens, "f", "ff", "fff")
  const hasInitLast  = hasToken(tokens, "l")

  const nameScore =
    (hasFullFirst ? 2 : hasInitFirst ? 1 : 0) +
    (hasFullLast  ? 2 : hasInitLast  ? 1 : 0)

  return clamp(nameScore + 1, 1, 5)
}

export function scoreRecognisability(primaryTokens, addressLevels, totalPupils) {
  const primaryScore = tokenRecognisabilityScore(primaryTokens)
  const popWeighted  = populationWeightedScore(addressLevels, totalPupils, tokenRecognisabilityScore)

  return {
    score: primaryScore,
    primaryPatternScore: primaryScore,
    populationWeightedScore: parseFloat(popWeighted.toFixed(2)),
    rationale: buildRationale(primaryScore, primaryTokens, popWeighted),
  }
}

function buildRationale(score, tokens, popWeighted) {
  const hasFullFirst = hasToken(tokens, "first")
  const hasFullLast  = hasToken(tokens, "last")
  const hasInitFirst = hasToken(tokens, "f", "ff", "fff")
  const hasInitLast  = hasToken(tokens, "l")

  const parts = []
  if (hasFullFirst) parts.push("full first name")
  else if (hasInitFirst) parts.push("first initial")
  if (hasFullLast)  parts.push("full surname")
  else if (hasInitLast)  parts.push("surname initial")

  let r
  if (parts.length === 0) {
    r = "No name component in the primary pattern. The address is opaque — a pupil, parent, teacher or IT support person cannot identify whose it is without a directory lookup."
  } else {
    r = `Primary address includes ${parts.join(" and ")}.`
    if (score >= 4) {
      r += " Anyone reading the address can immediately identify whose it is — practical for staff, parents and helpdesk triage without a directory lookup."
    } else if (score === 3) {
      r += " The name signal is partial — most readers can make an educated guess, but confirmation may require a directory lookup."
    } else {
      r += " The name signal is minimal. The address hints at identity but does not clearly convey it."
    }
  }

  const gap = parseFloat((score - popWeighted).toFixed(2))
  if (gap > 0.3) {
    r += ` Population-weighted recognisability is ${popWeighted.toFixed(1)}/5 — fallback levels introduce less recognisable patterns for some pupils.`
  }

  return r
}

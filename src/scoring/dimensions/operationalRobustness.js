import { clamp } from "../utils.js"
import { hasToken } from "../exposure/piiHelpers.js"
import { computeFallbackStats } from "../exposure/piiHelpers.js"

export function scoreOperationalRobustness(primaryTokens, addressLevels, totalPupils, stats) {
  const fs = computeFallbackStats(addressLevels, totalPupils)

  let score = 5

  // Determinism: addresses that can be regenerated exactly are more robust.
  // Random tokens mean disaster recovery or reprovisioning may create different addresses.
  const hasRandom = hasToken(primaryTokens, "NN", "NNN", "NNNN", "A", "AA", "AAA", "AAAA")
  if (hasRandom) score -= 0.5

  // Fallback depth increases operational complexity.
  if (fs.maxDepthUsed >= 4) score -= 2
  else if (fs.maxDepthUsed === 3) score -= 1.5
  else if (fs.maxDepthUsed === 2) score -= 0.75

  // High fallback population means common names create support burden.
  if (fs.pctLevel2Plus > 10) score -= 1
  else if (fs.pctLevel2Plus > 3) score -= 0.5

  // Full name tokens introduce normalisation edge cases (apostrophes, hyphens,
  // double-barrelled names, accented characters, spaces).
  const usesFullName = hasToken(primaryTokens, "first", "last", "middle")
  if (usesFullName) score -= 0.5

  // School token: changes if pupil transfers between schools in a MAT.
  if (hasToken(primaryTokens, "school", "schoolname")) score -= 0.25

  // Very long average addresses are harder to communicate and support.
  if (stats.avgLength > 30) score -= 0.5
  else if (stats.avgLength > 25) score -= 0.25

  return {
    score: clamp(parseFloat(score.toFixed(1)), 1, 5),
    rationale: buildRationale(score, primaryTokens, fs, stats, hasRandom, usesFullName),
  }
}

function buildRationale(score, tokens, fs, stats, hasRandom, usesFullName) {
  const points = []

  if (!hasRandom) {
    points.push("Deterministic generation — addresses can be exactly reproduced during disaster recovery or MIS migration without lookup tables")
  } else {
    points.push("Contains a seeded random element — reprovisioning will generate the same address only if the same seed is used; verify your provisioning tool supports this")
  }

  if (fs.maxDepthUsed >= 3) {
    points.push(`Cascade reaches fallback level ${fs.maxDepthUsed} — deep fallback logic is harder to document, explain to staff and support at scale`)
  } else if (fs.maxDepthUsed === 0) {
    points.push("No fallback levels configured — all collisions must be resolved manually or by adding fallbacks")
  }

  if (fs.pctLevel2Plus > 3) {
    points.push(`${fs.pctLevel2Plus.toFixed(1)}% of pupils require two or more fallback levels — this creates a visible second tier of addresses that may confuse staff and helpdesk`)
  }

  if (usesFullName) {
    points.push("Full name tokens introduce normalisation edge cases: apostrophes (O'Neill), hyphens (Smith-Jones), double-barrelled names, accented characters and spaces all need handling by the provisioning system")
  }

  if (stats.avgLength > 28) {
    points.push(`Average address length is ${Math.round(stats.avgLength)} characters — long addresses are harder to communicate verbally and type on mobile keyboards`)
  }

  return points.join(". ") + "."
}

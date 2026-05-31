export const DIMENSION_WEIGHTS = {
  safeguardingExposure:    1.5,
  privacyDataMinimisation: 1.5,
  enumerationResistance:   1.25,
  usabilityByPhase:        1.0,
  operationalRobustness:   1.0,
  recognisability:         0.75,
  collisionResilience:     0.75,
  changeabilityLifecycle:  0.75,
  interoperability:        0.5,
}

export const DIMENSION_LABELS = {
  safeguardingExposure:    "Safeguarding exposure",
  privacyDataMinimisation: "Privacy / data minimisation",
  enumerationResistance:   "Enumeration resistance",
  usabilityByPhase:        "Usability by phase",
  operationalRobustness:   "Operational robustness",
  recognisability:         "Recognisability",
  collisionResilience:     "Collision resilience",
  changeabilityLifecycle:  "Changeability / lifecycle",
  interoperability:        "Interoperability",
}

export const DIMENSION_ORDER = Object.keys(DIMENSION_WEIGHTS)

export function weightedOverall(scores) {
  let weightedSum = 0
  let totalWeight = 0
  for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS)) {
    if (scores[dim] != null) {
      weightedSum += scores[dim].score * weight
      totalWeight += weight
    }
  }
  if (totalWeight === 0) return null
  return weightedSum / totalWeight
}

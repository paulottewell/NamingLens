// Decision posture classification and strengths/concerns derivation.

const DIMENSION_LABELS = {
  collisionResilience:       "Collision resilience",
  privacyDataMinimisation:   "Privacy / data minimisation",
  safeguardingExposure:      "Safeguarding exposure",
  recognisability:           "Recognisability",
  enumerationResistance:     "Enumeration resistance",
  usabilityByPhase:          "Usability by phase",
  operationalRobustness:     "Operational robustness",
  changeabilityLifecycle:    "Changeability / lifecycle",
  interoperability:          "Interoperability",
}

export function classifyDecisionPosture(scores, warnings) {
  const hasRed = warnings.some((w) => w.severity === "red")

  if (hasRed) {
    return {
      posture: "High-risk",
      postureRationale: "One or more red-flag issues require resolution before this convention should be considered for deployment.",
    }
  }

  const sfe = scores.safeguardingExposure?.score ?? 3
  const prv = scores.privacyDataMinimisation?.score ?? 3
  const rec = scores.recognisability?.score ?? 3
  const col = scores.collisionResilience?.score ?? 3
  const ops = scores.operationalRobustness?.score ?? 3
  const enu = scores.enumerationResistance?.score ?? 3

  const needsControls = warnings.some((w) => w.id === "controls-recommended") &&
    (sfe <= 3 || prv <= 3)

  if (needsControls && (sfe <= 2 || prv <= 2)) {
    return {
      posture: "Needs controls",
      postureRationale: "This convention may be acceptable for deployment only if supported by strong directory controls, external mail restrictions, or Address Book Policies. The underlying exposure risk remains regardless of controls.",
    }
  }

  if (sfe >= 4 && prv >= 4 && rec < 3) {
    return {
      posture: "Child-protective",
      postureRationale: "Strong privacy and safeguarding characteristics, but addresses are not self-explanatory — staff and parents will rely on directory lookup to identify pupils.",
    }
  }

  if (rec >= 4 && (sfe < 3 || prv < 3)) {
    return {
      posture: "Staff-friendly",
      postureRationale: "Addresses are easily recognisable without a directory, but this comes at the cost of greater personal data exposure for pupils.",
    }
  }

  if (col >= 4 && ops >= 4 && enu >= 3) {
    return {
      posture: "Operationally robust",
      postureRationale: "Strong uniqueness, manageable fallback depth and good enumeration resistance make this convention well-suited to large or growing organisations.",
    }
  }

  if (sfe >= 3 && prv >= 3 && rec >= 3 && col >= 3) {
    return {
      posture: "Balanced",
      postureRationale: "Reasonable performance across privacy, safeguarding, recognisability and uniqueness — no standout strength or weakness.",
    }
  }

  return {
    posture: "Needs controls",
    postureRationale: "This convention has weaknesses across multiple dimensions. Review the dimension scores and warnings before deployment.",
  }
}

export function buildDecisionProfile(scores, warnings, posture) {
  const entries = Object.entries(scores)
    .filter(([k]) => k !== "summary")
    .map(([k, v]) => ({ key: k, label: DIMENSION_LABELS[k] ?? k, score: v.score }))
    .sort((a, b) => b.score - a.score)

  const strengths = entries
    .filter((e) => e.score >= 4)
    .slice(0, 3)
    .map((e) => `${e.label} (${Number.isInteger(e.score) ? e.score : e.score.toFixed(1)}/5)`)

  const concerns = entries
    .filter((e) => e.score <= 2)
    .slice(-3)
    .reverse()
    .map((e) => `${e.label} (${Number.isInteger(e.score) ? e.score : e.score.toFixed(1)}/5)`)

  const assumptions = []
  if (warnings.some((w) => w.id === "controls-recommended")) {
    assumptions.push("Risk assessment assumes no external mail controls or Address Book Policies are in place.")
  }
  if (posture.posture === "Needs controls") {
    assumptions.push("Residual risk with strong controls may be acceptable — but the inherent convention risk cannot be mitigated away entirely.")
  }

  return { posture: posture.posture, postureRationale: posture.postureRationale, strengths, concerns, assumptions }
}

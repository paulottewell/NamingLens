// Shared PII detection helpers used by multiple scoring dimensions.

export function hasToken(tokens, ...types) {
  return types.some((t) => tokens.some((tok) => tok.type === t))
}

export function piiElementsForTokens(tokens) {
  if (!tokens || tokens.length === 0) {
    return {
      fullFirst: false, fullLast: false, fullMiddle: false,
      initFirst: false, initLast: false, initMiddle: false,
      year: false, school: false, random: false,
    }
  }
  return {
    fullFirst:  hasToken(tokens, "first"),
    fullLast:   hasToken(tokens, "last"),
    fullMiddle: hasToken(tokens, "middle"),
    initFirst:  hasToken(tokens, "f", "ff", "fff"),
    initLast:   hasToken(tokens, "l"),
    initMiddle: hasToken(tokens, "m"),
    year:       hasToken(tokens, "yy", "yyyy"),
    school:     hasToken(tokens, "school", "schoolname"),
    random:     hasToken(tokens, "NN", "NNN", "NNNN", "A", "AA", "AAA", "AAAA", "seq"),
  }
}

// Higher = more PII exposed. Used for fairness comparisons.
export function piiWeight(pii) {
  return (pii.fullFirst ? 2 : pii.initFirst ? 1 : 0) +
         (pii.fullLast  ? 2 : pii.initLast  ? 1 : 0) +
         (pii.fullMiddle ? 2 : pii.initMiddle ? 1 : 0) +
         (pii.year   ? 1 : 0) +
         (pii.school ? 2 : 0)
}

// Fraction of pupils assigned to levels that contain any of the given token types.
export function weightedExposureFraction(levels, total, ...types) {
  if (!levels || total === 0) return 0
  let count = 0
  for (const { tokens, count: n } of levels) {
    if (tokens && tokens.length > 0 && hasToken(tokens, ...types)) count += n
  }
  return count / total
}

// Combined exposure via the product formula rather than naive capping.
// combinedExposure = 1 - product(1 - exposure_i)
// This avoids over-penalising when both fractions are partial.
export function combinedExposureProduct(addrFraction, dnFraction) {
  const a = Math.min(1, Math.max(0, addrFraction))
  const d = Math.min(1, Math.max(0, dnFraction))
  return 1 - (1 - a) * (1 - d)
}

// Compute population-weighted score across all fallback levels.
// scoreFn receives tokens[] and returns a number in [1, 5].
export function populationWeightedScore(levels, totalPupils, scoreFn) {
  if (!levels || totalPupils === 0) return 1
  let weightedSum = 0
  let assignedTotal = 0
  for (const { tokens, count } of levels) {
    if (tokens && tokens.length > 0 && count > 0) {
      weightedSum += scoreFn(tokens) * count
      assignedTotal += count
    }
  }
  if (assignedTotal === 0) return 1
  return weightedSum / assignedTotal
}

// Returns whether the subdomain mode makes pupil/student status visibly apparent.
export function isPupilStatusVisible(subdomainMode) {
  return subdomainMode === "student" || subdomainMode === "stu"
}

// Aggregate fallback statistics from addressLevels.
export function computeFallbackStats(addressLevels, totalPupils) {
  const total = totalPupils || 1
  const distribution = (addressLevels ?? []).map((lvl, i) => ({
    level: i,
    count: lvl.count,
    fraction: lvl.count / total,
    pattern: i, // caller fills in from fallbacks array
  }))

  let maxDepthUsed = 0
  for (let i = 0; i < (addressLevels ?? []).length; i++) {
    if ((addressLevels[i]?.count ?? 0) > 0) maxDepthUsed = i
  }

  const level2PlusCount = (addressLevels ?? []).slice(2).reduce((s, l) => s + l.count, 0)
  const level3PlusCount = (addressLevels ?? []).slice(3).reduce((s, l) => s + l.count, 0)

  return {
    distribution,
    maxDepthUsed,
    pctLevel2Plus: (level2PlusCount / total) * 100,
    pctLevel3Plus: (level3PlusCount / total) * 100,
    level2PlusCount,
    level3PlusCount,
  }
}

// Fairness: fraction of pupils at fallback levels that expose MORE PII than the primary pattern.
export function computeFairnessStats(addressLevels, totalPupils) {
  if (!addressLevels || addressLevels.length === 0) return { count: 0, pct: 0 }
  const primaryPii  = piiElementsForTokens(addressLevels[0]?.tokens ?? [])
  const primaryWeight = piiWeight(primaryPii)
  const total = totalPupils || 1

  let moreExposedCount = 0
  for (let i = 1; i < addressLevels.length; i++) {
    const lvl = addressLevels[i]
    if (!lvl.tokens || lvl.count === 0) continue
    const w = piiWeight(piiElementsForTokens(lvl.tokens))
    if (w > primaryWeight) moreExposedCount += lvl.count
  }

  return { count: moreExposedCount, pct: (moreExposedCount / total) * 100 }
}

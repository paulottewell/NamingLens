import { describe, it, expect } from "vitest"
import { parsePattern } from "../../lib/parsePattern.js"
import { scoreCollisionResilience } from "../dimensions/collisionResilience.js"
import { scorePrivacyDataMinimisation } from "../dimensions/privacyDataMinimisation.js"
import { scoreSafeguardingExposure } from "../dimensions/safeguardingExposure.js"
import { scoreEnumerationResistance, randomSearchSpace } from "../dimensions/enumerationResistance.js"
import { scoreUsabilityByPhase } from "../dimensions/usabilityByPhase.js"
import { scoreRecognisability } from "../dimensions/recognisability.js"
import { scoreInteroperability } from "../dimensions/interoperability.js"
import { scoreChangeabilityLifecycle } from "../dimensions/changeabilityLifecycle.js"
import { evaluateWarnings } from "../warnings/warningRules.js"
import { computeFallbackStats, computeFairnessStats } from "../exposure/piiHelpers.js"
import { computeCompositeScore } from "../overall/compositeScore.js"

// ── Helpers ──────────────────────────────────────────────────────────────────

function tokens(pattern, opts = {}) {
  const result = parsePattern(pattern, opts)
  if (result.error) throw new Error(`Pattern parse error: ${result.error}`)
  return result.tokens
}

function makeLevels(patterns) {
  return patterns.map((p, i) => ({ tokens: tokens(p), count: 100, incoming: 100 + i }))
}

function makeStats({ collisionPct = 0, collisions = 0, total = 16500, avgLength = 18, longestLength = 25 } = {}) {
  return { collisionPct, collisions, total, unique: total - collisions, avgLength, longestLength }
}

// ── Collision resilience ──────────────────────────────────────────────────────

describe("scoreCollisionResilience", () => {
  it("scores 5 when collision rate ≤ 0.5%", () => {
    const levels = [{ tokens: tokens("yylast"), count: 16400, incoming: 16500 }]
    const { score } = scoreCollisionResilience(makeStats({ collisionPct: 0.4 }), levels, 16500)
    expect(score).toBe(5)
  })

  it("scores 4 when collision rate is 1%", () => {
    const levels = [{ tokens: tokens("yylast"), count: 16335, incoming: 16500 }]
    const { score } = scoreCollisionResilience(makeStats({ collisionPct: 1 }), levels, 16500)
    expect(score).toBe(4)
  })

  it("scores 3 when collision rate is 4%", () => {
    const levels = [{ tokens: tokens("last"), count: 15840, incoming: 16500 }]
    const { score } = scoreCollisionResilience(makeStats({ collisionPct: 4 }), levels, 16500)
    expect(score).toBe(3)
  })

  it("scores 2 when collision rate is 8%", () => {
    const levels = [{ tokens: tokens("f.last"), count: 15180, incoming: 16500 }]
    const { score } = scoreCollisionResilience(makeStats({ collisionPct: 8 }), levels, 16500)
    expect(score).toBe(2)
  })

  it("scores 1 when collision rate > 10%", () => {
    const levels = [{ tokens: tokens("f.last"), count: 14685, incoming: 16500 }]
    const { score } = scoreCollisionResilience(makeStats({ collisionPct: 11 }), levels, 16500)
    expect(score).toBe(1)
  })

  it("caps score at 3 when >5% need fallback level 2+", () => {
    const levels = [
      { tokens: tokens("f.last"), count: 15000, incoming: 16500 },
      { tokens: tokens("f.lastNN"), count: 500, incoming: 1500 },
      { tokens: tokens("first.last"), count: 1000, incoming: 1000 }, // 1000 = 6% at level 2+
    ]
    const { score } = scoreCollisionResilience(makeStats({ collisionPct: 0.1 }), levels, 16500)
    expect(score).toBeLessThanOrEqual(3)
  })

  it("exposes fallbackStats", () => {
    const levels = [
      { tokens: tokens("f.last"), count: 15000, incoming: 16500 },
      { tokens: tokens("f.lastNN"), count: 1000, incoming: 1500 },
      { tokens: tokens("ff.last"), count: 500, incoming: 500 },
    ]
    const result = scoreCollisionResilience(makeStats({ collisionPct: 0.5 }), levels, 16500)
    expect(result.fallbackStats.maxDepthUsed).toBe(2)
    expect(result.fallbackStats.level2PlusCount).toBe(500)
  })
})

// ── Random search space ───────────────────────────────────────────────────────

describe("randomSearchSpace", () => {
  it("returns 1 for fully deterministic pattern", () => {
    expect(randomSearchSpace(tokens("f.last"))).toBe(1)
  })

  it("returns 100 for NN token", () => {
    expect(randomSearchSpace(tokens("f.lastNN"))).toBe(100)
  })

  it("returns 1000 for NNN token", () => {
    expect(randomSearchSpace(tokens("yylastNNN"))).toBe(1_000)
  })

  it("returns 10000 for NNNN", () => {
    expect(randomSearchSpace(tokens("f.lastNNNN"))).toBe(10_000)
  })

  it("returns 26 for A token", () => {
    expect(randomSearchSpace(tokens("f.lastA"))).toBe(26)
  })

  it("combines multiple random tokens multiplicatively", () => {
    expect(randomSearchSpace(tokens("fNN.lastA"))).toBe(100 * 26)
  })
})

// ── Enumeration resistance ────────────────────────────────────────────────────

describe("scoreEnumerationResistance", () => {
  it("scores 1 for deterministic full-name pattern", () => {
    const { score } = scoreEnumerationResistance(tokens("first.last"))
    expect(score).toBe(1)
  })

  it("scores higher for NNNN random suffix without full name", () => {
    const { score } = scoreEnumerationResistance(tokens("f.lastNNNN"))
    // space=10000 → base 5, minus 1 for full last name → 4
    expect(score).toBeGreaterThanOrEqual(3)
  })

  it("scores higher for initials-only than same pattern with full name", () => {
    const initialsScore = scoreEnumerationResistance(tokens("f.l")).score
    const fullNameScore = scoreEnumerationResistance(tokens("first.last")).score
    expect(initialsScore).toBeGreaterThan(fullNameScore)
  })

  it("penalises combined year+school for cohort narrowing", () => {
    const withBoth    = scoreEnumerationResistance(tokens("yylastNNN")).score
    const withoutYear = scoreEnumerationResistance(tokens("lastNNN")).score
    // year narrows cohort; combined year+school gives additional penalty
    expect(withBoth).toBeLessThanOrEqual(withoutYear)
  })
})

// ── Privacy / data minimisation ───────────────────────────────────────────────

describe("scorePrivacyDataMinimisation", () => {
  it("scores close to 5 for opaque pattern with no PII", () => {
    const levels = [{ tokens: tokens("yyNNN"), count: 16500, incoming: 16500 }]
    const { score } = scorePrivacyDataMinimisation(levels, [], 16500, "blank", "pupil")
    expect(score).toBeGreaterThanOrEqual(4)
  })

  it("scores lower for full first+last exposed", () => {
    const levels = [{ tokens: tokens("first.last"), count: 16500, incoming: 16500 }]
    const { score } = scorePrivacyDataMinimisation(levels, [], 16500, "blank", "pupil")
    expect(score).toBeLessThan(4)
  })

  it("school subdomain reduces score via context multiplier", () => {
    const levels = [{ tokens: tokens("f.last"), count: 16500, incoming: 16500 }]
    const schoolScore = scorePrivacyDataMinimisation(levels, [], 16500, "school", "pupil").score
    const blankScore  = scorePrivacyDataMinimisation(levels, [], 16500, "blank",  "pupil").score
    expect(schoolScore).toBeLessThanOrEqual(blankScore)
  })

  it("scores lower when display name also exposes full name", () => {
    const addrLevels = [{ tokens: tokens("f.last"), count: 16500, incoming: 16500 }]
    const dnLevels   = [{ tokens: tokens("first last", { allowSpaces: true }), count: 16500, incoming: 16500 }]
    const withDn    = scorePrivacyDataMinimisation(addrLevels, dnLevels, 16500, "blank", "pupil").score
    const withoutDn = scorePrivacyDataMinimisation(addrLevels, [],       16500, "blank", "pupil").score
    expect(withDn).toBeLessThan(withoutDn)
  })
})

// ── Safeguarding exposure ─────────────────────────────────────────────────────

describe("scoreSafeguardingExposure", () => {
  it("penalises predictable primary pattern (no random)", () => {
    const levels = [{ tokens: tokens("f.last"), count: 16500, incoming: 16500 }]
    const { score } = scoreSafeguardingExposure(levels, [], 16500, "blank", "pupil")
    expect(score).toBeLessThan(4)
  })

  it("rewards random suffix in primary", () => {
    const withRandom    = [{ tokens: tokens("f.lastNN"), count: 16500, incoming: 16500 }]
    const withoutRandom = [{ tokens: tokens("f.last"),   count: 16500, incoming: 16500 }]
    const sRand = scoreSafeguardingExposure(withRandom,    [], 16500, "blank", "pupil").score
    const sNone = scoreSafeguardingExposure(withoutRandom, [], 16500, "blank", "pupil").score
    expect(sRand).toBeGreaterThan(sNone)
  })

  it("visible pupil status (student subdomain) reduces score", () => {
    const levels = [{ tokens: tokens("f.lastNNN"), count: 16500, incoming: 16500 }]
    const studentScore = scoreSafeguardingExposure(levels, [], 16500, "student", "pupil").score
    const blankScore   = scoreSafeguardingExposure(levels, [], 16500, "blank",   "pupil").score
    expect(studentScore).toBeLessThan(blankScore)
  })

  it("school data in address contributes to safeguarding deduction", () => {
    const withSchool    = [{ tokens: tokens("schoolNN"), count: 16500, incoming: 16500 }]
    const withoutSchool = [{ tokens: tokens("yyNN"),     count: 16500, incoming: 16500 }]
    const sSchool = scoreSafeguardingExposure(withSchool,    [], 16500, "blank", "pupil").score
    const sNoSch  = scoreSafeguardingExposure(withoutSchool, [], 16500, "blank", "pupil").score
    expect(sSchool).toBeLessThan(sNoSch)
  })
})

// ── Usability by phase ────────────────────────────────────────────────────────

describe("scoreUsabilityByPhase", () => {
  it("scores Primary/KS1 lower for long address with random suffix", () => {
    const toks = tokens("first.lastNNNN")
    const stats = makeStats({ avgLength: 25, longestLength: 30 })
    const { byPhase } = scoreUsabilityByPhase(stats, toks)
    expect(byPhase["Primary/KS1"]).toBeLessThanOrEqual(2)
  })

  it("scores Sixth form reasonably for NNNN suffix", () => {
    const toks = tokens("f.lastNNNN")
    const stats = makeStats({ avgLength: 20, longestLength: 24 })
    const { byPhase } = scoreUsabilityByPhase(stats, toks)
    expect(byPhase["Sixth form"]).toBeGreaterThanOrEqual(2)
  })

  it("penalises underscore", () => {
    const withUnderscore    = tokens("f_last")
    const withoutUnderscore = tokens("f.last")
    // Use avgLength=28 so the length penalty brings the base score low enough
    // that the 0.5 underscore penalty is visible after rounding.
    const sU  = scoreUsabilityByPhase(makeStats({ avgLength: 28, longestLength: 32 }), withUnderscore).score
    const sNo = scoreUsabilityByPhase(makeStats({ avgLength: 28, longestLength: 32 }), withoutUnderscore).score
    expect(sU).toBeLessThan(sNo)
  })

  it("scores short derivable pattern highly for all phases", () => {
    const toks = tokens("f.last")
    const stats = makeStats({ avgLength: 12, longestLength: 15 })
    const { byPhase } = scoreUsabilityByPhase(stats, toks)
    expect(byPhase["Primary/KS1"]).toBeGreaterThanOrEqual(3)
    expect(byPhase["Secondary/KS4"]).toBeGreaterThanOrEqual(4)
  })
})

// ── Recognisability ───────────────────────────────────────────────────────────

describe("scoreRecognisability", () => {
  it("scores 5 for full first + full last", () => {
    const toks = tokens("first.last")
    const { score } = scoreRecognisability(toks, [{ tokens: toks, count: 16500, incoming: 16500 }], 16500)
    expect(score).toBe(5)
  })

  it("scores 1 for opaque pattern with no name", () => {
    const toks = tokens("yyNNN")
    const { score } = scoreRecognisability(toks, [{ tokens: toks, count: 16500, incoming: 16500 }], 16500)
    expect(score).toBe(1)
  })

  it("scores 3 for initials only", () => {
    const toks = tokens("f.l")
    const { score } = scoreRecognisability(toks, [{ tokens: toks, count: 16500, incoming: 16500 }], 16500)
    expect(score).toBe(3)
  })
})

// ── Interoperability ──────────────────────────────────────────────────────────

describe("scoreInteroperability", () => {
  it("penalises underscore", () => {
    const noUnderscore = scoreInteroperability(tokens("f.last"),  makeStats()).score
    const withUnderscore = scoreInteroperability(tokens("f_last"), makeStats()).score
    expect(withUnderscore).toBeLessThan(noUnderscore)
  })

  it("penalises exotic separators", () => {
    const plain  = scoreInteroperability(tokens("f.last"),  makeStats()).score
    const exotic = scoreInteroperability(tokens("f!last"),  makeStats()).score
    expect(exotic).toBeLessThan(plain)
  })

  it("scores 5 for a simple dot-separated initials pattern", () => {
    // f and l are initials — no full-name normalisation penalty
    const { score } = scoreInteroperability(tokens("f.lNN"), makeStats({ avgLength: 10 }))
    expect(score).toBe(5)
  })
})

// ── Changeability / lifecycle ─────────────────────────────────────────────────

describe("scoreChangeabilityLifecycle", () => {
  it("scores high for opaque pattern with no name tokens", () => {
    const toks = tokens("yyNNN")
    const { score } = scoreChangeabilityLifecycle(toks, toks)
    expect(score).toBeGreaterThanOrEqual(4)
  })

  it("scores lower when surname is embedded", () => {
    const toks = tokens("f.last")
    const { score } = scoreChangeabilityLifecycle(toks, toks)
    expect(score).toBeLessThan(4)
  })

  it("scores substantially lower when both first and last name are embedded", () => {
    // 5 - 1.5 (last) - 1.0 (first) = 2.5 — clamped to [1,5]
    const toks = tokens("first.last")
    const { score } = scoreChangeabilityLifecycle(toks, toks)
    expect(score).toBeLessThanOrEqual(3)
  })

  it("exposes mutableTokens list", () => {
    const toks = tokens("first.last")
    const { mutableTokens } = scoreChangeabilityLifecycle(toks, toks)
    expect(mutableTokens).toContain("first name")
    expect(mutableTokens).toContain("surname")
  })
})

// ── Fairness stats ────────────────────────────────────────────────────────────

describe("computeFairnessStats", () => {
  it("returns 0 when all fallback levels have same PII as primary", () => {
    const levels = [
      { tokens: tokens("f.last"),   count: 15000, incoming: 16500 },
      { tokens: tokens("f.lastNN"), count: 1500,  incoming: 1500 },
    ]
    // f.lastNN has same PII elements as f.last (f, l tokens) → piiWeight same
    const { pct } = computeFairnessStats(levels, 16500)
    expect(pct).toBe(0)
  })

  it("detects when fallback exposes more PII than primary", () => {
    const levels = [
      { tokens: tokens("f.lastNN"),   count: 15000, incoming: 16500 },
      { tokens: tokens("first.last"), count: 1500,  incoming: 1500 }, // full names = higher PII
    ]
    const { count, pct } = computeFairnessStats(levels, 16500)
    expect(count).toBe(1500)
    expect(pct).toBeCloseTo(9.09, 1)
  })
})

// ── Warnings ─────────────────────────────────────────────────────────────────

describe("evaluateWarnings", () => {
  const baseArgs = {
    primaryTokens: [],
    allAddressTokens: [[]],
    allDnTokens: [[]],
    addressLevels: [],
    dnLevels: [],
    totalPupils: 16500,
    subdomainMode: "blank",
    stats: makeStats(),
    fallbackStats: { maxDepthUsed: 0, pctLevel2Plus: 0, pctLevel3Plus: 0, level2PlusCount: 0, level3PlusCount: 0, distribution: [] },
    fairnessStats: { count: 0, pct: 0 },
  }

  it("raises red warning when school subdomain is used", () => {
    const warnings = evaluateWarnings({ ...baseArgs, subdomainMode: "school" })
    const ids = warnings.map((w) => w.id)
    expect(ids).toContain("external-school-location")
    expect(warnings.find((w) => w.id === "external-school-location").severity).toBe("red")
  })

  it("raises red warning for full name at primary level for all pupils", () => {
    const toks = tokens("first.last")
    const levels = [{ tokens: toks, count: 16500, incoming: 16500 }]
    const warnings = evaluateWarnings({
      ...baseArgs,
      primaryTokens: toks,
      allAddressTokens: [toks],
      addressLevels: levels,
      stats: makeStats({ collisionPct: 0 }),
    })
    expect(warnings.some((w) => w.id === "full-name-all-pupils")).toBe(true)
  })

  it("raises red warning when both year and school are in primary", () => {
    const toks = tokens("yyschoolNNN")
    const levels = [{ tokens: toks, count: 16500, incoming: 16500 }]
    const warnings = evaluateWarnings({
      ...baseArgs,
      primaryTokens: toks,
      allAddressTokens: [toks],
      addressLevels: levels,
    })
    expect(warnings.some((w) => w.id === "year-and-school-combined")).toBe(true)
  })

  it("raises red warning for collision rate > 10%", () => {
    const warnings = evaluateWarnings({
      ...baseArgs,
      stats: makeStats({ collisionPct: 12, collisions: 1980 }),
    })
    expect(warnings.some((w) => w.id === "collision-rate-critical")).toBe(true)
  })

  it("raises red warning for deep fallback cascade (≥4)", () => {
    const warnings = evaluateWarnings({
      ...baseArgs,
      fallbackStats: { ...baseArgs.fallbackStats, maxDepthUsed: 4 },
    })
    expect(warnings.some((w) => w.id === "deep-fallback-cascade")).toBe(true)
  })

  it("raises amber warning for collision rate 5–10%", () => {
    const warnings = evaluateWarnings({
      ...baseArgs,
      stats: makeStats({ collisionPct: 7, collisions: 1155 }),
    })
    expect(warnings.some((w) => w.id === "collision-rate-high")).toBe(true)
    expect(warnings.find((w) => w.id === "collision-rate-high").severity).toBe("amber")
  })

  it("raises amber warning for no random element in primary", () => {
    const toks = tokens("f.last")
    const warnings = evaluateWarnings({
      ...baseArgs,
      primaryTokens: toks,
      allAddressTokens: [toks],
      addressLevels: [{ tokens: toks, count: 16500, incoming: 16500 }],
    })
    expect(warnings.some((w) => w.id === "no-random-primary")).toBe(true)
  })

  it("raises amber warning for fairness issue > 1%", () => {
    const warnings = evaluateWarnings({
      ...baseArgs,
      fairnessStats: { count: 250, pct: 1.5 },
    })
    expect(warnings.some((w) => w.id === "fallback-increases-pii-amber")).toBe(true)
  })

  it("raises red fairness warning when > 5% are affected", () => {
    const warnings = evaluateWarnings({
      ...baseArgs,
      fairnessStats: { count: 900, pct: 5.5 },
    })
    expect(warnings.some((w) => w.id === "fallback-increases-pii")).toBe(true)
  })

  it("raises amber warning when intake year is embedded", () => {
    const toks = tokens("yylast")
    const warnings = evaluateWarnings({
      ...baseArgs,
      primaryTokens: toks,
      allAddressTokens: [toks],
      addressLevels: [{ tokens: toks, count: 16500, incoming: 16500 }],
    })
    expect(warnings.some((w) => w.id === "year-in-address")).toBe(true)
  })

  it("raises visible pupil status info warning for student subdomain", () => {
    const warnings = evaluateWarnings({ ...baseArgs, subdomainMode: "student" })
    expect(warnings.some((w) => w.id === "pupil-status-visible")).toBe(true)
    expect(warnings.find((w) => w.id === "pupil-status-visible").severity).toBe("info")
  })
})

// ── Composite score ───────────────────────────────────────────────────────────

describe("computeCompositeScore", () => {
  function makeScores(overrides = {}) {
    const base = {
      safeguardingExposure:    { score: 4 },
      privacyDataMinimisation: { score: 4 },
      enumerationResistance:   { score: 4 },
      usabilityByPhase:        { score: 4 },
      operationalRobustness:   { score: 4 },
      recognisability:         { score: 3 },
      collisionResilience:     { score: 4 },
      changeabilityLifecycle:  { score: 3 },
      interoperability:        { score: 5 },
    }
    return { ...base, ...overrides }
  }

  it("returns null for empty scores", () => {
    const { rawScore } = computeCompositeScore({}, [])
    expect(rawScore).toBeNull()
  })

  it("caps adjusted score when red warning is present", () => {
    const scores = makeScores()
    const warnings = [{ id: "collision-rate-critical", severity: "red", title: "x", message: "x" }]
    const { adjustedScore, rawScore } = computeCompositeScore(scores, warnings)
    expect(adjustedScore).toBeLessThanOrEqual(3.0)
    expect(rawScore).toBeGreaterThan(3.0)
  })

  it("caps at 3.5 when school subdomain warning is present", () => {
    const scores = makeScores()
    const warnings = [{ id: "external-school-location", severity: "red", title: "x", message: "x" }]
    const { adjustedScore } = computeCompositeScore(scores, warnings)
    expect(adjustedScore).toBeLessThanOrEqual(3.5)
  })

  it("returns High risk band when red warning present", () => {
    const scores = makeScores()
    const warnings = [{ id: "deep-fallback-cascade", severity: "red", title: "x", message: "x" }]
    const { riskBand } = computeCompositeScore(scores, warnings)
    expect(riskBand).toBe("High risk")
  })

  it("returns Good band for high scores with no warnings", () => {
    const scores = makeScores({ recognisability: { score: 4 }, changeabilityLifecycle: { score: 4 } })
    const { riskBand } = computeCompositeScore(scores, [])
    expect(["Good", "Strong"]).toContain(riskBand)
  })
})

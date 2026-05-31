import { clamp } from "../utils.js"
import { hasToken } from "../exposure/piiHelpers.js"
import { randomSearchSpace } from "./enumerationResistance.js"

// Phase-appropriate address length thresholds (local part only, approx chars before @).
const PHASE_LENGTH_THRESHOLDS = {
  "Primary/KS1":    { ideal: 12, acceptable: 16 },
  "Primary/KS2":    { ideal: 16, acceptable: 20 },
  "Secondary/KS3":  { ideal: 20, acceptable: 25 },
  "Secondary/KS4":  { ideal: 22, acceptable: 28 },
  "Sixth form":     { ideal: 24, acceptable: 30 },
}

// Maximum random token size acceptable per phase.
const PHASE_MAX_RANDOM = {
  "Primary/KS1":    1,      // no random tokens
  "Primary/KS2":    100,    // NN max
  "Secondary/KS3":  1_000,  // NNN max
  "Secondary/KS4":  10_000, // NNNN max
  "Sixth form":     10_000,
}

function phaseScore(phase, stats, tokens) {
  const avgLen = stats.avgLength
  const threshold = PHASE_LENGTH_THRESHOLDS[phase]
  const maxRandom = PHASE_MAX_RANDOM[phase]
  const space = randomSearchSpace(tokens)

  let memorabilityPenalty = 0
  if (space === 1)         memorabilityPenalty = 0    // fully derivable
  else if (space <= 100)   memorabilityPenalty = 0.5  // small random — memorisable
  else if (space <= 1_000) memorabilityPenalty = 1.0
  else                     memorabilityPenalty = 1.5  // large random — must look up

  const randomPhasePenalty = space > maxRandom ? 1.0 : 0

  let lengthPenalty = 0
  if (avgLen > threshold.acceptable) lengthPenalty = 1.5
  else if (avgLen > threshold.ideal) lengthPenalty = 0.75

  const underscorePenalty = tokens.some((t) => t.raw === "_") ? 0.5 : 0

  const raw = 5 - memorabilityPenalty - randomPhasePenalty - lengthPenalty - underscorePenalty
  return clamp(Math.round(raw), 1, 5)
}

export function scoreUsabilityByPhase(stats, primaryTokens) {
  const phases = Object.keys(PHASE_LENGTH_THRESHOLDS)
  const byPhase = {}
  for (const phase of phases) {
    byPhase[phase] = phaseScore(phase, stats, primaryTokens)
  }

  // Overall score = average across all phases, rounded
  const avg = Object.values(byPhase).reduce((s, v) => s + v, 0) / phases.length

  return {
    score: clamp(Math.round(avg), 1, 5),
    byPhase,
    rationale: buildRationale(byPhase, stats, primaryTokens),
  }
}

function buildRationale(byPhase, stats, tokens) {
  const avg = Math.round(stats.avgLength)
  const longest = Math.round(stats.longestLength)
  const space = randomSearchSpace(tokens)

  const lengthNote = avg <= 16
    ? `Short (${avg} chars average) — well-suited to younger pupils.`
    : avg <= 22
    ? `Moderate length (${avg} chars average) — acceptable for most year groups.`
    : `Long (${avg} chars average) — may cause difficulty for younger pupils or when communicating verbally.`

  const memorabilityNote = space === 1
    ? "Fully derivable from the pupil's name — no memorisation required."
    : space <= 100
    ? "Short random suffix — most pupils can memorise it with practice."
    : "Contains a random suffix — pupils must look up and memorise their address rather than deriving it from their name."

  const underscoreNote = tokens.some((t) => t.raw === "_")
    ? " Underscore separator is harder to type on mobile keyboards and confusing when communicating verbally."
    : ""

  const phases = Object.entries(byPhase)
  const weakPhases = phases.filter(([, s]) => s <= 2).map(([p]) => p)
  const phaseNote = weakPhases.length > 0
    ? ` Concern for: ${weakPhases.join(", ")}.`
    : ""

  return `${lengthNote} Longest address: ${longest} chars. ${memorabilityNote}${underscoreNote}${phaseNote}`
}

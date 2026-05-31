import { clamp } from "../utils.js"
import { hasToken } from "../exposure/piiHelpers.js"

// Exact random search space per token type.
const TOKEN_SPACES = {
  N: 10, NN: 100, NNN: 1_000, NNNN: 10_000,
  A: 26, AA: 676, AAA: 17_576, AAAA: 456_976,
  seq: 26, // approximate — seq grows with collision group size
}

export function randomSearchSpace(tokens) {
  return tokens.reduce((product, tok) => product * (TOKEN_SPACES[tok.type] ?? 1), 1)
}

export function scoreEnumerationResistance(primaryTokens) {
  const space = randomSearchSpace(primaryTokens)

  let score
  if (space >= 10_000)     score = 5
  else if (space >= 1_000) score = 4
  else if (space >= 100)   score = 3
  else if (space >= 26)    score = 2
  else                     score = 1

  const hasFullFirst = hasToken(primaryTokens, "first")
  const hasFullLast  = hasToken(primaryTokens, "last")
  const hasInitials  = hasToken(primaryTokens, "f", "l")
  const hasYear      = hasToken(primaryTokens, "yy", "yyyy")
  const hasSchool    = hasToken(primaryTokens, "school", "schoolname")

  // Full names allow an attacker to anchor guesses to public name lists.
  // This significantly reduces the effective search space.
  if (hasFullFirst || hasFullLast) score = Math.max(1, score - 1)

  // Initials only (no full name) materially reduces targetability —
  // mapping initials to specific individuals requires a directory or considerable effort.
  if (!hasFullFirst && !hasFullLast && hasInitials) score = Math.min(5, score + 1)

  // Year or school narrows the target cohort, helping an attacker focus attempts.
  if (hasYear && hasSchool) score = Math.max(1, score - 1)

  return {
    score: clamp(score, 1, 5),
    randomSearchSpace: space,
    rationale: buildRationale(score, space, primaryTokens, hasFullFirst, hasFullLast, hasInitials, hasYear, hasSchool),
  }
}

function buildRationale(score, space, tokens, hasFullFirst, hasFullLast, hasInitials, hasYear, hasSchool) {
  const deterministicNote = space === 1
    ? "No random element in the primary pattern — an adversary with a name list can construct every valid address in a single pass without testing."
    : `Random element gives ${space.toLocaleString("en-GB")} possible values per name combination. An adversary must attempt up to ${space.toLocaleString("en-GB")} addresses per target.`

  const nameNote = (hasFullFirst || hasFullLast)
    ? "Full name components allow an adversary to anchor guesses to public name lists, reducing the effective search space significantly."
    : hasInitials
    ? "Initials-only reduces the signal available to an adversary — mapping initials to specific pupils requires a directory or considerable investigative effort."
    : "No name component present — addresses cannot be directly anchored to known individuals."

  let cohortNote = ""
  if (hasYear && hasSchool) {
    cohortNote = " Intake year and school data together narrow the target cohort, helping an adversary focus enumeration attempts."
  } else if (hasYear) {
    cohortNote = " Intake year narrows the cohort slightly — useful to an adversary who knows when a target pupil started school."
  } else if (hasSchool) {
    cohortNote = " School code limits the target population to one institution."
  }

  return `${deterministicNote} ${nameNote}${cohortNote}`
}

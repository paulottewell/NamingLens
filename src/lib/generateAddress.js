import { SCHOOL_NAMES } from "../data/schools.js"

// Normalise a name fragment: lowercase, remove spaces/apostrophes/hyphens/accents.
function normaliseName(str) {
  return str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[\s'\-]/g, "")
}

// Seeded pseudo-random number generator (mulberry32) so each pupil gets a
// stable suffix for the lifetime of the session.
function seededRng(seed) {
  let s = seed
  return function () {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomDigits(rng, count) {
  const max = Math.pow(10, count)
  const val = Math.floor(rng() * max)
  return String(val).padStart(count, "0")
}

function randomAlpha(rng, count) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  let result = ""
  for (let i = 0; i < count; i++) {
    result += chars[Math.floor(rng() * 26)]
  }
  return result
}

// Convert a 0-based rank to a sequential letter: 0→A, 1→B, …, 25→Z, 26→AA, 27→AB, …
// Pass rank = -1 to get "" (used when computing base keys for grouping).
function rankToSeq(rank) {
  if (rank < 0) return ""
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  if (rank < 26) return chars[rank]
  return chars[Math.floor(rank / 26) - 1] + chars[rank % 26]
}

// When a non-separator token produces "" (e.g. pupil has no middle name),
// remove it and suppress one adjacent separator to avoid double separators.
function collapseEmptyTokens(pairs) {
  const result = []
  for (let i = 0; i < pairs.length; i++) {
    const { isSep, value } = pairs[i]
    if (!isSep && value === "") {
      // Prefer removing a preceding separator; otherwise skip the following one.
      if (result.length > 0 && result[result.length - 1].isSep) {
        result.pop()
      } else if (i + 1 < pairs.length && pairs[i + 1].isSep) {
        i++
      }
    } else {
      result.push(pairs[i])
    }
  }
  return result
}

/**
 * Generate the local part of an email address for a pupil given a token list.
 * attempt (1-based) is mixed into the seed so that a second attempt with a
 * random suffix draws different characters than the first.
 */
export function generateLocalPart(tokens, pupil, attempt = 1, seqRank = 0) {
  const rng = seededRng(pupil.id * 9973 + attempt * 1000003)
  const pairs = tokens.map((tok) => {
    const isSep = tok.type === "separator"
    let value
    switch (tok.type) {
      case "first":      value = normaliseName(pupil.first); break
      case "last":       value = normaliseName(pupil.last); break
      case "middle":     value = pupil.middle ? normaliseName(pupil.middle) : ""; break
      case "fff":        value = normaliseName(pupil.first).slice(0, 3); break
      case "ff":         value = normaliseName(pupil.first).slice(0, 2); break
      case "f":          value = normaliseName(pupil.first)[0] ?? ""; break
      case "l":          value = normaliseName(pupil.last)[0] ?? ""; break
      case "m":          value = pupil.middle ? (normaliseName(pupil.middle)[0] ?? "") : ""; break
      case "yyyy":       value = String(pupil.year); break
      case "yy":         value = String(pupil.year).slice(-2); break
      case "seq":        value = rankToSeq(seqRank); break
      case "NN":         value = randomDigits(rng, 2); break
      case "NNN":        value = randomDigits(rng, 3); break
      case "NNNN":       value = randomDigits(rng, 4); break
      case "A":          value = randomAlpha(rng, 1); break
      case "AA":         value = randomAlpha(rng, 2); break
      case "AAA":        value = randomAlpha(rng, 3); break
      case "AAAA":       value = randomAlpha(rng, 4); break
      case "school":     value = pupil.school.toUpperCase(); break
      case "schoolname": value = normaliseName(SCHOOL_NAMES[pupil.school] ?? pupil.school); break
      case "separator":  value = tok.raw; break
      case "literal":    value = tok.value; break
      default:           value = ""
    }
    return { isSep, value }
  })
  return collapseEmptyTokens(pairs).map((p) => p.value).join("")
}

/**
 * Build the full email address.
 * Pass attempt=2 when generating a second-attempt address so random suffixes differ.
 */
export function generateAddress(tokens, pupil, domain, attempt = 1, seqRank = 0) {
  const local = generateLocalPart(tokens, pupil, attempt, seqRank)
  return `${local}@${domain}`
}

/**
 * Generate a display name for a pupil from a token list.
 * Preserves original capitalisation — no normalisation applied.
 * Separators (including spaces and commas) are passed through literally.
 */
export function generateDisplayName(tokens, pupil, seqRank = 0) {
  const pairs = tokens.map((tok) => {
    const isSep = tok.type === "separator"
    let value
    switch (tok.type) {
      case "first":      value = pupil.first; break
      case "last":       value = pupil.last; break
      case "middle":     value = pupil.middle ?? ""; break
      case "fff":        value = pupil.first.slice(0, 3); break
      case "ff":         value = pupil.first.slice(0, 2); break
      case "f":          value = pupil.first[0]?.toUpperCase() ?? ""; break
      case "l":          value = pupil.last[0]?.toUpperCase() ?? ""; break
      case "m":          value = pupil.middle ? (pupil.middle[0]?.toUpperCase() ?? "") : ""; break
      case "yyyy":       value = String(pupil.year); break
      case "yy":         value = String(pupil.year).slice(-2); break
      case "seq":        value = rankToSeq(seqRank); break
      case "school":     value = pupil.school.toUpperCase(); break
      case "schoolname": value = SCHOOL_NAMES[pupil.school] ?? pupil.school; break
      case "separator":  value = tok.raw; break
      case "literal":    value = tok.value; break
      default:           value = ""
    }
    return { isSep, value }
  })
  return collapseEmptyTokens(pairs).map((p) => p.value).join("")
}

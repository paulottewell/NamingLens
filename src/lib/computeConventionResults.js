import { parsePattern } from "./parsePattern.js"
import { generateAddress, generateDisplayName } from "./generateAddress.js"
import { computeAllScores } from "../scoring/index.js"
import { hasToken } from "../scoring/exposure/piiHelpers.js"

function hasRandom(tokens) {
  return tokens.some((tok) =>
    ["NN", "NNN", "NNNN", "A", "AA", "AAA", "AAAA", "seq"].includes(tok.type)
  )
}

function assessDisplayName(tokens) {
  const hasFullFirst  = tokens.some((t) => t.type === "first")
  const hasFullLast   = tokens.some((t) => t.type === "last")
  const hasFullMiddle = tokens.some((t) => t.type === "middle")
  const hasInitFirst  = tokens.some((t) => t.type === "f")
  const hasInitLast   = tokens.some((t) => t.type === "l")
  const hasInitMiddle = tokens.some((t) => t.type === "m")
  const hasYear       = tokens.some((t) => t.type === "yy" || t.type === "yyyy")
  const hasSchool     = tokens.some((t) => t.type === "school" || t.type === "schoolname")

  const exposed = []
  if (hasFullFirst)  exposed.push("full first name")
  if (hasFullMiddle) exposed.push("full middle name")
  if (hasFullLast)   exposed.push("full surname")
  if (hasInitFirst)  exposed.push("first initial")
  if (hasInitMiddle) exposed.push("middle initial")
  if (hasInitLast)   exposed.push("surname initial")
  if (hasYear)       exposed.push("intake year")
  if (hasSchool)     exposed.push("school code")

  let risk
  if (hasFullFirst && hasFullLast) risk = "high"
  else if (hasSchool || hasYear)   risk = "elevated"
  else if (exposed.length > 0)     risk = "moderate"
  else                             risk = "low"

  const note =
    risk === "high"
      ? "The display name reveals the pupil's full name. This is the most visible element of an email — it appears in every inbox, calendar event and sent item, providing a direct link between address and identity."
      : risk === "elevated"
      ? `The display name exposes ${exposed.join(", ")}. Year or school data in the display name can be read by anyone who receives a message, linking the pupil to a specific institution or cohort.`
      : exposed.length > 0
      ? `The display name exposes ${exposed.join(", ")}. Partial name data provides some identity signal without fully revealing the pupil.`
      : "The display name contains no personal data. Recipients cannot identify the sender from the display name alone."

  return { exposed, risk, note }
}

export function pupilDomain(subdomainMode, pupil, baseDomain) {
  if (subdomainMode === "stu")     return `stu.${baseDomain}`
  if (subdomainMode === "student") return `student.${baseDomain}`
  if (subdomainMode === "school")  return `${pupil.school}.${baseDomain}`
  return baseDomain
}

// ---------------------------------------------------------------------------
// Sequential-rank pre-computation (for the `seq` token)
// ---------------------------------------------------------------------------
function computeSeqRanks(pending, baseKeyFn) {
  const baseKeys = pending.map(({ pupil }) => baseKeyFn(pupil))
  const groups = new Map()
  baseKeys.forEach((key, i) => {
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(i)
  })
  const ranks = new Array(pending.length).fill(0)
  for (const indices of groups.values()) {
    indices.forEach((pendingIdx, rank) => { ranks[pendingIdx] = rank })
  }
  return ranks
}

// ---------------------------------------------------------------------------
// Multi-level address cascade
// ---------------------------------------------------------------------------
const EXAMPLES_PER_LEVEL = 3

export function runAddressCascade(levelTokensList, pupils, domainFn) {
  const takenAddresses = new Map()
  const levels = levelTokensList.map((tokens) => ({ tokens, count: 0, incoming: 0 }))
  const levelExamples = levelTokensList.map(() => [])

  let pending = pupils.map((pupil, idx) => ({ pupil, idx, attempts: [] }))

  for (let lvl = 0; lvl < levelTokensList.length; lvl++) {
    const tokens = levelTokensList[lvl]
    levels[lvl].incoming = pending.length
    if (!tokens || tokens.length === 0) continue

    const hasSeq = tokens.some((t) => t.type === "seq")
    const seqRanks = hasSeq
      ? computeSeqRanks(pending, (pupil) => generateAddress(tokens, pupil, domainFn(pupil), lvl + 1, -1))
      : null

    const nextPending = []
    pending.forEach((entry, pi) => {
      const { pupil } = entry
      const seqRank = seqRanks ? seqRanks[pi] : 0
      const addr = generateAddress(tokens, pupil, domainFn(pupil), lvl + 1, seqRank)

      if (!takenAddresses.has(addr)) {
        takenAddresses.set(addr, pupil)
        levels[lvl].count++
        if (levelExamples[lvl].length < EXAMPLES_PER_LEVEL) {
          levelExamples[lvl].push({ address: addr, pupil })
        }
      } else {
        entry.attempts.push({ level: lvl, address: addr, owner: takenAddresses.get(addr) })
        nextPending.push(entry)
      }
    })
    pending = nextPending
  }

  return { levels, unresolvedCount: pending.length, unresolvedPupils: pending.slice(0, 10), takenAddresses, levelExamples }
}

// ---------------------------------------------------------------------------
// Multi-level display name cascade
// ---------------------------------------------------------------------------
export function runDisplayNameCascade(levelTokensList, pupils) {
  const takenDns = new Map()
  const levels = levelTokensList.map((tokens) => ({ tokens, count: 0, incoming: 0 }))
  const resolvedDnMap = new Map()

  let pending = pupils.map((pupil, idx) => ({ pupil, idx, attempts: [] }))

  for (let lvl = 0; lvl < levelTokensList.length; lvl++) {
    const tokens = levelTokensList[lvl]
    levels[lvl].incoming = pending.length
    if (!tokens || tokens.length === 0) continue

    const hasSeq = tokens.some((t) => t.type === "seq")
    const seqRanks = hasSeq
      ? computeSeqRanks(pending, (pupil) => generateDisplayName(tokens, pupil, -1))
      : null

    const nextPending = []
    pending.forEach((entry, pi) => {
      const { pupil } = entry
      const seqRank = seqRanks ? seqRanks[pi] : 0
      const dn = generateDisplayName(tokens, pupil, seqRank)

      if (!takenDns.has(dn)) {
        takenDns.set(dn, pupil)
        levels[lvl].count++
        resolvedDnMap.set(pupil.id, { name: dn, level: lvl })
      } else {
        entry.attempts.push({ level: lvl, dn, owner: takenDns.get(dn) })
        nextPending.push(entry)
      }
    })
    pending = nextPending
  }

  return { levels, unresolvedCount: pending.length, unresolvedPupils: pending.slice(0, 10), resolvedDnMap }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function computeConventionResults(conv, pupils, subdomainMode, mode, baseDomain) {
  const domainFn = (pupil) => pupilDomain(subdomainMode, pupil, baseDomain)

  const { tokens: primaryTokens, error } = parsePattern(conv.primary)

  const fallbackResults = (conv.fallbacks ?? []).map((fb) =>
    fb.trim() ? parsePattern(fb) : { tokens: [], error: null }
  )

  const { tokens: primaryDnTokens, error: primaryDnError } = conv.displayName?.trim()
    ? parsePattern(conv.displayName, { allowSpaces: true })
    : { tokens: [], error: null }

  const dnFallbackResults = (conv.displayNameFallbacks ?? []).map((fb) =>
    fb.trim() ? parsePattern(fb, { allowSpaces: true }) : { tokens: [], error: null }
  )

  const fallbackErrors   = fallbackResults.map((f) => f.error)
  const dnFallbackErrors = dnFallbackResults.map((f) => f.error)

  const emptyResult = {
    primaryTokens: [], error,
    fallbackErrors, primaryDnTokens, primaryDnError, dnFallbackErrors,
    addressLevels: [], addressUnresolvedCount: 0, addressUnresolvedPupils: [],
    dnLevels: [], dnUnresolvedCount: 0, dnUnresolvedPupils: [],
    examplesByLevel: [], displayNameAssessment: null,
    stats: null, scores: null, resolvable: false,
    warnings: [], decisionProfile: null,
    rawScore: null, adjustedScore: null, riskBand: null,
    fallbackStats: null, fairnessStats: null,
  }

  if (error || primaryTokens.length === 0) return emptyResult

  const allAddressTokens = [primaryTokens, ...fallbackResults.map((f) => f.tokens)]
  const allDnTokens      = [primaryDnTokens, ...dnFallbackResults.map((f) => f.tokens)]

  // Address cascade
  const addressCascade = runAddressCascade(allAddressTokens, pupils, domainFn)

  // Primary-level stats (for uniqueness/collision scoring)
  const primaryAddresses = pupils.map((p) => generateAddress(primaryTokens, p, domainFn(p), 1))
  const total       = primaryAddresses.length
  const uniqueCount = new Set(primaryAddresses).size
  const collisions  = total - uniqueCount
  const lengths     = primaryAddresses.map((a) => a.length)
  const stats = {
    total,
    unique: uniqueCount,
    collisions,
    collisionPct: total > 0 ? (collisions / total) * 100 : 0,
    longestLength: Math.max(...lengths),
    avgLength:     lengths.reduce((s, l) => s + l, 0) / lengths.length,
  }

  // Display name cascade
  const hasDn = primaryDnTokens.length > 0
  const dnCascade = hasDn
    ? runDisplayNameCascade(allDnTokens, pupils)
    : { levels: [], unresolvedCount: 0, unresolvedPupils: [], resolvedDnMap: new Map() }

  const allDnTokensFlat = allDnTokens.flat()
  const displayNameAssessment = hasDn ? assessDisplayName(allDnTokensFlat) : null

  // New scoring system
  const scoringResult = computeAllScores({
    primaryTokens,
    allAddressTokens,
    allDnTokens,
    addressLevels: addressCascade.levels,
    dnLevels: dnCascade.levels,
    totalPupils: total,
    stats,
    subdomainMode,
    mode,
  })

  // Build examples grouped by address level, enriched with resolved display name
  const examplesByLevel = addressCascade.levelExamples
    .map((entries, lvl) => ({
      level: lvl,
      entries: entries.map(({ address, pupil }) => ({
        address,
        pupil,
        dn: dnCascade.resolvedDnMap.get(pupil.id) ?? null,
      })),
    }))
    .filter((g) => g.entries.length > 0)

  return {
    primaryTokens,
    error: null,
    fallbackErrors,
    primaryDnTokens,
    primaryDnError,
    dnFallbackErrors,
    addressLevels: addressCascade.levels,
    addressUnresolvedCount: addressCascade.unresolvedCount,
    addressUnresolvedPupils: addressCascade.unresolvedPupils,
    dnLevels: dnCascade.levels,
    dnUnresolvedCount: dnCascade.unresolvedCount,
    dnUnresolvedPupils: dnCascade.unresolvedPupils,
    examplesByLevel,
    displayNameAssessment,
    stats,
    resolvable: hasRandom(primaryTokens),
    ...scoringResult,
  }
}

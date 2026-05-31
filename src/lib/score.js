function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val))
}

function hasToken(tokens, ...types) {
  return types.some((t) => tokens.some((tok) => tok.type === t))
}

export function hasRandom(tokens) {
  return tokens.some((tok) =>
    ["NN", "NNN", "NNNN", "A", "AA", "AAA", "AAAA", "seq"].includes(tok.type)
  )
}

// ---------------------------------------------------------------------------
// Weighted exposure helpers
// ---------------------------------------------------------------------------

// Fraction of pupils (0–1) assigned to levels that contain any of the given token types.
function weightedExposureFraction(levels, total, ...types) {
  if (!levels || total === 0) return 0
  let count = 0
  for (const { tokens, count: n } of levels) {
    if (tokens && tokens.length > 0 && hasToken(tokens, ...types)) count += n
  }
  return count / total
}

// Combined exposure across address + display-name levels, capped at 1.
// Sum (not max) because address and DN collisions affect different pupils.
function combinedExposure(addressLevels, dnLevels, total, ...types) {
  const addrFrac = weightedExposureFraction(addressLevels, total, ...types)
  const dnFrac   = weightedExposureFraction(dnLevels,   total, ...types)
  return Math.min(1, addrFrac + dnFrac)
}

// ---------------------------------------------------------------------------
// Uniqueness
// ---------------------------------------------------------------------------
export function scoreUniqueness(collisionPct) {
  if (collisionPct > 20) return 1
  if (collisionPct > 10) return 2
  if (collisionPct > 5)  return 3
  if (collisionPct > 1)  return 4
  return 5
}

function uniquenessRationale(score, stats) {
  const pct = stats.collisionPct.toFixed(1)
  const labels = ["", "Very high", "High", "Moderate", "Low", "Very low"]
  return `${labels[score]} collision risk. ${stats.collisions} collision${stats.collisions !== 1 ? "s" : ""} across ${stats.total} addresses (${pct}%).`
}

// ---------------------------------------------------------------------------
// GDPR — population-weighted across all cascade levels
// ---------------------------------------------------------------------------
export function scoreGDPR(addressLevels, dnLevels, totalPupils, mode) {
  const total = totalPupils || 1
  const exp = (...types) => combinedExposure(addressLevels, dnLevels, total, ...types)

  let deduction = 0
  deduction += exp("first")                  * 1
  deduction += exp("middle", "m")            * 1
  deduction += exp("last")                   * 1
  deduction += exp("yy", "yyyy")             * 1
  deduction += exp("school", "schoolname")   * 2
  if (mode === "pupil") deduction += 0.5

  return clamp(parseFloat((5 - deduction).toFixed(1)), 1, 5)
}

function pctLabel(fraction) {
  if (fraction <= 0) return null
  const p = Math.round(fraction * 100)
  return p < 1 ? "<1%" : `${p}%`
}

function gdprRationale(score, addressLevels, dnLevels, totalPupils, mode) {
  const total = totalPupils || 1

  const addrFrac = (...t) => weightedExposureFraction(addressLevels, total, ...t)
  const dnFrac   = (...t) => weightedExposureFraction(dnLevels,   total, ...t)

  const elements = [
    { label: "full first name",  addrF: addrFrac("first"),                dnF: dnFrac("first"),                weight: 1 },
    { label: "middle name",      addrF: addrFrac("middle", "m"),          dnF: dnFrac("middle", "m"),          weight: 1 },
    { label: "full surname",     addrF: addrFrac("last"),                 dnF: dnFrac("last"),                 weight: 1 },
    { label: "intake year",      addrF: addrFrac("yy", "yyyy"),          dnF: dnFrac("yy", "yyyy"),           weight: 1 },
    { label: "school/location",  addrF: addrFrac("school", "schoolname"), dnF: dnFrac("school", "schoolname"), weight: 2 },
  ].filter((e) => e.addrF + e.dnF > 0)

  if (elements.length === 0) {
    return "No personally identifiable data is exposed across any level of this convention. GDPR exposure is minimal."
  }

  const lines = elements.map((e) => {
    const parts = []
    const a = pctLabel(e.addrF), d = pctLabel(e.dnF)
    if (a) parts.push(`${a} of pupils via address`)
    if (d) parts.push(`${d} via display name`)
    const suffix = e.weight > 1 ? " (geographic — double weight)" : ""
    return `${e.label}${suffix}: ${parts.join(", ")}`
  })

  const hasSchool = elements.some((e) => e.label === "school/location")
  const geoNote   = hasSchool ? " School/location data carries double weight as it narrows where a pupil can be physically found." : ""

  const hasDnExposure = elements.some((e) => e.dnF > 0)
  const dnNote = hasDnExposure
    ? " Display name exposure is especially significant — it is visible to every recipient in their inbox and calendar, not just those who inspect the address."
    : ""

  return `Population-weighted PII exposure across all levels — ${lines.join("; ")}.${geoNote}${dnNote}`
}

// ---------------------------------------------------------------------------
// Safeguarding — population-weighted
// ---------------------------------------------------------------------------
export function scoreSafeguarding(addressLevels, dnLevels, totalPupils, mode) {
  const total = totalPupils || 1
  const primaryTokens = addressLevels[0]?.tokens ?? []
  const exp = (...types) => combinedExposure(addressLevels, dnLevels, total, ...types)

  let score = 5
  score -= exp("first")                * 1
  score -= exp("middle", "m")          * 0.5
  score -= exp("last")                 * 1
  score -= exp("school", "schoolname") * 1
  score -= exp("yy", "yyyy")           * 0.5
  if (!hasRandom(primaryTokens))       score -= 1
  if (mode === "pupil")                score -= 0.5

  return clamp(parseFloat(score.toFixed(1)), 1, 5)
}

function safeguardingRationale(score, addressLevels, dnLevels, totalPupils, mode) {
  const total = totalPupils || 1
  const primaryTokens = addressLevels[0]?.tokens ?? []

  const addrFrac = (...t) => weightedExposureFraction(addressLevels, total, ...t)
  const dnFrac   = (...t) => weightedExposureFraction(dnLevels,   total, ...t)

  const factors = []

  const nameAddrF = Math.max(addrFrac("first"), addrFrac("last"))
  const nameDnF   = Math.max(dnFrac("first"),   dnFrac("last"))
  if (nameAddrF + nameDnF > 0) {
    const hasMiddle = addrFrac("middle", "m") + dnFrac("middle", "m") > 0
    const via = []
    if (nameAddrF > 0) via.push(`${pctLabel(nameAddrF)} of pupils via address`)
    if (nameDnF   > 0) via.push(`${pctLabel(nameDnF)} via display name`)
    factors.push(`${hasMiddle ? "Full name (including middle name)" : "Full name"} exposed for ${via.join(", ")} — makes pupils identifiable`)
  }

  const schoolAddrF = addrFrac("school", "schoolname")
  const schoolDnF   = dnFrac("school", "schoolname")
  if (schoolAddrF + schoolDnF > 0) {
    const via = []
    if (schoolAddrF > 0) via.push(`${pctLabel(schoolAddrF)} via address`)
    if (schoolDnF   > 0) via.push(`${pctLabel(schoolDnF)} via display name`)
    factors.push(`School revealed for ${via.join(", ")} — discloses which institution a pupil attends`)
  }

  const yearAddrF = addrFrac("yy", "yyyy")
  const yearDnF   = dnFrac("yy", "yyyy")
  if (yearAddrF + yearDnF > 0) {
    factors.push(`Intake year exposed for ${pctLabel(Math.min(1, yearAddrF + yearDnF))} of pupils — reveals approximate age`)
  }

  if (!hasRandom(primaryTokens)) {
    factors.push("Primary address format is fully predictable — addresses can be enumerated without a directory")
  }

  if (mode === "staff") return "Lower concern for staff. " + (factors[0] ?? "Pattern is reasonably safe.")
  if (factors.length === 0) return "No identifying information is exposed across the address or display name at any level. Low safeguarding concern."
  return factors.join(". ") + "."
}

// ---------------------------------------------------------------------------
// Recognisability — primary address pattern only
// ---------------------------------------------------------------------------
export function scoreRecognisability(tokens) {
  const hasFullFirst = hasToken(tokens, "first")
  const hasFullLast  = hasToken(tokens, "last")
  const hasInitFirst = hasToken(tokens, "f")
  const hasInitLast  = hasToken(tokens, "l")

  const nameScore =
    (hasFullFirst ? 2 : hasInitFirst ? 1 : 0) +
    (hasFullLast  ? 2 : hasInitLast  ? 1 : 0)

  return clamp(nameScore + 1, 1, 5)
}

function recognisabilityRationale(score, tokens) {
  const hasFullFirst = hasToken(tokens, "first")
  const hasFullLast  = hasToken(tokens, "last")
  const hasInitFirst = hasToken(tokens, "f")
  const hasInitLast  = hasToken(tokens, "l")

  const parts = []
  if (hasFullFirst) parts.push("full first name")
  else if (hasInitFirst) parts.push("first initial")
  if (hasFullLast)  parts.push("full surname")
  else if (hasInitLast)  parts.push("surname initial")

  if (parts.length === 0) {
    return "No name component in the primary pattern. The address is opaque — a pupil, parent, teacher or IT support person cannot tell who it belongs to without a directory lookup."
  }

  const presence = `Primary address includes ${parts.join(" and ")}.`
  const consequence = score >= 4
    ? " Anyone reading the address can immediately identify whose it is, making it practical for staff, parents and helpdesk triage without a directory lookup."
    : score === 3
    ? " The name signal is partial — most readers can make an educated guess at the owner, but confirmation may require a directory lookup."
    : " The name signal is minimal. The address hints at an identity but does not clearly convey it."

  return presence + consequence
}

// ---------------------------------------------------------------------------
// Guessability — primary address pattern only
// ---------------------------------------------------------------------------
function randomSearchSpace(tokens) {
  const SIZES = { NN: 100, NNN: 1000, NNNN: 10000, A: 26, AA: 676, AAA: 17576, AAAA: 456976 }
  return tokens.reduce((product, tok) => product * (SIZES[tok.type] ?? 1), 1)
}

export function scoreGuessability(tokens) {
  const space = randomSearchSpace(tokens)
  let score
  if (space >= 10000)     score = 5
  else if (space >= 1000) score = 4
  else if (space >= 100)  score = 3
  else if (space >= 26)   score = 2
  else                    score = 1

  const hasFullName = hasToken(tokens, "first") || hasToken(tokens, "last")
  const hasInitials = hasToken(tokens, "f", "l")
  if (!hasFullName && hasInitials) score = Math.min(5, score + 1)

  return clamp(score, 1, 5)
}

function guessabilityRationale(score, tokens) {
  const space = randomSearchSpace(tokens)
  const hasFullName = hasToken(tokens, "first") || hasToken(tokens, "last")
  const hasInitials = hasToken(tokens, "f", "l")

  const attemptsNote = space === 1
    ? "No random element in the primary pattern — an attacker with a name list can construct every address in a single pass."
    : `Random suffix gives ${space.toLocaleString("en-GB")} possible values per name combination — an attacker must attempt up to ${space.toLocaleString("en-GB")} addresses per target.`

  const nameNote = hasFullName
    ? "Full name components allow an attacker to anchor guesses to public name lists, reducing the effective search space."
    : hasInitials
    ? "Initials-only reduces the signal available to an attacker — mapping initials to specific pupils requires considerably more effort."
    : "No name component — addresses cannot be directly anchored to known individuals."

  return `${attemptsNote} ${nameNote}`
}

// ---------------------------------------------------------------------------
// UX — primary address pattern only
// ---------------------------------------------------------------------------
function maxRandomTokenSize(tokens) {
  const SIZES = { NN: 100, NNN: 1000, NNNN: 10000, A: 26, AA: 676, AAA: 17576, AAAA: 456976 }
  return tokens.reduce((max, tok) => Math.max(max, SIZES[tok.type] ?? 1), 1)
}

export function scoreUX(stats, tokens) {
  const maxSize = maxRandomTokenSize(tokens)
  let memorability
  if (maxSize === 1)        memorability = 3
  else if (maxSize <= 100)  memorability = 2
  else if (maxSize <= 1000) memorability = 1
  else                      memorability = 0

  const avg = stats.avgLength
  let length
  if (avg <= 22)      length = 2
  else if (avg <= 27) length = 1
  else                length = 0

  const underscorePenalty = tokens.some((t) => t.raw === "_") ? 0.5 : 0

  return clamp(Math.round(memorability + length - underscorePenalty), 1, 5)
}

function uxRationale(score, stats, tokens) {
  const avg = Math.round(stats.avgLength)
  const longest = Math.round(stats.longestLength)

  const lengthNote = avg <= 22
    ? `Short (${avg} chars average) — easy to type and communicate verbally.`
    : avg <= 27
    ? `Moderate length (${avg} chars average) — acceptable but not as easy to share verbally.`
    : `Long (${avg} chars average) — may cause difficulty for younger pupils or when typing on mobile.`

  const memorabilityNote = hasRandom(tokens)
    ? "Contains a random suffix — pupils must look up and memorise their address rather than deriving it from their name."
    : "Fully derivable from the pupil's name — no memorisation required."

  return `${lengthNote} Longest address: ${longest} chars. ${memorabilityNote}`
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
function summaryText(scores, stats, primaryTokens, mode) {
  const avg = (Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length).toFixed(1)
  const overallLabel =
    avg >= 4.5 ? "well-suited"
    : avg >= 3.5 ? "broadly suitable"
    : avg >= 2.5 ? "acceptable with caveats"
    : "not recommended"

  const weakAreas = Object.entries(scores)
    .filter(([, v]) => v <= 2)
    .map(([k]) => k.toLowerCase())

  let text = `This naming convention is ${overallLabel} for ${mode === "pupil" ? "pupil" : "staff"} email addresses.`
  if (weakAreas.length > 0) text += ` Significant concerns in: ${weakAreas.join(", ")}.`
  if (stats.collisions > 0) {
    text += ` ${stats.collisions} primary-level collision${stats.collisions !== 1 ? "s" : ""} detected.`
  }
  if (!hasRandom(primaryTokens) && stats.collisions > 0) {
    text += " The primary pattern has no random element, so automatic resolution requires a disambiguating fallback."
  }
  return text
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function computeScores(addressLevels, dnLevels, totalPupils, stats, mode) {
  const primaryTokens  = addressLevels[0]?.tokens ?? []

  const uniqueness      = scoreUniqueness(stats.collisionPct)
  const gdpr            = scoreGDPR(addressLevels, dnLevels, totalPupils, mode)
  const safeguarding    = scoreSafeguarding(addressLevels, dnLevels, totalPupils, mode)
  const recognisability = scoreRecognisability(primaryTokens)
  const guessability    = scoreGuessability(primaryTokens)
  const ux              = scoreUX(stats, primaryTokens)

  return {
    uniqueness:      { score: uniqueness,      rationale: uniquenessRationale(uniqueness, stats) },
    gdpr:            { score: gdpr,            rationale: gdprRationale(gdpr, addressLevels, dnLevels, totalPupils, mode) },
    safeguarding:    { score: safeguarding,    rationale: safeguardingRationale(safeguarding, addressLevels, dnLevels, totalPupils, mode) },
    recognisability: { score: recognisability, rationale: recognisabilityRationale(recognisability, primaryTokens) },
    guessability:    { score: guessability,    rationale: guessabilityRationale(guessability, primaryTokens) },
    ux:              { score: ux,              rationale: uxRationale(ux, stats, primaryTokens) },
    summary: summaryText({ uniqueness, gdpr, safeguarding, recognisability, guessability, ux }, stats, primaryTokens, mode),
  }
}

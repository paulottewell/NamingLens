import { clamp, pctLabel } from "../utils.js"
import {
  hasToken,
  weightedExposureFraction,
  combinedExposureProduct,
  isPupilStatusVisible,
} from "../exposure/piiHelpers.js"

export function scoreSafeguardingExposure(addressLevels, dnLevels, totalPupils, subdomainMode, mode) {
  const total = totalPupils || 1
  const primaryTokens = addressLevels[0]?.tokens ?? []

  const addrFrac = (...t) => weightedExposureFraction(addressLevels, total, ...t)
  const dnFrac   = (...t) => weightedExposureFraction(dnLevels,      total, ...t)
  const exp      = (...t) => combinedExposureProduct(addrFrac(...t), dnFrac(...t))

  let score = 5

  // Name components — full names make the pupil directly identifiable and contactable
  score -= exp("first")                * 1.0
  score -= exp("last")                 * 1.0
  score -= exp("middle", "m")          * 0.5

  // Institutional/contextual data — reveals where a child can be found
  score -= exp("school", "schoolname") * 1.0
  score -= exp("yy", "yyyy")           * 0.5

  // A fully predictable format can be enumerated from a name list without any directory
  const primaryHasRandom = hasToken(primaryTokens, "NN", "NNN", "NNNN", "A", "AA", "AAA", "AAAA", "seq")
  if (!primaryHasRandom) score -= 1.0

  // Visible pupil/student status in subdomain
  if (isPupilStatusVisible(subdomainMode)) score -= 0.5

  return {
    score: clamp(parseFloat(score.toFixed(1)), 1, 5),
    rationale: buildRationale(score, addressLevels, dnLevels, total, subdomainMode, primaryHasRandom),
  }
}

function buildRationale(score, addressLevels, dnLevels, total, subdomainMode, primaryHasRandom) {
  const addrFrac = (...t) => weightedExposureFraction(addressLevels, total, ...t)
  const dnFrac   = (...t) => weightedExposureFraction(dnLevels,      total, ...t)

  const factors = []

  const nameAddrF = Math.max(addrFrac("first"), addrFrac("last"))
  const nameDnF   = Math.max(dnFrac("first"),   dnFrac("last"))
  if (nameAddrF + nameDnF > 0) {
    const hasMiddle = addrFrac("middle", "m") + dnFrac("middle", "m") > 0
    const via = []
    if (nameAddrF > 0) via.push(`${pctLabel(nameAddrF)} of pupils via address`)
    if (nameDnF   > 0) via.push(`${pctLabel(nameDnF)} via display name`)
    factors.push(`${hasMiddle ? "Full name (including middle name)" : "Full name"} exposed for ${via.join(", ")} — makes pupils directly identifiable`)
  }

  const schAddrF = addrFrac("school", "schoolname")
  const schDnF   = dnFrac("school", "schoolname")
  if (schAddrF + schDnF > 0) {
    const via = []
    if (schAddrF > 0) via.push(`${pctLabel(schAddrF)} via address`)
    if (schDnF   > 0) via.push(`${pctLabel(schDnF)} via display name`)
    factors.push(`School name or code exposed for ${via.join(", ")} — discloses which institution a child attends`)
  }

  const yrAddrF = addrFrac("yy", "yyyy")
  const yrDnF   = dnFrac("yy", "yyyy")
  if (yrAddrF + yrDnF > 0) {
    const combined = Math.min(1, yrAddrF + yrDnF)
    factors.push(`Intake year exposed for ${pctLabel(combined)} of pupils — reveals approximate age`)
  }

  if (!primaryHasRandom) {
    factors.push("Primary address format is fully predictable — a third party with a name list can construct valid addresses without a directory")
  }

  if (isPupilStatusVisible(subdomainMode)) {
    factors.push("Subdomain explicitly identifies the account as a student account — visible in every sent and received message")
  }

  if (factors.length === 0) {
    return "No directly identifying information is exposed across the address or display name at any level. Low safeguarding concern."
  }
  return factors.join(". ") + "."
}

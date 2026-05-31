import { clamp, pctLabel } from "../utils.js"
import {
  weightedExposureFraction,
  combinedExposureProduct,
  isPupilStatusVisible,
} from "../exposure/piiHelpers.js"

// Context multiplier: external routable addresses are more exposed.
function contextMultiplier(subdomainMode) {
  // All school email is generally externally routable; school subdomain makes
  // location visible which increases the risk multiplier slightly.
  return subdomainMode === "school" ? 1.15 : 1.0
}

export function scorePrivacyDataMinimisation(addressLevels, dnLevels, totalPupils, subdomainMode, mode) {
  const total = totalPupils || 1

  const addrFrac = (...t) => weightedExposureFraction(addressLevels, total, ...t)
  const dnFrac   = (...t) => weightedExposureFraction(dnLevels,      total, ...t)

  // Product formula per PII element: 1 - (1 - addr)(1 - dn)
  const exp = (...t) => combinedExposureProduct(addrFrac(...t), dnFrac(...t))

  const cm = contextMultiplier(subdomainMode)

  let deduction = 0
  deduction += exp("first")                * 1.0 * cm
  deduction += exp("middle", "m")          * 1.0 * cm
  deduction += exp("last")                 * 1.0 * cm
  deduction += exp("yy", "yyyy")           * 1.0 * cm
  deduction += exp("school", "schoolname") * 2.0 * cm // geographic double-weight

  if (isPupilStatusVisible(subdomainMode)) deduction += 0.4

  const rawScore = clamp(parseFloat((5 - deduction).toFixed(1)), 1, 5)

  return {
    score: rawScore,
    rationale: buildRationale(rawScore, addressLevels, dnLevels, total, subdomainMode, mode),
  }
}

function buildRationale(score, addressLevels, dnLevels, total, subdomainMode, mode) {
  const addrFrac = (...t) => weightedExposureFraction(addressLevels, total, ...t)
  const dnFrac   = (...t) => weightedExposureFraction(dnLevels,      total, ...t)

  const elements = [
    { label: "full first name",  af: addrFrac("first"),                df: dnFrac("first") },
    { label: "middle name",      af: addrFrac("middle", "m"),          df: dnFrac("middle", "m") },
    { label: "full surname",     af: addrFrac("last"),                 df: dnFrac("last") },
    { label: "intake year",      af: addrFrac("yy", "yyyy"),          df: dnFrac("yy", "yyyy") },
    { label: "school/location",  af: addrFrac("school", "schoolname"), df: dnFrac("school", "schoolname"), geo: true },
  ].filter((e) => e.af + e.df > 0)

  if (elements.length === 0) {
    return "No personally identifiable data is exposed across any level of this convention. " +
      "Note: this assessment covers email address and display name patterns only — GDPR compliance " +
      "also depends on lawful basis, transparency notices, access controls, retention and DPIAs."
  }

  const lines = elements.map((e) => {
    const parts = []
    const a = pctLabel(e.af), d = pctLabel(e.df)
    if (a) parts.push(`${a} of pupils via address`)
    if (d) parts.push(`${d} via display name`)
    const suffix = e.geo ? " (geographic — double weight)" : ""
    return `${e.label}${suffix}: ${parts.join(", ")}`
  })

  const hasDn   = elements.some((e) => e.df > 0)
  const hasGeo  = elements.some((e) => e.geo)
  const hasPupilMarker = isPupilStatusVisible(subdomainMode)

  let r = `Population-weighted PII exposure across all levels — ${lines.join("; ")}.`
  if (hasGeo) r += " School/location data carries double weight as it narrows the physical location of a pupil."
  if (hasDn)  r += " Display name exposure is especially significant — it is visible to every recipient in their inbox and calendar."
  if (hasPupilMarker) r += " The subdomain explicitly identifies the account holder as a student, adding to privacy exposure."
  r += " This score assesses data minimisation implications only — it is not a legal compliance determination."
  return r
}
